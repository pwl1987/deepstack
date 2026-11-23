import fs from "node:fs";
import path from "node:path";

const CATEGORIES = ["format", "lint", "type", "test", "security"];
const STATUS = new Set(["PASS", "FAIL", "NOT_CONFIGURED", "SKIPPED"]);

function usage() {
  console.error("Usage: node scripts/quality-gate.mjs <plan|validate> <repo-or-report>");
  process.exitCode = 2;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function commandFor(repo, category) {
  const packageFile = path.join(repo, "package.json");
  if (fs.existsSync(packageFile)) {
    const pkg = readJson(packageFile);
    const scripts = pkg.scripts || {};
    const aliases = {
      format: ["format:check", "format", "fmt", "prettier"],
      lint: ["lint", "check:lint"],
      type: ["typecheck", "type-check", "check-types", "tsc"],
      test: ["test", "test:unit"],
      security: ["security", "check:security", "audit"],
    };
    const key = aliases[category].find((candidate) => scripts[candidate]);
    if (key) {
      const manager = fs.existsSync(path.join(repo, "pnpm-lock.yaml")) ? "pnpm" : fs.existsSync(path.join(repo, "yarn.lock")) ? "yarn" : fs.existsSync(path.join(repo, "bun.lockb")) ? "bun" : "npm";
      return { status: "NOT_RUN", command: `${manager} run ${key}`, source: `package.json#scripts.${key}` };
    }
  }
  for (const file of ["Makefile", "makefile", "GNUmakefile", "justfile"]) {
    const candidate = path.join(repo, file);
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8");
    const aliases = { format: ["format", "fmt", "check-format"], lint: ["lint", "check-lint"], type: ["typecheck", "type-check", "check-types"], test: ["test", "check"], security: ["security", "audit"] };
    const target = aliases[category].find((name) => new RegExp(`^${name}:`, "m").test(text));
    if (target) return { status: "NOT_RUN", command: file === "justfile" ? `just ${target}` : `make ${target}`, source: `${file}:${target}` };
  }
  if (fs.existsSync(path.join(repo, "Cargo.toml"))) {
    const cargo = { format: "cargo fmt --check", lint: "cargo clippy --all-targets --all-features -- -D warnings", type: "cargo check", test: "cargo test" };
    if (cargo[category]) return { status: "NOT_RUN", command: cargo[category], source: "Cargo.toml" };
  }
  if (fs.existsSync(path.join(repo, "go.mod"))) {
    const go = { format: "gofmt -l .", lint: "go vet ./...", test: "go test ./..." };
    if (go[category]) return { status: "NOT_RUN", command: go[category], source: "go.mod" };
  }
  const pyproject = path.join(repo, "pyproject.toml");
  if (fs.existsSync(pyproject)) {
    const text = fs.readFileSync(pyproject, "utf8");
    const python = {
      format: text.includes("[tool.ruff") || text.includes("[tool.black") ? "python -m ruff format --check ." : null,
      lint: text.includes("[tool.ruff") ? "python -m ruff check ." : text.includes("[tool.flake8") ? "python -m flake8 ." : null,
      type: text.includes("[tool.mypy") ? "python -m mypy ." : null,
      test: text.includes("[tool.pytest") ? "python -m pytest" : null,
    };
    if (python[category]) return { status: "NOT_RUN", command: python[category], source: "pyproject.toml" };
  }
  if ((fs.existsSync(path.join(repo, "mvnw")) || fs.existsSync(path.join(repo, "pom.xml"))) && category === "test") return { status: "NOT_RUN", command: fs.existsSync(path.join(repo, "mvnw")) ? "./mvnw test" : "mvn test", source: "Maven" };
  if ((fs.existsSync(path.join(repo, "gradlew")) || fs.existsSync(path.join(repo, "build.gradle")) || fs.existsSync(path.join(repo, "build.gradle.kts"))) && category === "test") return { status: "NOT_RUN", command: fs.existsSync(path.join(repo, "gradlew")) ? "./gradlew test" : "gradle test", source: "Gradle" };
  return { status: "NOT_CONFIGURED", command: null, source: null };
}

function plan(repoInput) {
  const repo = path.resolve(repoInput);
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) throw new Error(`repository directory not found: ${repo}`);
  const checks = Object.fromEntries(CATEGORIES.map((category) => [category, commandFor(repo, category)]));
  const configured = CATEGORIES.filter((category) => checks[category].status === "NOT_RUN");
  const result = { schema: 1, command: "plan", repo, status: "NOT_RUN", checks, configured, unverified: configured.map((category) => `${category}: command discovered but not executed`) };
  console.log(JSON.stringify(result, null, 2));
}

function validate(reportInput) {
  const report = readJson(path.resolve(reportInput));
  const errors = [];
  if (report.schema !== 1 || !report.checks) errors.push("report requires schema 1 and checks");
  for (const category of CATEGORIES) {
    const item = report.checks?.[category];
    if (!item) errors.push(`missing check: ${category}`);
    else if (!STATUS.has(item.status)) errors.push(`${category}: invalid status ${item.status}`);
    else if (item.status === "PASS" && !item.command) errors.push(`${category}: PASS requires command`);
  }
  console.log(JSON.stringify({ ok: errors.length === 0, command: "validate", errors }, null, 2));
  if (errors.length) process.exitCode = 1;
}

const [command, target] = process.argv.slice(2);
try {
  if (command === "plan" && target) plan(target);
  else if (command === "validate" && target) validate(target);
  else usage();
} catch (error) {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
}
