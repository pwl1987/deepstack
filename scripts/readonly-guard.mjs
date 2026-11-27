#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [, , command, repoArg, baselineArg] = process.argv;

function fail(message, code = 64) {
  console.error(`readonly-guard: ${message}`);
  process.exit(code);
}

if (!["snapshot", "verify"].includes(command) || !repoArg || !baselineArg) {
  fail("usage: readonly-guard.mjs <snapshot|verify> <git-root> <baseline.json>");
}

let repo;
try {
  repo = fs.realpathSync(path.resolve(repoArg));
} catch (error) {
  fail(`cannot resolve Git root: ${error.message}`);
}
const baselinePath = path.resolve(baselineArg);
const baselineRelative = path.relative(repo, baselinePath);
if (baselineRelative === "" || (!baselineRelative.startsWith("..") && !path.isAbsolute(baselineRelative))) {
  fail("baseline must be stored outside the Git root");
}

function git(args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.error) fail(`git unavailable: ${result.error.message}`);
  if (result.status !== 0) fail((result.stderr || "git command failed").trim());
  return result.stdout;
}

const root = path.resolve(git(["rev-parse", "--show-toplevel"]).trim());
if (root !== repo) fail(`path is not the Git root; use ${root}`);

function trackedFiles() {
  return git(["ls-files", "-co", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean);
}

function hashFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const stat = fs.statSync(absolutePath);
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(absolutePath));
  return { sha256: hash.digest("hex"), size: stat.size, mode: stat.mode & 0o777 };
}

function capture() {
  const files = {};
  for (const relativePath of trackedFiles()) files[relativePath] = hashFile(relativePath);
  return {
    version: 1,
    repo: root,
    head: git(["rev-parse", "HEAD"]).trim(),
    status: git(["status", "--porcelain=v1", "-z"]),
    files,
  };
}

function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch (error) {
    fail(`cannot read baseline: ${error.message}`);
  }
}

if (command === "snapshot") {
  fs.writeFileSync(baselinePath, `${JSON.stringify(capture(), null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, command, repo: root, baseline: baselinePath }));
  process.exit(0);
}

const baseline = readBaseline();
if (baseline.version !== 1 || baseline.repo !== root || !baseline.files) {
  fail("baseline does not match this Git root or is unsupported");
}

const current = capture();
const changed = new Set();
const paths = new Set([...Object.keys(baseline.files), ...Object.keys(current.files)]);
for (const relativePath of paths) {
  if (JSON.stringify(baseline.files[relativePath]) !== JSON.stringify(current.files[relativePath])) {
    changed.add(relativePath);
  }
}
if (baseline.status !== current.status) changed.add("<git-status>");
if (baseline.head !== current.head) changed.add("<git-head>");

if (changed.size) {
  console.error(JSON.stringify({ ok: false, command, repo: root, changed: [...changed].sort() }, null, 2));
  process.exit(2);
}

console.log(JSON.stringify({ ok: true, command, repo: root, changed: [] }));
