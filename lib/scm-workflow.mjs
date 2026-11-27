import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { verifyWriter } from './writer-lease.mjs';

const WORKFLOWS = new Set(['main-only', 'branch-pr']);
const DEFAULT_TTL_MS = 15 * 60_000;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
function samePath(left, right) {
  try { return fs.realpathSync(left) === fs.realpathSync(right); }
  catch { return path.resolve(left) === path.resolve(right); }
}

function git(cwd, args) {
  const out = spawnSync('git', args, {
    cwd, encoding: 'utf8', timeout: 15_000, shell: false,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return { ok: out.status === 0, value: (out.stdout || '').trim(),
    reason: (out.stderr || out.error?.message || '').trim() };
}
function policyFor(policy) {
  if (!policy || !WORKFLOWS.has(policy.workflow)) throw new Error('workflow must be main-only or branch-pr');
  const baseBranch = policy.baseBranch || 'main';
  const remote = policy.remote || 'origin';
  if (policy.workflow === 'main-only' && baseBranch !== 'main') throw new Error('main-only-must-target-main');
  for (const value of [baseBranch, remote]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) || value.includes('..') || value.includes('//')) {
      throw new Error('invalid branch/remote identifier');
    }
  }
  const writerPolicy = policy.writerPolicy || (policy.workflow === 'main-only' ? 'local' : 'none');
  if (!['local', 'none'].includes(writerPolicy)) throw new Error('unsupported-writer-policy');
  return { workflow: policy.workflow, baseBranch, remote, writerPolicy };
}
export function loadWorkflowConfig(repo) {
  const file = path.join(repo, 'deepstack.config.json');
  if (!fs.existsSync(file)) return null;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  return config.git || config.workflow ? (config.git || config) : null;
}
export function inspectWorkflow(repoInput, config) {
  const repo = path.resolve(repoInput);
  const result = { status: 'UNKNOWN', workflow: null, repo, branch: null, head: null,
    remoteSha: null, dirty: null, reasons: [] };
  let policy;
  try { policy = policyFor(config); } catch (error) {
    result.status = 'FAIL'; result.reasons.push(error.message); return result;
  }
  result.workflow = policy.workflow;
  const root = git(repo, ['rev-parse', '--show-toplevel']);
  if (!root.ok) { result.reasons.push('not-a-git-worktree'); return result; }
  result.repo = path.resolve(root.value);
  const head = git(repo, ['rev-parse', 'HEAD']);
  const branch = git(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!head.ok) { result.reasons.push('missing-head'); return result; }
  result.head = head.value;
  if (!branch.ok) { result.status = 'FAIL'; result.reasons.push('detached-head'); return result; }
  result.branch = branch.value;
  if (policy.workflow === 'main-only' && result.branch !== policy.baseBranch) {
    result.status = 'FAIL'; result.reasons.push('main-only-branch-violation');
  }
  const status = git(repo, ['status', '--porcelain=v1', '--untracked-files=normal', '-z']);
  if (!status.ok) { result.reasons.push('git-status-unavailable'); return result; }
  result.dirty = status.value.length > 0;
  if (result.dirty) { result.status = 'FAIL'; result.reasons.push('dirty-worktree'); }
  // Compare to the actual remote, not only the possibly stale local origin/* ref.
  const live = git(repo, ['ls-remote', '--heads', policy.remote, `refs/heads/${result.branch}`]);
  if (!live.ok) { result.reasons.push('remote-unavailable');
    if (result.status !== 'FAIL') result.status = 'UNKNOWN'; return result; }
  result.remoteSha = live.value.split(/\s+/)[0] || null;
  if (!result.remoteSha) { result.reasons.push('remote-branch-unavailable');
    if (result.status !== 'FAIL') result.status = 'UNKNOWN'; return result; }
  if (result.remoteSha !== result.head) {
    result.status = 'FAIL'; result.reasons.push('remote-head-diverged');
  }
  if (!result.reasons.length) result.status = 'PASS';
  return result;
}
function stampPath(repo) {
  const gitDir = git(repo, ['rev-parse', '--absolute-git-dir']);
  if (!gitDir.ok) return null;
  return path.join(gitDir.value, 'deepstack', 'preflight.json');
}
export function issuePreflight(repo, config, options = {}) {
  const result = inspectWorkflow(repo, config);
  const stamp = stampPath(repo);
  if (result.status !== 'PASS') {
    if (stamp && fs.existsSync(stamp)) fs.rmSync(stamp);
    return result;
  }
  const validPolicy = policyFor(config);
  if (validPolicy.writerPolicy === 'local') {
    const lease = verifyWriter(repo, options.writerToken || process.env.DEEPSTACK_WRITER_TOKEN);
    if (lease.status !== 'PASS') {
      if (stamp && fs.existsSync(stamp)) fs.rmSync(stamp);
      return { ...result, status: 'UNKNOWN', reasons: ['writer-lease-not-verified'] };
    }
  }
  const lifetime = Number(options.ttlMs ?? DEFAULT_TTL_MS);
  if (!Number.isSafeInteger(lifetime) || lifetime <= 0 || lifetime > 60 * 60_000) {
    return { ...result, status: 'FAIL', reasons: ['invalid-ttl'] };
  }
  const payload = {
    schema: 1, guardOk: true, issuedAt: Date.now(), expiresAt: Date.now() + lifetime,
    policyDigest: sha(JSON.stringify(validPolicy)),
    writerTokenDigest: validPolicy.writerPolicy === 'local' ? sha(options.writerToken || process.env.DEEPSTACK_WRITER_TOKEN) : null,
    repo: result.repo, branch: result.branch, head: result.head,
    remoteSha: result.remoteSha, dirty: false, checks: ['branch', 'clean', 'remote'],
  };
  fs.mkdirSync(path.dirname(stamp), { recursive: true, mode: 0o700 });
  fs.writeFileSync(stamp, JSON.stringify(payload), { mode: 0o600 });
  return { ...result, stamp, expiresAt: payload.expiresAt };
}
/** Before push, remote must still equal the preflight baseline; local HEAD may advance. */
export function checkPush(repo, config, options = {}) {
  const result = { status: 'FAIL', reasons: [] };
  const stamp = stampPath(repo);
  if (!stamp || !fs.existsSync(stamp)) return { ...result, reasons: ['preflight-missing'] };
  let payload, policy;
  try { payload = JSON.parse(fs.readFileSync(stamp, 'utf8')); policy = policyFor(config); }
  catch { return { ...result, reasons: ['preflight-invalid'] }; }
  if (payload.guardOk !== true || payload.dirty !== false || payload.schema !== 1 ||
      payload.policyDigest !== sha(JSON.stringify(policy))) {
    return { ...result, reasons: ['preflight-conditions-invalid'] };
  }
  if (policy.writerPolicy === 'local') {
    const token = options.writerToken || process.env.DEEPSTACK_WRITER_TOKEN;
    if (verifyWriter(repo, token).status !== 'PASS' ||
        payload.writerTokenDigest !== (token ? sha(token) : null)) {
      return { ...result, reasons: ['writer-lease-not-verified'] };
    }
  }
  const branch = git(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = git(repo, ['rev-parse', 'HEAD']);
  const status = git(repo, ['status', '--porcelain=v1', '--untracked-files=normal', '-z']);
  if (!branch.ok || !head.ok || !status.ok) return { status: 'UNKNOWN', reasons: ['git-status-unavailable'] };
  if ((policy.workflow === 'main-only' && branch.value !== policy.baseBranch) ||
      payload.branch !== branch.value) result.reasons.push('branch-mismatch');
  if (status.value.length) result.reasons.push('dirty-worktree');
  if (!samePath(repo, payload.repo)) result.reasons.push('repository-mismatch');
  const live = git(repo, ['ls-remote', '--heads', policy.remote, `refs/heads/${branch.value}`]);
  if (!live.ok) return { status: 'UNKNOWN', reasons: ['remote-unavailable'] };
  const liveSha = live.value.split(/\s+/)[0];
  if (!liveSha || liveSha !== payload.remoteSha) result.reasons.push('remote-advanced-since-preflight');
  const ancestor = git(repo, ['merge-base', '--is-ancestor', payload.head, head.value]);
  if (!ancestor.ok) result.reasons.push('head-not-descendant-of-preflight');
  if (!result.reasons.length) return { status: 'PASS', head: head.value, expectedRemoteSha: liveSha, branch: branch.value };
  return result;
}

export function verifyPreflight(repo, config, options = {}) {
  const stamp = stampPath(repo);
  if (!stamp || !fs.existsSync(stamp)) return { status: 'FAIL', reasons: ['preflight-missing'] };
  let payload;
  try { payload = JSON.parse(fs.readFileSync(stamp, 'utf8')); } catch {
    return { status: 'FAIL', reasons: ['preflight-invalid'] };
  }
  const now = Date.now();
  const required = ['branch', 'clean', 'remote'];
  if (payload.schema !== 1 || payload.guardOk !== true || payload.dirty !== false ||
      !Array.isArray(payload.checks) || !required.every(v => payload.checks.includes(v)) ||
      !Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt) ||
      payload.issuedAt > now || payload.expiresAt <= now ||
      payload.expiresAt - payload.issuedAt > 60 * 60_000) {
    return { status: 'FAIL', reasons: ['preflight-conditions-invalid'] };
  }
  let digest;
  try { digest = sha(JSON.stringify(policyFor(config))); } catch {
    return { status: 'FAIL', reasons: ['preflight-policy-invalid'] };
  }
  const validPolicy = policyFor(config);
  if (validPolicy.writerPolicy === 'local') {
    const token = options.writerToken || process.env.DEEPSTACK_WRITER_TOKEN;
    if (verifyWriter(repo, token).status !== 'PASS' ||
        payload.writerTokenDigest !== (token ? sha(token) : null)) {
      return { status: 'FAIL', reasons: ['preflight-writer-mismatch'] };
    }
  }
  const current = inspectWorkflow(repo, config);
  if (current.status !== 'PASS') return { status: 'FAIL', reasons: current.reasons };
  if (payload.policyDigest !== digest || payload.repo !== current.repo ||
      payload.head !== current.head || payload.branch !== current.branch ||
      payload.remoteSha !== current.remoteSha) {
    return { status: 'FAIL', reasons: ['preflight-snapshot-mismatch'] };
  }
  return { status: 'PASS', head: current.head, branch: current.branch, expiresAt: payload.expiresAt };
}
