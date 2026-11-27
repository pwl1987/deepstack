/** Cooperative local Git-common-dir writer lease. Does not fence remote machines. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function leaseFile(repo) {
  const root = path.resolve(repo);
  const result = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: root, encoding: 'utf8', shell: false,
  });
  if (result.status !== 0) throw new Error('not-a-git-repository');
  return path.join(result.stdout.trim(), 'deepstack', 'writer.lock');
}
function sameToken(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(actual);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function readLease(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}
export function acquireWriter(repo, owner) {
  if (typeof owner !== 'string' || !/^[A-Za-z0-9_.@-]{1,120}$/.test(owner)) {
    return { status: 'FAIL', reason: 'invalid-owner' };
  }
  let file;
  try { file = leaseFile(repo); } catch { return { status: 'UNKNOWN', reason: 'git-unavailable' }; }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const token = crypto.randomUUID();
  const body = { schema: 1, owner, token, createdAt: new Date().toISOString(),
    scope: 'local-git-common-dir', note: 'requires explicit release; never auto-steal' };
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch (error) {
    return { status: error.code === 'EEXIST' ? 'BLOCKED' : 'UNKNOWN',
      reason: error.code === 'EEXIST' ? 'other-or-stale-writer-lease' : 'lock-io-error' };
  }
  try { fs.writeFileSync(fd, JSON.stringify(body)); }
  finally { fs.closeSync(fd); }
  return { status: 'PASS', owner, token, scope: body.scope };
}
export function verifyWriter(repo, token) {
  let file;
  try { file = leaseFile(repo); } catch { return { status: 'UNKNOWN', reason: 'git-unavailable' }; }
  const body = readLease(file);
  if (body?.schema !== 1 || !sameToken(body.token, token)) {
    return { status: 'FAIL', reason: 'writer-lease-not-held' };
  }
  return { status: 'PASS', owner: body.owner, scope: body.scope };
}
export function releaseWriter(repo, token) {
  const current = verifyWriter(repo, token);
  if (current.status !== 'PASS') return current;
  const file = leaseFile(repo);
  try { fs.unlinkSync(file); } catch { return { status: 'UNKNOWN', reason: 'release-failed' }; }
  return { status: 'PASS', released: true };
}
