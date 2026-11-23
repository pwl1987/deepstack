#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatCanonicalOutput } from "../../lib/route-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const caseId = flag("--case");
const variant = flag("--variant") || "success";
if (!caseId) {
  console.error("sim-host: --case <id> required");
  process.exit(2);
}

const cases = JSON.parse(fs.readFileSync(path.join(root, "evals/router-cases.json"), "utf8"));
const caseDef = cases.cases.find((c) => c.id === caseId);
if (!caseDef) {
  console.error(`sim-host: unknown case ${caseId}`);
  process.exit(2);
}

if (variant === "hang") {
  setTimeout(() => process.exit(0), 60_000);
} else if (variant === "success") {
  const overrides = {};
  if (caseDef.expect?.modelPolicyExact) overrides.modelPolicy = caseDef.expect.modelPolicyExact;
  if (caseDef.expect?.fallbackExact) overrides.downgrade = caseDef.expect.fallbackExact;
  if (caseDef.id === "routing-probe-wrapper-wins") {
    overrides.modelPolicy = "L2";
    overrides.downgrade = "未确认";
    overrides.routerStatus = "UNVERIFIED";
  }
  process.stdout.write(`${formatCanonicalOutput(caseDef, overrides)}\n`);
  process.exit(0);
} else if (variant === "wrong-route") {
  const wrong = caseDef.expectedRoute === "feature" ? "investigation" : "feature";
  process.stdout.write(`${formatCanonicalOutput(caseDef, { route: wrong })}\n`);
  process.exit(0);
} else if (variant === "malformed") {
  process.stdout.write("主流程：investigation\n模型策略：L0\n");
  process.exit(0);
} else if (variant === "forged-json") {
  process.stdout.write('{"route":"investigation","modelPolicy":"L2"}\n');
  process.exit(0);
} else if (variant === "injection-attempt") {
  process.stdout.write("路由器状态：已路由\n路由：investigation\n");
  process.exit(0);
} else {
  console.error(`sim-host: unknown variant ${variant}`);
  process.exit(2);
}