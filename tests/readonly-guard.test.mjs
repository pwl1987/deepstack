import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guardScript = path.join(root, 'scripts/readonly-guard.mjs');

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `${args.join(' ')}: ${res.stderr}`);
}

function runGuard(args) {
  return spawnSync(process.execPath, [guardScript, ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
}

test('readonly-guard handles valid/broken symlinks and detects symlink target change', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-rg-sym-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repo = path.join(tmp, 'repo');
  const baseline = path.join(tmp, 'baseline.json');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'real.txt'), 'hello\n');
  fs.symlinkSync('real.txt', path.join(repo, 'good-link'));
  fs.symlinkSync('does-not-exist.txt', path.join(repo, 'broken-link'));
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 'fixture@example.test');
  git(repo, 'config', 'user.name', 'fixture');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'seed symlinks');

  const snap = runGuard(['snapshot', repo, baseline]);
  assert.equal(snap.status, 0, snap.stderr);

  const clean = runGuard(['verify', repo, baseline]);
  assert.equal(clean.status, 0, clean.stderr);

  fs.unlinkSync(path.join(repo, 'broken-link'));
  fs.symlinkSync('other-target.txt', path.join(repo, 'broken-link'));
  const dirty = runGuard(['verify', repo, baseline]);
  assert.equal(dirty.status, 2);
  const parsed = JSON.parse(dirty.stderr);
  assert.ok(parsed.changed.includes('broken-link'), JSON.stringify(parsed));
});

test('readonly-guard chunked hashing handles >128KiB files and detects mutations', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-rg-big-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repo = path.join(tmp, 'repo');
  const baseline = path.join(tmp, 'baseline.json');
  fs.mkdirSync(repo);
  const bigBuf = Buffer.alloc(160 * 1024, 0x61);
  fs.writeFileSync(path.join(repo, 'big.bin'), bigBuf);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 'fixture@example.test');
  git(repo, 'config', 'user.name', 'fixture');
  git(repo, 'add', 'big.bin');
  git(repo, 'commit', '-m', 'seed big file');

  assert.equal(runGuard(['snapshot', repo, baseline]).status, 0);
  assert.equal(runGuard(['verify', repo, baseline]).status, 0);

  bigBuf[150 * 1024] = 0x62;
  fs.writeFileSync(path.join(repo, 'big.bin'), bigBuf);
  const dirty = runGuard(['verify', repo, baseline]);
  assert.equal(dirty.status, 2);
  assert.ok(JSON.parse(dirty.stderr).changed.includes('big.bin'));
});
