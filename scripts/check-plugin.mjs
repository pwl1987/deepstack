import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function readJsonFile(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: invalid or unreadable JSON (${error.message})`);
    return null;
  }
}

function readJson(relativePath) {
  const file = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: invalid or unreadable JSON (${error.message})`);
    return null;
  }
}

const manifests = ["plugin.json", ".claude-plugin/plugin.json", ".zcode-plugin/plugin.json"]
  .filter((file) => fs.existsSync(path.join(root, file)))
  .map((file) => ({ file, value: readJson(file) }))
  .filter(({ value }) => value);

if (!manifests.length) errors.push("no plugin manifest found");

const canonical = manifests[0]?.value;
for (const { file, value } of manifests) {
  for (const key of ["name", "version"]) {
    if (!value[key]) errors.push(`${file}: missing ${key}`);
    if (canonical?.[key] && value[key] !== canonical[key]) {
      errors.push(`${file}: ${key} differs from canonical manifest`);
    }
  }
}

const marketplace = readJsonFile(".claude-plugin/marketplace.json");
const marketplacePlugin = marketplace?.plugins?.find((plugin) => plugin.name === canonical?.name);
if (!marketplacePlugin) {
  errors.push(".claude-plugin/marketplace.json: missing plugin entry for canonical plugin");
} else {
  for (const key of ["name", "version", "description"]) {
    if (!marketplacePlugin[key]) errors.push(`.claude-plugin/marketplace.json: plugin entry missing ${key}`);
    if (canonical?.[key] && marketplacePlugin[key] !== canonical[key]) {
      errors.push(`.claude-plugin/marketplace.json: plugin ${key} differs from canonical manifest`);
    }
  }
}

const skillsRoot = path.join(root, "skills");
const skillDirs = fs.existsSync(skillsRoot)
  ? fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];
const names = new Set();

function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...markdownFiles(file));
    else if (entry.isFile() && file.endsWith(".md")) result.push(file);
  }
  return result;
}

function parseFrontmatter(text, relativePath) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") {
    errors.push(`${relativePath}: missing frontmatter`);
    return {};
  }
  const end = lines.indexOf("---", 1);
  if (end < 0) {
    errors.push(`${relativePath}: unterminated frontmatter`);
    return {};
  }
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return fields;
}

for (const dir of skillDirs) {
  const relativePath = path.join("skills", dir.name, "SKILL.md");
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    errors.push(`${relativePath}: missing SKILL.md`);
    continue;
  }
  const fields = parseFrontmatter(fs.readFileSync(file, "utf8"), relativePath);
  if (!fields.name) errors.push(`${relativePath}: missing frontmatter name`);
  if (!fields.description) errors.push(`${relativePath}: missing frontmatter description`);
  if (dir.name === "deepstack" && fields["disable-model-invocation"] !== "true") {
    errors.push(`${relativePath}: router must disable model invocation`);
  }
  if (dir.name !== "deepstack" && fields["user-invocable"] !== "false") {
    errors.push(`${relativePath}: internal skill must set user-invocable: false`);
  }
  if (fields.name && fields.name !== dir.name) {
    errors.push(`${relativePath}: name '${fields.name}' does not match directory '${dir.name}'`);
  }
  if (fields.name && names.has(fields.name)) errors.push(`${relativePath}: duplicate skill name '${fields.name}'`);
  if (fields.name) names.add(fields.name);
}

if (!fs.existsSync(skillsRoot)) errors.push("skills/: missing directory");
if (!fs.existsSync(path.join(root, "scripts", "model-policy.mjs"))) {
  errors.push("scripts/model-policy.mjs: missing deterministic model policy preflight");
}
if (!fs.existsSync(path.join(root, "scripts", "readonly-guard.mjs"))) {
  errors.push("scripts/readonly-guard.mjs: missing readonly baseline guard");
}
for (const script of ["goal-state.mjs", "quality-gate.mjs"]) {
  if (!fs.existsSync(path.join(root, "scripts", script))) errors.push(`scripts/${script}: missing deterministic workflow helper`);
}

const routeCases = readJsonFile("evals/router-cases.json");
const allowedRoutes = new Set(["investigation", "pickup", "delivery", "goal", "bug-fix", "refactor", "feature"]);
if (!routeCases || routeCases.version !== 1 || !Array.isArray(routeCases.cases)) {
  errors.push("evals/router-cases.json: expected version 1 and a cases array");
} else {
  const caseIds = new Set();
  const routes = new Set();
  if (routeCases.cases.length < 7) errors.push("evals/router-cases.json: need at least one case per route");
  for (const item of routeCases.cases) {
    if (!item.id || caseIds.has(item.id)) errors.push("evals/router-cases.json: duplicate or missing case id");
    if (!item.prompt) errors.push(`evals/router-cases.json: ${item.id || "<unknown>"} missing prompt`);
    if (!allowedRoutes.has(item.expectedRoute)) {
      errors.push(`evals/router-cases.json: ${item.id || "<unknown>"} has invalid expectedRoute`);
    }
    caseIds.add(item.id);
    routes.add(item.expectedRoute);
  }
  for (const route of allowedRoutes) {
    if (!routes.has(route)) errors.push(`evals/router-cases.json: no case covers ${route}`);
  }
}

const hostBenchmark = readJsonFile("evals/host-routing-benchmark.json");
const allowedStatuses = new Set(["PASS", "PARTIAL", "NOT_RUN"]);
if (!hostBenchmark || hostBenchmark.version !== 1 || !hostBenchmark.case || !Array.isArray(hostBenchmark.hosts)) {
  errors.push("evals/host-routing-benchmark.json: expected version 1, case, and hosts array");
} else {
  if (!hostBenchmark.case.id || !hostBenchmark.case.prompt || !hostBenchmark.case.expectedRoute) {
    errors.push("evals/host-routing-benchmark.json: case needs id, prompt, and expectedRoute");
  }
  const hostIds = new Set();
  for (const host of hostBenchmark.hosts) {
    if (!host.id || hostIds.has(host.id)) errors.push("evals/host-routing-benchmark.json: duplicate or missing host id");
    if (!allowedStatuses.has(host.status)) errors.push(`evals/host-routing-benchmark.json: ${host.id || "<unknown>"} has invalid status`);
    if (!host.version || !host.evidence) errors.push(`evals/host-routing-benchmark.json: ${host.id || "<unknown>"} needs version and evidence`);
    hostIds.add(host.id);
  }
  if (hostBenchmark.hosts.length < 5) errors.push("evals/host-routing-benchmark.json: need at least five host records");
}

const hostCapabilities = readJsonFile("evals/host-capabilities.json");
if (!hostCapabilities || hostCapabilities.version !== 1 || !Array.isArray(hostCapabilities.capabilities) || !Array.isArray(hostCapabilities.hosts)) {
  errors.push("evals/host-capabilities.json: expected version 1, capabilities, and hosts arrays");
} else {
  const capabilitySet = new Set(hostCapabilities.capabilities);
  const capabilityHosts = new Set();
  for (const host of hostCapabilities.hosts) {
    if (!host.id || capabilityHosts.has(host.id)) errors.push("evals/host-capabilities.json: duplicate or missing host id");
    const confirmed = new Set(host.confirmed || []);
    const unknown = new Set(host.unknown || []);
    for (const capability of [...confirmed, ...unknown]) {
      if (!capabilitySet.has(capability)) errors.push(`evals/host-capabilities.json: unknown capability ${capability}`);
    }
    for (const capability of confirmed) {
      if (unknown.has(capability)) errors.push(`evals/host-capabilities.json: ${host.id} marks ${capability} confirmed and unknown`);
    }
    if (confirmed.size + unknown.size !== capabilitySet.size) {
      errors.push(`evals/host-capabilities.json: ${host.id} does not account for every capability`);
    }
    capabilityHosts.add(host.id);
  }
  if (hostCapabilities.hosts.length < 5) errors.push("evals/host-capabilities.json: need at least five host records");
}

const modelPolicy = readJsonFile("evals/model-policy.json");
if (!modelPolicy || modelPolicy.version !== 1 || !Array.isArray(modelPolicy.tiers) || !Array.isArray(modelPolicy.cases)) {
  errors.push("evals/model-policy.json: expected version 1, tiers, and cases");
} else {
  for (const tier of ["L0", "L1", "L2"]) {
    if (!modelPolicy.tiers.includes(tier)) errors.push(`evals/model-policy.json: missing tier ${tier}`);
  }
  if (modelPolicy.singleModelFallback !== "SAME_MODEL_REVIEW") {
    errors.push("evals/model-policy.json: singleModelFallback must be SAME_MODEL_REVIEW");
  }
  const modelCaseIds = new Set();
  for (const item of modelPolicy.cases) {
    if (!item.id || modelCaseIds.has(item.id)) errors.push("evals/model-policy.json: duplicate or missing case id");
    if (!item.expectedTier && !item.expectedFallback) errors.push(`evals/model-policy.json: ${item.id || "<unknown>"} needs expectedTier or expectedFallback`);
    if (item.expectedTier && !modelPolicy.tiers.includes(item.expectedTier)) errors.push(`evals/model-policy.json: ${item.id} has invalid tier`);
    modelCaseIds.add(item.id);
  }
  if (modelPolicy.latestProbe) {
    const probe = modelPolicy.latestProbe;
    if (!probe.date || !probe.host || probe.mode !== "single-model" || probe.status !== "PASS" || probe.scope !== "routing-contract-only") {
      errors.push("evals/model-policy.json: latestProbe must record a passing single-model routing-contract probe");
    }
    if (!Array.isArray(probe.cases) || probe.cases.length < 3) {
      errors.push("evals/model-policy.json: latestProbe needs at least three cases");
    }
  }
  if (modelPolicy.crossHostProbe) {
    const allowedProbeStatuses = new Set(["PASS", "ROUTER_UNVERIFIED", "NOT_RUN"]);
    if (!modelPolicy.crossHostProbe.date || !Array.isArray(modelPolicy.crossHostProbe.cases)) {
      errors.push("evals/model-policy.json: crossHostProbe needs date and cases");
    } else {
      for (const item of modelPolicy.crossHostProbe.cases) {
        if (!item.host || !item.evidence || !allowedProbeStatuses.has(item.status)) {
          errors.push(`evals/model-policy.json: invalid crossHostProbe record for ${item.host || "<unknown>"}`);
        }
      }
    }
  }
  const executableCases = modelPolicy.executableCases;
  const requiredGroups = ["negated-write", "readonly", "design-token", "code-cleanup", "data-destruction", "session-resume", "production-restore", "negation-plus-risk", "high-risk", "engineering"];
  if (!Array.isArray(executableCases) || !executableCases.length) {
    errors.push("evals/model-policy.json: executableCases must run the preflight against real prompts");
  } else {
    const groups = new Set();
    const seen = new Set();
    for (const item of executableCases) {
      if (!item.id || seen.has(item.id)) errors.push("evals/model-policy.json: executable case id missing or duplicated");
      seen.add(item.id);
      if (!item.prompt || !item.group || !item.expectedTier) errors.push(`evals/model-policy.json: ${item.id || "<unknown>"} needs prompt, group, and expectedTier`);
      if (!modelPolicy.tiers.includes(item.expectedTier)) errors.push(`evals/model-policy.json: ${item.id} has invalid expectedTier`);
      groups.add(item.group);
      const result = spawnSync(process.execPath, [path.join(root, "scripts/model-policy.mjs"), ...(item.args || []), item.prompt], { encoding: "utf8" });
      if (result.status !== 0) {
        errors.push(`model-policy ${item.id}: exit ${result.status} ${(result.stderr || "").trim()}`);
        continue;
      }
      let output;
      try {
        output = JSON.parse(result.stdout);
      } catch (error) {
        errors.push(`model-policy ${item.id}: invalid JSON (${error.message})`);
        continue;
      }
      if (output.tier !== item.expectedTier) errors.push(`model-policy ${item.id}: tier ${output.tier} != ${item.expectedTier}`);
      if (item.expectedFallback && output.fallback !== item.expectedFallback) errors.push(`model-policy ${item.id}: fallback ${output.fallback} != ${item.expectedFallback}`);
      if (item.expectedIndependentReview && output.independentReview !== item.expectedIndependentReview) {
        errors.push(`model-policy ${item.id}: independentReview ${output.independentReview} != ${item.expectedIndependentReview}`);
      }
      if (output.availableModels !== "未确认") errors.push(`model-policy ${item.id}: availableModels must stay 未确认`);
      for (const trigger of item.requiredTriggers || []) {
        if (!output.triggers?.includes(trigger)) errors.push(`model-policy ${item.id}: missing trigger ${trigger}`);
      }
      for (const trigger of item.forbiddenTriggers || []) {
        if (output.triggers?.includes(trigger)) errors.push(`model-policy ${item.id}: forbidden trigger ${trigger}`);
      }
    }
    for (const group of requiredGroups) {
      if (!groups.has(group)) errors.push(`evals/model-policy.json: no executable case covers ${group}`);
    }
  }
}

const goalAdapters = readJsonFile("evals/goal-adapters.json");
if (!goalAdapters || goalAdapters.version !== 2 || !Array.isArray(goalAdapters.adapters)) {
  errors.push("evals/goal-adapters.json: expected version 2 and adapters");
} else {
  const adapterHosts = new Set();
  const recoveryStates = new Set(["verified", "unverified", "unavailable"]);
  for (const adapter of goalAdapters.adapters) {
    if (!adapter.host || adapterHosts.has(adapter.host)) errors.push("evals/goal-adapters.json: duplicate or missing host");
    if (!adapter.mode || !adapter.entry || !adapter.persistence || !adapter.recovery || !adapter.fallback) {
      errors.push(`evals/goal-adapters.json: ${adapter.host || "<unknown>"} needs mode, entry, persistence, recovery, and fallback`);
    }
    if (adapter.recovery && !recoveryStates.has(adapter.recovery)) errors.push(`evals/goal-adapters.json: ${adapter.host || "<unknown>"} has invalid recovery state`);
    adapterHosts.add(adapter.host);
  }
  for (const host of ["claude-code", "codex-cli", "pi-agent", "zcode", "minimax-code"]) {
    if (!adapterHosts.has(host)) errors.push(`evals/goal-adapters.json: missing adapter for ${host}`);
  }
}

const goalState = readJsonFile("evals/goal-state.json");
if (!goalState || goalState.version !== 1 || goalState.file !== ".deepstack/goal.md" || !Array.isArray(goalState.required) || !Array.isArray(goalState.statuses) || goalState.policy !== "fallback-only-explicit") {
  errors.push("evals/goal-state.json: expected version 1, fallback file, required fields, statuses, and explicit fallback policy");
} else {
  for (const key of ["schema", "status", "goal", "scope", "non_goals", "constraints", "acceptance", "current_phase", "evidence", "blockers", "next_step", "updated_at"]) {
    if (!goalState.required.includes(key)) errors.push(`evals/goal-state.json: missing required field ${key}`);
  }
}

const qualityGate = readJsonFile("evals/quality-gate.json");
if (!qualityGate || qualityGate.version !== 1 || !Array.isArray(qualityGate.categories) || !Array.isArray(qualityGate.statuses) || qualityGate.execution !== "plan-only-until-authorized" || qualityGate.policy !== "fixed-discovery-no-install-no-arbitrary-command") {
  errors.push("evals/quality-gate.json: expected deterministic plan-only quality gate contract");
} else {
  for (const category of ["format", "lint", "type", "test", "security"]) {
    if (!qualityGate.categories.includes(category)) errors.push(`evals/quality-gate.json: missing category ${category}`);
  }
  for (const status of ["PASS", "FAIL", "NOT_CONFIGURED", "SKIPPED", "NOT_RUN"]) {
    if (!qualityGate.statuses.includes(status)) errors.push(`evals/quality-gate.json: missing status ${status}`);
  }
}

for (const file of markdownFiles(skillsRoot)) {
  const text = fs.readFileSync(file, "utf8");
  const relativePath = path.relative(root, file);
  for (const match of text.matchAll(/`((?:\.\.?\/)[^`\s]+\.md)`/g)) {
    const reference = match[1];
    if (reference.includes("<") || reference.includes(">") || reference.includes("*")) continue;
    const target = path.resolve(path.dirname(file), reference);
    if (!fs.existsSync(target)) errors.push(`${relativePath}: broken local reference ${reference}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`OK plugin manifests=${manifests.length} skills=${names.size} route_cases=${routeCases.cases.length}`);
}
