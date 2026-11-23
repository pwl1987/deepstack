import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATEGORIES = ["format", "lint", "type", "test", "security"];
const REPORT_STATUS = new Set(["PASS", "FAIL", "NOT_CONFIGURED", "SKIPPED", "NOT_RUN", "TIMEOUT", "REJECTED"]);

function usage() {
  console.error("Usage: node scripts/quality-gate.mjs <plan|validate|run> ...");
  console.error("  plan <repo>");
  console.error("  validate <report.json>");
  console.error("  run <repo> --manifest <file> --mode <readonly|write-authorized> [--category <name>] [--allow-command <cmd>] [--timeout-ms <n>]");
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
      format: ["format:check", "format", "fmt", "prettier", "format:write"],
      lint: ["lint", "check:lint"],
      type: ["typecheck", "type-check", "check-types", "tsc"],
      test: ["test", "test:unit", "test:pass", "test:fail"],
      security: ["security", "check:security", "audit"],
    };
    const key = aliases[category].find((candidate) => scripts[candidate]);
    if (key) {
      return { status: "NOT_RUN", command: `npm run ${key}`, source: `package.json#scripts.${key}` };
    }
  }
  return { status: "NOT_CONFIGURED", command: null, source: null };
}

function unsafeShell(command) {
  return /[;&|`$><]/.test(command) || command.includes("\n");
}

function trustCommand(repo, command, manifest, category) {
  if (!command) return { ok: false, reason: "missing-command" };
  if (unsafeShell(command)) return { ok: false, reason: "unsafe-shell-metacharacters" };
  const match = command.match(/^npm run ([a-zA-Z0-9:_-]+)$/);
  if (!match) return { ok: false, reason: "unsupported-command-shape" };
  const script = match[1];
  const packageFile = path.join(repo, "package.json");
  if (!fs.existsSync(packageFile)) return { ok: false, reason: "missing-package-json" };
  const scripts = readJson(packageFile).scripts || {};
  if (!scripts[script]) return { ok: false, reason: "script-not-in-package-json" };
  const allowed = manifest?.allow?.[category];
  if (allowed !== command) return { ok: false, reason: "command-not-in-manifest" };
  return { ok: true, script };
}

function execute(repo, command, timeoutMs) {
  const started = Date.now();
  const child = spawnSync("npm", ["run", command.match(/^npm run ([a-zA-Z0-9:_-]+)$/)[1]], {
    cwd: repo,
    encoding: "utf8",
    timeout: timeoutMs,
    shell: false,
  });
  const elapsedMs = Date.now() - started;
  if (child.error?.code === "ETIMEDOUT") {
    return { status: "TIMEOUT", exitCode: null, elapsedMs, stdout: child.stdout || "", stderr: child.stderr || "" };
  }
  const status = child.status === 0 ? "PASS" : "FAIL";
  return { status, exitCode: child.status, elapsedMs, stdout: child.stdout || "", stderr: child.stderr || "" };
}

function plan(repoInput) {
  const repo = path.resolve(repoInput);
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) throw new Error(`repository directory not found: ${repo}`);
  const checks = Object.fromEntries(CATEGORIES.map((category) => [category, commandFor(repo, category)]));
  const configured = CATEGORIES.filter((category) => checks[category].status === "NOT_RUN");
  const result = {
    schema: 1,
    command: "plan",
    repo,
    status: "NOT_RUN",
    checks,
    configured,
    unverified: configured.map((category) => `${category}: command discovered but not executed`),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function validateReport(reportInput) {
  const report = readJson(path.resolve(reportInput));
  const errors = [];
  if (report.schema !== 1 || !report.checks) errors.push("report requires schema 1 and checks");
  for (const category of CATEGORIES) {
    const item = report.checks?.[category];
    if (!item) errors.push(`missing check: ${category}`);
    else if (!REPORT_STATUS.has(item.status)) errors.push(`${category}: invalid status ${item.status}`);
    else if (item.status === "PASS" && !item.command) errors.push(`${category}: PASS requires command`);
  }
  const payload = { ok: errors.length === 0, command: "validate", errors };
  console.log(JSON.stringify(payload, null, 2));
  if (errors.length) process.exitCode = 1;
  return payload;
}

function runCategory(repoInput, options) {
  const repo = path.resolve(repoInput);
  const manifest = readJson(path.resolve(options.manifest));
  const mode = options.mode || "write-authorized";
  const category = options.category || "test";
  const timeoutMs = Number(options.timeoutMs || 30_000);
  if (!["readonly", "write-authorized"].includes(mode)) throw new Error(`invalid mode: ${mode}`);
  if (mode === "readonly" && (manifest.readonlySkipCategories || []).includes(category)) {
    const result = { schema: 1, command: "run", repo, mode, category, status: "SKIPPED", reason: "readonly-skip", command: null };
    console.log(JSON.stringify(result));
    return result;
  }
  let command = options.allowCommand || manifest.allow?.[category];
  if (!command) {
    const discovered = commandFor(repo, category);
    command = discovered.command;
    if (!command) {
      const result = { schema: 1, command: "run", repo, mode, category, status: "NOT_CONFIGURED", command: null };
      console.log(JSON.stringify(result));
      return result;
    }
  }
  const trust = trustCommand(repo, command, manifest, category);
  if (!trust.ok) {
    const result = { schema: 1, command: "run", repo, mode, category, status: "REJECTED", command, reason: trust.reason };
    console.log(JSON.stringify(result));
    return result;
  }
  const executed = execute(repo, command, timeoutMs);
  const result = {
    schema: 1,
    command: "run",
    repo,
    mode,
    category,
    status: executed.status,
    command,
    exitCode: executed.exitCode,
    elapsedMs: executed.elapsedMs,
    stdoutTail: executed.stdout.slice(-400),
    stderrTail: executed.stderr.slice(-400),
  };
  console.log(JSON.stringify(result));
  return result;
}

function parseRunArgs(argv) {
  const repo = argv[0];
  const options = { timeoutMs: 30_000 };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--manifest") options.manifest = argv[++index];
    else if (token === "--mode") options.mode = argv[++index];
    else if (token === "--category") options.category = argv[++index];
    else if (token === "--allow-command") options.allowCommand = argv[++index];
    else if (token === "--timeout-ms") options.timeoutMs = argv[++index];
    else throw new Error(`unknown run option: ${token}`);
  }
  if (!repo || !options.manifest) throw new Error("run requires <repo> --manifest <file>");
  return { repo, options };
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "plan" && rest[0]) plan(rest[0]);
  else if (command === "validate" && rest[0]) validateReport(rest[0]);
  else if (command === "run") {
    const { repo, options } = parseRunArgs(rest);
    runCategory(repo, options);
  }
  else usage();
} catch (error) {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
}