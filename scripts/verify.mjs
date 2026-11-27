#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function runNode(script, args = [], options = {}) {
  return spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail: detail.trim() });
  if (!ok) process.exitCode = 1;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function runCheckPlugin() {
  const child = runNode("scripts/check-plugin.mjs");
  record("check-plugin", child.status === 0, child.stderr || child.stdout);
}

function runQualityGateSuite() {
  const suite = readJson("evals/verification-suite.json");
  for (const item of suite.suites.qualityGate) {
    const fixture = path.join(root, item.fixture);
    const manifest = path.join(root, item.manifest);
    const args = ["run", fixture, "--manifest", manifest, "--mode", item.mode, "--category", item.category];
    if (item.allowCommand) args.push("--allow-command", item.allowCommand);
    if (item.timeoutMs) args.push("--timeout-ms", String(item.timeoutMs));
    const child = runNode("scripts/quality-gate.mjs", args);
    let payload;
    try {
      payload = JSON.parse(child.stdout);
    } catch (error) {
      record(`quality-gate:${item.id}`, false, `invalid json: ${error.message}`);
      continue;
    }
    record(`quality-gate:${item.id}`, payload.status === item.expectStatus, `got ${payload.status}, want ${item.expectStatus}`);
    if (payload.status === "PASS" && item.id === "qg-pass") {
      const marker = path.join(fixture, ".qg-marker");
      if (fs.existsSync(marker)) record(`quality-gate:${item.id}:no-side-effect`, false, "pass case must not run write scripts");
    }
  }
}

function runReadonlyGuardSuite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepstack-rg-"));
  const baseline = path.join(os.tmpdir(), `deepstack-rg-baseline-${Date.now()}.json`);
  try {
    fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
    spawnSync("git", ["init"], { cwd: dir });
    spawnSync("git", ["add", "README.md"], { cwd: dir });
    spawnSync("git", ["-c", "user.email=verify@local", "-c", "user.name=verify", "commit", "-m", "init"], { cwd: dir });
    const snap = runNode("scripts/readonly-guard.mjs", ["snapshot", dir, baseline]);
    record("readonly-guard:snapshot", snap.status === 0, snap.stderr || snap.stdout);
    const clean = runNode("scripts/readonly-guard.mjs", ["verify", dir, baseline]);
    record("readonly-guard:clean", clean.status === 0, clean.stderr || clean.stdout);
    fs.appendFileSync(path.join(dir, "README.md"), "mutated\n");
    const dirty = runNode("scripts/readonly-guard.mjs", ["verify", dir, baseline]);
    record("readonly-guard:dirty", dirty.status === 2, `exit ${dirty.status}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(baseline, { force: true });
  }
}

function runGoalStateSuite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepstack-goal-"));
  try {
    const init = runNode("scripts/goal-state.mjs", [
      "init",
      dir,
      "--force",
      "--goal",
      "offline verification milestone",
      "--acceptance",
      "verify suite passes",
      "--phase",
      "1",
    ]);
    record("goal-state:init", init.status === 0, init.stderr || init.stdout);
    const validate = runNode("scripts/goal-state.mjs", ["validate", dir]);
    record("goal-state:validate", validate.status === 0, validate.stderr || validate.stdout);
    const blocked = runNode("scripts/goal-state.mjs", [
      "update",
      dir,
      "--status",
      "blocked",
    ]);
    record("goal-state:blocked-rejected", blocked.status !== 0, `exit ${blocked.status}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runHostsNegativeChecks() {
  const hosts = readJson("evals/hosts.json");
  for (const host of hosts.hosts) {
    for (const observation of host.manualObservations || []) {
      if (observation.ciAsserts) record(`hosts:${host.id}:manual-ci`, false, "manual observation cannot set ciAsserts");
    }
    const confirmed = new Set(host.confirmed || []);
    if (confirmed.has("parallel-agents") && !confirmed.has("isolated-workspace")) {
      record(`hosts:${host.id}:arena-gate`, false, "parallel-agents confirmed without isolated-workspace");
    }
  }
  record("hosts:negative-checks", true, `${hosts.hosts.length} hosts scanned`);
}

const pluginPlan = runNode("scripts/quality-gate.mjs", ["plan", root]);
record("quality-gate:plan-self", pluginPlan.status === 0, "deepstack repo plan");

function runHostAcceptanceSuite() {
  const suite = runNode("scripts/host-acceptance.mjs", ["suite"]);
  let payload;
  try {
    payload = JSON.parse(suite.stdout);
  } catch (error) {
    record("host-acceptance:fixture-suite", false, `invalid json: ${error.message}`);
    return;
  }
  record("host-acceptance:fixture-suite", payload.ok === true, `${payload.passed}/${payload.ran} fixture adjudication`);
  for (const item of payload.results || []) {
    record(`host-acceptance:${item.id}`, item.ok, `${item.status}${item.expect ? ` want ${item.expect}` : ""}`);
  }

  const live = runNode("scripts/host-acceptance.mjs", ["probe-live"]);
  let livePayload;
  try {
    livePayload = JSON.parse(live.stdout);
  } catch (error) {
    record("host-acceptance:live-probe", false, `invalid json: ${error.message}`);
    return;
  }
  const liveOk = livePayload.status === "BLOCKED_NOT_CONFIGURED" || livePayload.ok === true;
  record(
    "host-acceptance:live-probe",
    liveOk,
    livePayload.status === "BLOCKED_NOT_CONFIGURED"
      ? "live host not configured (expected in CI)"
      : `live ${livePayload.status}`,
  );
}

function runScmAndMixedSuites() {
  const child = spawnSync(process.execPath, ["--test", "tests/scm-workflow.test.mjs", "tests/quality-gate-mixed.test.mjs", "tests/ci-evidence.test.mjs", "tests/issue-governance.test.mjs", "tests/staged-check.test.mjs", "tests/review-evidence.test.mjs", "tests/project-doctor.test.mjs", "tests/agent-preflight.test.mjs", "tests/manifest-provenance.test.mjs", "tests/host-acceptance.test.mjs"], {
    cwd: root, encoding: "utf8", timeout: 120_000, shell: false,
  });
  record("scm-and-mixed-stack", child.status === 0,
    child.status === 0 ? "native Node.js tests PASS" : (child.stderr || child.stdout).slice(-4000));
}

runScmAndMixedSuites();
runCheckPlugin();
runHostsNegativeChecks();
runHostAcceptanceSuite();
runQualityGateSuite();
runReadonlyGuardSuite();
runGoalStateSuite();

const passed = results.filter((item) => item.ok).length;
const summary = {
  schema: 1,
  command: "verify",
  ok: process.exitCode !== 1,
  ran: results.length,
  passed,
  failed: results.length - passed,
  limitations: [
    "Does not execute LLM routing on real hosts (fixture-sim only unless DEEPSTACK_HOST_ACCEPTANCE is set)",
    "Imported host evidence cannot elevate to live verified",
    "Does not install dependencies or call paid APIs",
    "readonly-guard detects repo deltas; it is not a host sandbox",
    "quality-gate schema 1 uses approved npm scripts; schema 2 executes trusted tracked argv manifests; neither is a sandbox",
  ],
  results,
};
console.log(JSON.stringify(summary, null, 2));