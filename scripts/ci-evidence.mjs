#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { judgeCiEvidence } from '../lib/ci-evidence.mjs';

const [repoArg, sha, ...args] = process.argv.slice(2);
if (!repoArg || !sha) {
  console.error('Usage: node scripts/ci-evidence.mjs <repo-path> <full-implementation-sha> --required <workflowName> [--required <workflowName> ...]');
  process.exit(2);
}
const repo = path.resolve(repoArg);
const required = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--required' || !args[i + 1]) { console.error('bad --required'); process.exit(2); }
  required.push(args[++i]);
}
const prereq = judgeCiEvidence(sha, required, []);
if (prereq.reasons.includes('invalid-full-sha') || prereq.reasons.includes('required-workflows-not-configured')) {
  console.log(JSON.stringify(prereq)); process.exit(prereq.status === 'FAIL' ? 1 : 3);
}
const gh = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
  cwd: repo, encoding: 'utf8', timeout: 20_000, shell: false,
});
if (gh.status !== 0 || !gh.stdout.trim()) {
  console.log(JSON.stringify({ status: 'UNKNOWN', reasons: ['github-repository-or-auth-unavailable'] })); process.exit(3);
}
const repository = gh.stdout.trim();
const runs = spawnSync('gh', ['run', 'list', '-R', repository, '--commit', sha, '--limit', '100',
  '--json', 'databaseId,workflowName,status,conclusion,headSha,event,createdAt'], {
  cwd: repo, encoding: 'utf8', timeout: 35_000, shell: false,
});
if (runs.status !== 0) {
  console.log(JSON.stringify({ status: 'UNKNOWN', reasons: ['github-actions-unavailable'] })); process.exit(3);
}
try {
  const result = judgeCiEvidence(sha, required, JSON.parse(runs.stdout));
  console.log(JSON.stringify({ ...result, repository }));
  if (result.status !== 'PASS') process.exitCode = result.status === 'UNKNOWN' ? 3 : 1;
} catch {
  console.log(JSON.stringify({ status: 'UNKNOWN', reasons: ['github-actions-response-malformed'] })); process.exitCode = 3;
}
