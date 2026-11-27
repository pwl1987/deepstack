#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adjudicateCase,
  caseSetDigest,
  parseRouteOutput,
} from "../lib/route-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function gitHeadSha() {
  const r = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

function isWithin(baseDir, target) {
  const rel = path.relative(baseDir, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function resolveSafePath(userPath) {
  if (!userPath) return null;
  const resolved = path.resolve(userPath);
  let ancestor = resolved;
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (!fs.existsSync(ancestor)) {
    throw new Error(`path outside repo or tmp: ${userPath}`);
  }
  const realAncestor = fs.realpathSync(ancestor);
  const candidateReal = path.join(realAncestor, path.relative(ancestor, resolved));
  if (isWithin(fs.realpathSync(root), candidateReal) || isWithin(fs.realpathSync(os.tmpdir()), candidateReal)) {
    return resolved;
  }
  throw new Error(`path outside repo or tmp: ${userPath}`);
}

function runArgv(argv, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: options.cwd || root,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (killed) resolve({ status: "TIMEOUT", exitCode: null, stdout, stderr, signal });
      else resolve({ status: code === 0 ? "OK" : "ERROR", exitCode: code, stdout, stderr, signal });
    });
  });
}

async function runSimHost(caseId, variant, timeoutMs) {
  const script = path.join(root, "fixtures/host-acceptance/sim-host.mjs");
  return runArgv([process.execPath, script, "--case", caseId, "--variant", variant], { timeoutMs });
}

function modelPolicyForPrompt(prompt) {
  const child = spawnSync(process.execPath, [path.join(root, "scripts/model-policy.mjs"), prompt], {
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (child.status !== 0) return null;
  try {
    return JSON.parse(child.stdout);
  } catch {
    return null;
  }
}

function buildEvidenceBase(mode, hostMeta) {
  const routerCases = readJson("evals/router-cases.json");
  const contract = readJson("evals/route-acceptance.json");
  const plugin = readJson("plugin.json");
  return {
    schema: contract.evidenceSchema,
    kind: "host-acceptance-evidence",
    source: mode,
    verificationTier:
      mode === "fixture-sim"
        ? "fixture-sim"
        : mode === "host-import"
          ? "import-self-reported"
          : mode === "host-live"
            ? "host-live"
            : "unknown",
    countsAsLiveVerified: mode === "host-live",
    selfReported: mode === "host-import",
    repoSha: gitHeadSha(),
    pluginVersion: plugin.version,
    caseSetDigest: caseSetDigest(routerCases),
    caseCount: routerCases.cases.length,
    host: hostMeta,
    execution: {
      mode,
      nodeVersion: process.version,
    },
    independentReviewSource: "not-collected-in-harness",
    readonlyGuard: { status: "NOT_RUN", note: "collect via separate host probe" },
    qualityGate: { status: "NOT_RUN", note: "collect via quality-gate run on target repo" },
    cases: [],
    limitations: [...(contract.defaultLimitations || [])],
  };
}

async function adjudicateSimCase(caseId, variant, timeoutMs) {
  const routerCases = readJson("evals/router-cases.json");
  const caseDef = routerCases.cases.find((c) => c.id === caseId);
  if (!caseDef) return { ok: false, status: "REJECTED", reasons: [`unknown case ${caseId}`] };

  const run = await runSimHost(caseId, variant, timeoutMs);
  if (run.status === "TIMEOUT") {
    return { ok: false, status: "TIMEOUT", reasons: ["sim-host exceeded timeout"], run };
  }

  const parsed = parseRouteOutput(run.stdout);
  const mp = modelPolicyForPrompt(caseDef.prompt);
  const adjudication = adjudicateCase(caseDef, parsed, { modelPolicySnapshot: mp });
  return { ok: adjudication.ok, status: adjudication.status, adjudication, parsed, modelPolicy: mp, run };
}

async function runFixtureSuite(suiteItems) {
  const results = [];
  for (const item of suiteItems) {
    if (item.fixtureEvidence) {
      const result = importEvidence(path.join(root, item.fixtureEvidence));
      const ok = result.status === item.expectImportStatus;
      results.push({ id: item.id, ok, status: result.status, expect: item.expectImportStatus, detail: result.reasons?.join(";") });
      continue;
    }

    const timeoutMs = item.timeoutMs ?? 5000;
    const caseIds = item.caseId ? [item.caseId] : readJson("evals/router-cases.json").cases.map((c) => c.id);

    if (item.variant === "hang") {
      const run = await runSimHost(caseIds[0], "hang", item.timeoutMs ?? 300);
      const ok = run.status === "TIMEOUT";
      results.push({ id: item.id, ok, status: ok ? "TIMEOUT" : "FAIL", detail: run.status });
      continue;
    }

    if (item.allCases) {
      let ok = true;
      const failed = [];
      for (const cid of caseIds) {
        const r = await adjudicateSimCase(cid, item.variant || "success", timeoutMs);
        if (r.status !== item.expectAdjudication) {
          ok = false;
          failed.push(`${cid}:${r.status}`);
        }
      }
      results.push({ id: item.id, ok, status: ok ? "PASS" : "FAIL", detail: failed.join(";") || "all cases" });
      continue;
    }

    const cid = item.caseId || caseIds[0];
    const r = await adjudicateSimCase(cid, item.variant || "success", timeoutMs);
    const expect = item.expectAdjudication;
    const ok = r.status === expect;
    results.push({ id: item.id, ok, status: r.status, expect, detail: r.adjudication?.reasons?.join(";") || r.run?.stderr?.slice(0, 200) });
  }
  return results;
}

function parseLiveConfig() {
  const raw = process.env.DEEPSTACK_HOST_ACCEPTANCE;
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw);
    if (!cfg.hostId || !Array.isArray(cfg.argv) || !cfg.argv.length) return { error: "invalid config shape" };
    if (cfg.argv.some((p) => typeof p !== "string")) return { error: "argv must be strings" };
    return cfg;
  } catch (error) {
    return { error: error.message };
  }
}

async function runLiveProbe() {
  const contract = readJson("evals/route-acceptance.json");
  const cfg = parseLiveConfig();
  if (!cfg || cfg.error) {
    return {
      ok: true,
      status: "BLOCKED_NOT_CONFIGURED",
      liveVerified: false,
      reason: cfg?.error || "DEEPSTACK_HOST_ACCEPTANCE unset",
      primaryHost: contract.primaryHost,
    };
  }
  const hostEntry = contract.hosts[cfg.hostId];
  if (!hostEntry || hostEntry.admission === "fixture") {
    return { ok: false, status: "REJECTED", liveVerified: false, reason: `host ${cfg.hostId} not eligible for live` };
  }
  const started = new Date().toISOString();
  const run = await runArgv(cfg.argv, { timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  const finished = new Date().toISOString();
  return {
    ok: run.status === "OK",
    status: run.status === "TIMEOUT" ? "TIMEOUT" : run.status === "OK" ? "EXECUTED" : "FAIL",
    liveVerified: false,
    commandExecuted: run.status === "OK",
    started,
    finished,
    exitCode: run.exitCode,
    hostId: cfg.hostId,
    admission: hostEntry.admission,
    stdoutBytes: run.stdout.length,
    note: "live output must be imported into adjudicate/import for per-case PASS",
  };
}

function importEvidence(inputPath) {
  const resolved = resolveSafePath(inputPath);
  const raw = fs.readFileSync(resolved, "utf8");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    return { ok: false, status: "MALFORMED", reasons: [error.message] };
  }

  const contract = readJson("evals/route-acceptance.json");
  if (payload.schema !== contract.evidenceSchema) {
    return { ok: false, status: "REJECTED", reasons: ["evidence schema mismatch"] };
  }

  const currentSha = gitHeadSha();
  if (
    typeof payload.repoSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(payload.repoSha) ||
    payload.repoSha !== currentSha
  ) {
    return { ok: false, status: "REJECTED", reasons: ["missing or stale repoSha; cannot treat as current PASS"] };
  }

  if (payload.selfReported || payload.verificationTier === "import-self-reported") {
    payload.countsAsLiveVerified = false;
  }

  if (payload.countsAsLiveVerified && payload.verificationTier !== "host-live") {
    return { ok: false, status: "REJECTED", reasons: ["countsAsLiveVerified requires host-live tier"] };
  }

  const routerCases = readJson("evals/router-cases.json");
  const expectedDigest = caseSetDigest(routerCases);
  if (typeof payload.caseSetDigest !== "string" || payload.caseSetDigest !== expectedDigest) {
    return { ok: false, status: "REJECTED", reasons: ["missing or mismatched caseSetDigest"] };
  }

  const caseResults = [];
  for (const entry of payload.cases || []) {
    if (!entry.hostOutput) {
      if (entry.parsed) {
        caseResults.push({
          id: entry.id,
          status: "MALFORMED",
          ok: false,
          reasons: ["missing hostOutput; parsed-only import rejected"],
        });
      } else {
        caseResults.push({ id: entry.id, status: "NOT_RUN", ok: false });
      }
      continue;
    }
    const caseDef = routerCases.cases.find((c) => c.id === entry.id);
    if (!caseDef) {
      caseResults.push({ id: entry.id, status: "REJECTED", ok: false });
      continue;
    }
    const parsed = parseRouteOutput(entry.hostOutput);
    const mp = entry.modelPolicy || modelPolicyForPrompt(caseDef.prompt);
    const adj = adjudicateCase(caseDef, parsed, { modelPolicySnapshot: mp });
    const stamped = {
      ...adj,
      cannotUpgradeToLiveVerified: payload.selfReported === true,
    };
    caseResults.push({ id: entry.id, ...stamped });
  }

  const allPass = caseResults.length > 0 && caseResults.every((c) => c.ok);
  return {
    ok: allPass,
    status: allPass ? "PASS" : "FAIL",
    countsAsLiveVerified: false,
    importAdjudication: caseResults,
    limitations: ["imported evidence never counts as live verified without host-live tier"],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command) {
    console.error(`usage:
  host-acceptance suite [--mode fixture]
  host-acceptance probe-live
  host-acceptance import --input <evidence.json>
  host-acceptance record-fixture --out <path>`);
    process.exit(2);
  }

  if (command === "suite") {
    const suite = readJson("evals/verification-suite.json");
    const items = suite.suites?.hostAcceptance || [];
    const results = await runFixtureSuite(items);
    const passed = results.filter((r) => r.ok).length;
    const summary = {
      schema: 1,
      command: "suite",
      mode: "fixture",
      ok: passed === results.length,
      ran: results.length,
      passed,
      failed: results.length - passed,
      verificationTier: "fixture-sim",
      countsAsLiveVerified: false,
      results,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  }

  if (command === "probe-live") {
    const probe = await runLiveProbe();
    const summary = { schema: 1, command: "probe-live", ...probe };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(probe.status === "BLOCKED_NOT_CONFIGURED" ? 0 : probe.ok ? 0 : 1);
  }

  if (command === "import") {
    const idx = args.indexOf("--input");
    if (idx < 0) process.exit(2);
    const result = importEvidence(args[idx + 1]);
    console.log(JSON.stringify({ schema: 1, command: "import", ...result }, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "record-fixture") {
    const outIdx = args.indexOf("--out");
    const outPath = outIdx >= 0 ? resolveSafePath(args[outIdx + 1]) : path.join(os.tmpdir(), `deepstack-host-evidence-${Date.now()}.json`);
    const routerCases = readJson("evals/router-cases.json");
    const contract = readJson("evals/route-acceptance.json");
    const evidence = buildEvidenceBase("fixture-sim", {
      id: "fixture-sim",
      admission: "fixture",
      version: "sim-host.mjs",
    });
    evidence.execution.startedAt = new Date().toISOString();
    for (const caseDef of routerCases.cases) {
      const r = await adjudicateSimCase(caseDef.id, "success", 5000);
      evidence.cases.push({
        id: caseDef.id,
        promptDigest: crypto.createHash("sha256").update(caseDef.prompt).digest("hex").slice(0, 12),
        expectedRoute: caseDef.expectedRoute,
        hostOutput: r.run?.stdout,
        parse: r.parsed,
        modelPolicy: r.modelPolicy,
        adjudicationStatus: r.status,
        ok: r.ok,
      });
    }
    evidence.execution.finishedAt = new Date().toISOString();
    evidence.execution.exitCode = 0;
    evidence.summary = {
      passed: evidence.cases.filter((c) => c.ok).length,
      total: evidence.cases.length,
    };
    evidence.limitations = contract.defaultLimitations;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, command: "record-fixture", path: outPath, verificationTier: "fixture-sim" }, null, 2));
    process.exit(0);
  }

  console.error("unknown command");
  process.exit(2);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});