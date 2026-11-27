#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { adjudicateCase, parseRouteOutput } from "../lib/route-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function usage() {
  console.error(`usage:
  route-adjudicate parse --input <file|->
  route-adjudicate case --id <caseId> --input <file|->
  route-adjudicate case --id <caseId> --text <host output>`);
  process.exit(2);
}

const args = process.argv.slice(2);
const command = args[0];
if (!command) usage();

function readInput(flag) {
  const idx = args.indexOf(flag);
  if (idx < 0) return null;
  const value = args[idx + 1];
  if (value === "-") return fs.readFileSync(0, "utf8");
  return fs.readFileSync(path.resolve(value), "utf8");
}

function modelPolicyForPrompt(prompt) {
  const child = spawnSync(process.execPath, [path.join(root, "scripts/model-policy.mjs"), prompt], { encoding: "utf8" });
  if (child.status !== 0) return null;
  try {
    return JSON.parse(child.stdout);
  } catch {
    return null;
  }
}

if (command === "parse") {
  const text = readInput("--input") ?? readInput("--text");
  if (!text) usage();
  const parsed = parseRouteOutput(text);
  console.log(JSON.stringify({ command: "parse", ...parsed }, null, 2));
  process.exit(parsed.ok ? 0 : 1);
}

if (command === "case") {
  const idIdx = args.indexOf("--id");
  const caseId = idIdx >= 0 ? args[idIdx + 1] : null;
  if (!caseId) usage();
  const cases = readJson("evals/router-cases.json");
  const caseDef = cases.cases.find((c) => c.id === caseId);
  if (!caseDef) {
    console.error(`unknown case id: ${caseId}`);
    process.exit(2);
  }
  const text = readInput("--input") ?? (args.includes("--text") ? args[args.indexOf("--text") + 1] : null);
  if (!text) usage();
  const parsed = parseRouteOutput(text);
  const mp = caseDef.expect?.runModelPolicy !== false ? modelPolicyForPrompt(caseDef.prompt) : null;
  const result = adjudicateCase(caseDef, parsed, { modelPolicySnapshot: mp });
  const out = {
    schema: 1,
    command: "case",
    caseId,
    parse: parsed,
    modelPolicy: mp,
    adjudication: result,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(result.ok ? 0 : 1);
}

usage();