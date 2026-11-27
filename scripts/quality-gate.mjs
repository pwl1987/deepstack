import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATEGORIES = ["format", "lint", "type", "test", "security"];
const REPORT_STATUS = new Set(["PASS", "FAIL", "NOT_CONFIGURED", "SKIPPED", "NOT_RUN", "TIMEOUT", "REJECTED"]);

function usage() {
  console.error("Usage: node scripts/quality-gate.mjs <plan|validate|run> ...");
  console.error("  plan <repo> [--manifest <file>]");
  console.error("  validate <report.json>");
  console.error("  run <repo> --manifest <file> --mode <readonly|write-authorized> [--category <name>] [--component <id>] [--allow-command <cmd>] [--timeout-ms <n>]");
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

function plan(repoInput, manifestInput = null) {
  if (manifestInput) {
    const manifest = readJson(path.resolve(manifestInput));
    if (manifest.schema === 2) {
      const components = {};
      for (const [id, component] of Object.entries(manifest.components || {})) {
        components[id] = Object.fromEntries(CATEGORIES.map(category => [category,
          component.allow?.[category] ? { status: "NOT_RUN", command: component.allow[category] }
            : { status: "NOT_CONFIGURED", command: null }]));
      }
      const result = { schema: 2, command: "plan", status: "NOT_RUN", components };
      console.log(JSON.stringify(result, null, 2));
      return result;
    }
  }
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

// Schema 2: explicitly configured, trusted, argv-based commands for mixed stacks.
// This is a command runner, NOT a sandbox. The repository's tracked manifest is trusted code.
const UNSAFE_EXECUTABLES = new Set(["sh", "bash", "dash", "zsh", "fish", "pwsh", "powershell", "cmd", "cmd.exe"]);
function within(base, file) {
  const relative = path.relative(base, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function trackedManifest(repo, manifestFile) {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: repo, encoding: "utf8", shell: false,
  });
  if (gitRoot.status !== 0) return false;
  let root;
  let repoReal;
  let full;
  try {
    root = fs.realpathSync(gitRoot.stdout.trim());
    repoReal = fs.realpathSync(repo);
    full = fs.realpathSync(manifestFile);
  } catch {
    return false;
  }
  if (!within(root, full) || !within(repoReal, full)) return false;
  const relative = path.relative(root, full).split(path.sep).join("/");
  // An index entry (even `git add -N`) does not establish authorization.
  // Only the exact committed policy bytes may authorize a spawned command.
  const committed = spawnSync("git", ["show", `HEAD:${relative}`], {
    cwd: root, encoding: null, shell: false, timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  if (committed.status !== 0) return false;
  try {
    const live = fs.readFileSync(full);
    return live.length <= 1024 * 1024 && Buffer.isBuffer(committed.stdout) &&
      live.equals(committed.stdout);
  } catch { return false; }
}
function componentCommand(repo, manifest, options) {
  if (options.allowCommand) return { status: "REJECTED", reason: "dynamic-command-override-forbidden" };
  const id = options.component;
  if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return { status: "REJECTED", reason: "component-required" };
  const component = manifest.components?.[id];
  if (!component) return { status: "REJECTED", reason: "unknown-component" };
  const command = component.allow?.[options.category || "test"];
  if (!command) return { status: "NOT_CONFIGURED", reason: "no-authorized-command" };
  if (typeof command !== "object" || Array.isArray(command)) return { status: "REJECTED", reason: "invalid-command" };
  const executable = command.executable;
  const args = command.args;
  if (typeof executable !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(executable) ||
      UNSAFE_EXECUTABLES.has(executable.toLowerCase()) || !Array.isArray(args) ||
      args.length > 128 || args.some(arg => typeof arg !== "string" || arg.includes("\0") || arg.length > 4096)) {
    return { status: "REJECTED", reason: "invalid-argv" };
  }
  const relativeCwd = component.cwd ?? ".";
  if (typeof relativeCwd !== "string" || !relativeCwd.length || path.isAbsolute(relativeCwd)) {
    return { status: "REJECTED", reason: "invalid-cwd" };
  }
  const cwd = path.resolve(repo, relativeCwd);
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) return { status: "REJECTED", reason: "missing-cwd" };
  const realRoot = fs.realpathSync(repo), realCwd = fs.realpathSync(cwd);
  if (realRoot !== realCwd && !within(realRoot, realCwd)) return { status: "REJECTED", reason: "cwd-escape" };
  return { status: "AUTHORIZED", executable, args, cwd, component: id };
}
function runComponent(repo, manifest, options) {
  const category = options.category || "test";
  const mode = options.mode || "write-authorized";
  if (!CATEGORIES.includes(category) || !["readonly", "write-authorized"].includes(mode)) {
    return { schema: 2, command: "run", status: "REJECTED", reason: "invalid-mode-or-category" };
  }
  if (!trackedManifest(repo, path.resolve(options.manifest))) {
    return { schema: 2, command: "run", status: "REJECTED", reason: "manifest-not-identical-to-committed-HEAD" };
  }
  if (mode === "readonly" && (manifest.readonlySkipCategories || ["format"]).includes(category)) {
    return { schema: 2, command: "run", category, status: "SKIPPED", reason: "readonly-skip" };
  }
  const spec = componentCommand(repo, manifest, { ...options, category });
  if (spec.status !== "AUTHORIZED") return { schema: 2, command: "run", category, component: options.component, ...spec };
  const timeoutMs = Number(options.timeoutMs || 30_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 3_600_000) {
    return { schema: 2, command: "run", status: "REJECTED", reason: "invalid-timeout" };
  }
  const started = Date.now();
  const child = spawnSync(spec.executable, spec.args, {
    cwd: spec.cwd, encoding: "utf8", shell: false, timeout: timeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const status = child.error?.code === "ETIMEDOUT" ? "TIMEOUT"
    : child.error?.code === "ENOENT" ? "NOT_CONFIGURED"
    : child.status === 0 ? "PASS" : "FAIL";
  return { schema: 2, command: "run", category, component: spec.component,
    status, executable: spec.executable, args: spec.args, cwd: spec.cwd,
    exitCode: child.status, elapsedMs: Date.now() - started,
    stdoutTail: (child.stdout || "").slice(-400),
    stderrTail: (child.stderr || child.error?.message || "").slice(-400) };
}

function runCategory(repoInput, options) {
  const repo = path.resolve(repoInput);
  const manifest = readJson(path.resolve(options.manifest));
  if (manifest.schema === 2) {
    const result = runComponent(repo, manifest, options);
    console.log(JSON.stringify(result));
    if (["FAIL", "TIMEOUT", "REJECTED"].includes(result.status)) process.exitCode = 1;
    return result;
  }
  const mode = options.mode || "write-authorized";
  const category = options.category || "test";
  const timeoutMs = Number(options.timeoutMs || 30_000);
  if (!["readonly", "write-authorized"].includes(mode)) throw new Error(`invalid mode: ${mode}`);
  if (!trackedManifest(repo, path.resolve(options.manifest))) {
    const result = { schema: 1, action: "run", repo, mode, category, status: "REJECTED", command: null, reason: "manifest-not-identical-to-committed-HEAD" };
    console.log(JSON.stringify(result));
    process.exitCode = 1;
    return result;
  }
  if (mode === "readonly" && (manifest.readonlySkipCategories || []).includes(category)) {
    const result = { schema: 1, action: "run", repo, mode, category, status: "SKIPPED", reason: "readonly-skip", command: null };
    console.log(JSON.stringify(result));
    return result;
  }
  let command = options.allowCommand || manifest.allow?.[category];
  if (!command) {
    const discovered = commandFor(repo, category);
    command = discovered.command;
    if (!command) {
      const result = { schema: 1, action: "run", repo, mode, category, status: "NOT_CONFIGURED", command: null };
      console.log(JSON.stringify(result));
      return result;
    }
  }
  const trust = trustCommand(repo, command, manifest, category);
  if (!trust.ok) {
    const result = { schema: 1, action: "run", repo, mode, category, status: "REJECTED", command, reason: trust.reason };
    console.log(JSON.stringify(result));
    process.exitCode = 1;
    return result;
  }
  const executed = execute(repo, command, timeoutMs);
  const result = {
    schema: 1,
    action: "run",
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
  if (["FAIL", "TIMEOUT", "REJECTED"].includes(result.status)) process.exitCode = 1;
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
    else if (token === "--component") options.component = argv[++index];
    else if (token === "--allow-command") options.allowCommand = argv[++index];
    else if (token === "--timeout-ms") options.timeoutMs = argv[++index];
    else throw new Error(`unknown run option: ${token}`);
  }
  if (!repo || !options.manifest) throw new Error("run requires <repo> --manifest <file>");
  return { repo, options };
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "plan" && rest[0]) {
    const ix = rest.indexOf("--manifest");
    plan(rest[0], ix >= 0 ? rest[ix + 1] : null);
  }
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