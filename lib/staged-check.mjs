/**
 * Git-index snapshot evidence for precommit checks.
 * This is a consistency verifier, not a sandbox, writer fence or CI replacement.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function git(repo, ...args) {
  const r = spawnSync('git', args, {
    cwd: repo, encoding: 'utf8', shell: false, timeout: 20_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || r.error?.message || '' };
}

export function inspectStagedSnapshot(repoInput) {
  const repo = path.resolve(repoInput);
  const result = { status: 'UNKNOWN', repo, headSha: null, indexTreeSha: null, stagedPaths: [], reasons: [] };
  const root = git(repo, 'rev-parse', '--show-toplevel');
  if (root.status !== 0) return { ...result, reasons: ['git-worktree-unavailable'] };
  result.repo = path.resolve(root.stdout.trim());
  const head = git(repo, 'rev-parse', 'HEAD');
  if (head.status !== 0) return { ...result, reasons: ['git-head-unavailable'] };
  result.headSha = head.stdout.trim();
  const staged = git(repo, 'diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', '-z');
  if (staged.status !== 0) return { ...result, reasons: ['git-index-unavailable'] };
  result.stagedPaths = staged.stdout.split('\0').filter(Boolean);
  if (!result.stagedPaths.length) return { ...result, reasons: ['no-staged-changes'] };
  const indexTree = git(repo, 'write-tree');
  if (indexTree.status !== 0) return { ...result, reasons: ['unmerged-or-unwritable-index'] };
  result.indexTreeSha = indexTree.stdout.trim();
  // A clean index-to-worktree diff proves that check tools read the same tracked
  // tree that would be committed. Reject untracked files: they can shadow imports.
  const unstaged = git(repo, 'diff', '--name-only', '-z', '--ignore-submodules=none');
  const untracked = git(repo, 'ls-files', '--others', '--exclude-standard', '-z');
  if (unstaged.status !== 0 || untracked.status !== 0) {
    return { ...result, reasons: ['git-worktree-unavailable'] };
  }
  if (unstaged.stdout.length) result.reasons.push('unstaged-changes');
  if (untracked.stdout.length) result.reasons.push('untracked-files');
  const whitespace = git(repo, 'diff', '--cached', '--check');
  if (whitespace.status !== 0) result.reasons.push('staged-diff-check-failed');
  result.status = result.reasons.length ? 'FAIL' : 'PASS';
  return result;
}

export function compareStagedSnapshots(before, after) {
  if (before?.status !== 'PASS') return { status: 'FAIL', reasons: ['precheck-incomplete', ...(before?.reasons || [])] };
  if (after?.status !== 'PASS') return { status: 'FAIL', reasons: ['postcheck-incomplete', ...(after?.reasons || [])] };
  const reasons = [];
  if (before.repo !== after.repo) reasons.push('repository-changed');
  if (before.headSha !== after.headSha) reasons.push('head-changed');
  if (before.indexTreeSha !== after.indexTreeSha) reasons.push('index-changed');
  return { status: reasons.length ? 'FAIL' : 'PASS', reasons,
    repo: before.repo, headSha: before.headSha, indexTreeSha: before.indexTreeSha,
    stagedPaths: before.stagedPaths };
}
