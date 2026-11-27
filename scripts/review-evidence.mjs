#!/usr/bin/env node
/** Read-only review readiness projection from canonical commit/config and fresh CI. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { judgeCiEvidence } from '../lib/ci-evidence.mjs';
import { judgeReviewEvidence } from '../lib/review-evidence.mjs';

const [repoArg, commitSha, ...args] = process.argv.slice(2);
const fullSha = /^[a-f0-9]{40}$/;
function run(command, argv, cwd) {
  return spawnSync(command, argv, { cwd, encoding: 'utf8', shell: false,
    timeout: 40_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
}
function result(data, code = 3) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(code);
}
if (!repoArg || !fullSha.test(commitSha || '')) {
  console.error('Usage: node scripts/review-evidence.mjs <repo> <full-commit-sha> [--check-report <file>]...');
  process.exit(2);
}
const repo = path.resolve(repoArg);
const reports = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--check-report' || !args[i + 1]) result({ status: 'BLOCKED', reason: 'invalid-args' }, 2);
  try { reports.push(JSON.parse(fs.readFileSync(path.resolve(args[++i]), 'utf8'))); }
  catch { result({ status: 'INCOMPLETE', reason: 'check-report-unreadable' }); }
}
const rawConfig = run('git', ['show', `${commitSha}:deepstack.config.json`], repo);
if (rawConfig.status !== 0) result({ status: 'INCOMPLETE', reason: 'committed-verification-policy-missing', commitSha });
let policy;
try { policy = JSON.parse(rawConfig.stdout).verification; } catch {
  result({ status: 'INCOMPLETE', reason: 'invalid-committed-verification-policy', commitSha });
}
if (!Array.isArray(policy?.requiredWorkflows) || !policy.requiredWorkflows.length ||
    !Array.isArray(policy?.requiredLocalChecks)) {
  result({ status: 'INCOMPLETE', reason: 'required-verification-policy-missing', commitSha });
}
const parents = run('git', ['show', '-s', '--format=%P', commitSha], repo);
const tree = run('git', ['rev-parse', `${commitSha}^{tree}`], repo);
if (parents.status !== 0 || tree.status !== 0 || parents.stdout.trim().split(/\s+/).length !== 1) {
  result({ status: 'INCOMPLETE', reason: 'commit-parent-tree-unavailable', commitSha });
}
const slug = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], repo);
if (slug.status !== 0 || !slug.stdout.trim()) result({ status: 'INCOMPLETE', reason: 'github-repo-unavailable', commitSha });
const repository = slug.stdout.trim();
const query = run('gh', ['run', 'list', '-R', repository, '--commit', commitSha, '--limit', '100',
  '--json', 'databaseId,workflowName,status,conclusion,headSha,event,createdAt'], repo);
if (query.status !== 0) result({ status: 'INCOMPLETE', reason: 'github-ci-unavailable', commitSha });
let ci;
try { ci = judgeCiEvidence(commitSha, policy.requiredWorkflows, JSON.parse(query.stdout)); }
catch { result({ status: 'INCOMPLETE', reason: 'github-ci-unparseable', commitSha }); }
const assessment = judgeReviewEvidence({ commitSha, parentSha: parents.stdout.trim(),
  treeSha: tree.stdout.trim(), policy, ci, checks: reports });
const diff = run('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', commitSha], repo);
console.log(JSON.stringify({
  ...assessment, repository, ci, changedFiles: diff.status === 0 ? diff.stdout.trim().split('\n').filter(Boolean) : null,
  source: 'git-commit+committed-config+live-github-actions',
  worktreeIndependent: true,
}, null, 2));
process.exitCode = assessment.status === 'READY_FOR_HUMAN_REVIEW' ? 0 : assessment.status === 'BLOCKED' ? 1 : 3;
