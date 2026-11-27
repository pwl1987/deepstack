#!/usr/bin/env node
/** Verify the worktree really corresponds to the Git index before and after tests. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectStagedSnapshot, compareStagedSnapshots } from '../lib/staged-check.mjs';

const [command, repoInput, ...args] = process.argv.slice(2);
function output(result) {
  console.log(JSON.stringify(result));
  if (result.status !== 'PASS') process.exitCode = result.status === 'UNKNOWN' ? 3 : 1;
}
if (!repoInput || !['inspect', 'run'].includes(command)) {
  console.error('Usage: node scripts/staged-check.mjs <inspect|run> <repo> [--manifest ... --component ... --category ...]');
  process.exit(2);
}
const repo = path.resolve(repoInput);
const before = inspectStagedSnapshot(repo);
if (command === 'inspect' || before.status !== 'PASS') {
  output(before); // no execution when index cannot be matched
} else {
  const child = spawnSync(process.execPath, ['scripts/quality-gate.mjs', 'run', repo, ...args], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    shell: false, encoding: 'utf8', timeout: 3_660_000,
  });
  let check;
  try { check = JSON.parse(child.stdout); } catch { check = { status: 'UNKNOWN', reason: 'invalid-quality-gate-response' }; }
  const after = inspectStagedSnapshot(repo);
  const integrity = compareStagedSnapshots(before, after);
  let status = integrity.status !== 'PASS' ? 'FAIL' : check.status === 'PASS' && child.status === 0 ? 'PASS'
    : ['FAIL', 'TIMEOUT', 'REJECTED'].includes(check.status) ? 'FAIL' : 'UNKNOWN';
  output({ schema: 1, source: 'index-matched-worktree', status, headSha: before.headSha,
    indexTreeSha: before.indexTreeSha, stagedPaths: before.stagedPaths,
    checkStatus: check.status, check: { executable: check.executable, command: check.command,
      args: check.args, component: check.component || 'root', category: check.category, exitCode: check.exitCode },
    reasons: [...integrity.reasons, ...(status === 'PASS' ? [] : [check.reason || `check-status:${check.status}`])],
    limitations: ['Snapshot evidence only, not a sandbox, commit-hook enforcement, or exact-SHA CI'],
  });
}
