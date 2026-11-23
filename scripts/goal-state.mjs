import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOAL_SCHEMA = 1;
const REQUIRED = ["schema", "status", "goal", "scope", "non_goals", "constraints", "acceptance", "current_phase", "evidence", "blockers", "next_step", "updated_at"];
const STATUSES = new Set(["active", "blocked", "complete"]);

function usage() {
  console.error("Usage: node scripts/goal-state.mjs <adapter|init|validate|update|summary> ...");
  process.exitCode = 2;
}

function value(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function values(args, name) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1] !== undefined) result.push(args[index + 1]);
  }
  return result;
}

function has(args, name) {
  return args.includes(name);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function checkpointPath(input) {
  const resolved = path.resolve(input);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return path.join(resolved, ".deepstack", "goal.md");
  return resolved;
}

function encode(valueToWrite) {
  return JSON.stringify(valueToWrite);
}

function parseCheckpoint(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") throw new Error("missing frontmatter");
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error("unterminated frontmatter");
  const data = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([a-z][a-z0-9_]*):\s*(.*)$/);
    if (!match) throw new Error(`invalid frontmatter line: ${line}`);
    try {
      data[match[1]] = JSON.parse(match[2]);
    } catch {
      throw new Error(`frontmatter value must be JSON: ${match[1]}`);
    }
  }
  return { data, body: lines.slice(end + 1).join("\n") };
}

function validateData(data) {
  const errors = [];
  for (const key of REQUIRED) if (!(key in data)) errors.push(`missing ${key}`);
  if (data.schema !== GOAL_SCHEMA) errors.push(`schema must be ${GOAL_SCHEMA}`);
  if (!STATUSES.has(data.status)) errors.push("status must be active, blocked, or complete");
  for (const key of ["goal", "scope", "current_phase", "next_step", "updated_at"]) {
    if (typeof data[key] !== "string" || !data[key].trim()) errors.push(`${key} must be a non-empty string`);
  }
  for (const key of ["non_goals", "constraints", "acceptance", "evidence", "blockers"]) {
    if (!Array.isArray(data[key]) || data[key].some((item) => typeof item !== "string")) errors.push(`${key} must be an array of strings`);
  }
  if (data.status === "blocked" && data.blockers.length === 0) errors.push("blocked status requires at least one blocker");
  if (data.status === "complete" && data.acceptance.length === 0) errors.push("complete status requires acceptance criteria");
  return errors;
}

function render(data) {
  const fields = REQUIRED.map((key) => `${key}: ${encode(data[key])}`).join("\n");
  return `---\n${fields}\n---\n# DeepStack Goal Checkpoint\n\nThis file is a fallback checkpoint. Native host Goal/session state remains authoritative when available.\n`;
}

function writeCheckpoint(file, data) {
  const errors = validateData(data);
  if (errors.length) throw new Error(errors.join("; "));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render(data));
}

function now() {
  return new Date().toISOString();
}

function adapter(host) {
  const capabilities = readJson("evals/host-capabilities.json");
  const adapters = readJson("evals/goal-adapters.json");
  const capability = capabilities.hosts.find((item) => item.id === host);
  const goalAdapter = adapters.adapters.find((item) => item.host === host);
  if (!capability || !goalAdapter) throw new Error(`unknown host: ${host}`);
  const confirmed = new Set(capability.confirmed || []);
  const nativeGoal = confirmed.has("native-goal");
  const recovery = goalAdapter.recovery === "verified" || confirmed.has("session-recovery");
  const result = {
    schema: 1,
    host,
    nativeGoal,
    sessionRecovery: recovery,
    adapter: goalAdapter,
    confirmed: capability.confirmed,
    unknown: capability.unknown,
    recommendation: nativeGoal ? goalAdapter.entry : "fallback checkpoint only when explicitly requested",
    status: nativeGoal ? "READY" : "ROUTER_UNVERIFIED",
  };
  console.log(JSON.stringify(result, null, 2));
}

function init(repo, args) {
  const file = checkpointPath(repo);
  if (fs.existsSync(file) && !has(args, "--force")) throw new Error(`checkpoint exists: ${file}; use --force only for an explicit reset`);
  const list = (flag, fallback = []) => values(args, flag).length ? values(args, flag) : fallback;
  const data = {
    schema: GOAL_SCHEMA,
    status: value(args, "--status", "active"),
    goal: value(args, "--goal"),
    scope: value(args, "--scope", "current repository"),
    non_goals: list("--non-goal"),
    constraints: list("--constraint"),
    acceptance: list("--acceptance"),
    current_phase: value(args, "--phase", "1"),
    evidence: list("--evidence"),
    blockers: list("--blocker"),
    next_step: value(args, "--next-step", "define the next verifiable phase"),
    updated_at: now(),
  };
  if (!data.goal || !data.acceptance.length) throw new Error("init requires --goal and at least one --acceptance");
  writeCheckpoint(file, data);
  console.log(JSON.stringify({ ok: true, command: "init", file, data }, null, 2));
}

function validate(fileInput) {
  const file = checkpointPath(fileInput);
  const { data } = parseCheckpoint(file);
  const errors = validateData(data);
  if (errors.length) throw new Error(`${file}: ${errors.join("; ")}`);
  console.log(JSON.stringify({ ok: true, command: "validate", file, status: data.status, phase: data.current_phase }, null, 2));
}

function update(fileInput, args) {
  const file = checkpointPath(fileInput);
  const parsed = parseCheckpoint(file);
  const data = parsed.data;
  const scalarFlags = [["--status", "status"], ["--phase", "current_phase"], ["--next-step", "next_step"], ["--goal", "goal"], ["--scope", "scope"]];
  for (const [flag, key] of scalarFlags) if (value(args, flag) !== undefined) data[key] = value(args, flag);
  for (const [flag, key] of [["--evidence", "evidence"], ["--blocker", "blockers"], ["--acceptance", "acceptance"], ["--constraint", "constraints"], ["--non-goal", "non_goals"]]) {
    data[key] = [...data[key], ...values(args, flag)];
  }
  data.updated_at = now();
  writeCheckpoint(file, data);
  console.log(JSON.stringify({ ok: true, command: "update", file, status: data.status, phase: data.current_phase }, null, 2));
}

function summary(fileInput) {
  const file = checkpointPath(fileInput);
  const { data } = parseCheckpoint(file);
  const errors = validateData(data);
  console.log(JSON.stringify({ ok: errors.length === 0, command: "summary", file, status: data.status, phase: data.current_phase, goal: data.goal, next_step: data.next_step, evidence_count: data.evidence.length, blockers: data.blockers, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
}

const [command, target, ...args] = process.argv.slice(2);
try {
  if (!command) usage();
  else if (command === "adapter" && target) adapter(target);
  else if (command === "init" && target) init(target, args);
  else if (command === "validate" && target) validate(target);
  else if (command === "update" && target) update(target, args);
  else if (command === "summary" && target) summary(target);
  else usage();
} catch (error) {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
}
