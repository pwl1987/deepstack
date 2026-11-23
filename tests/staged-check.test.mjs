import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectStagedSnapshot } from '../lib/staged-check.mjs';
function git(cwd, ...args) {
  const child = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-staged-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'fixture');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  fs.writeFileSync(path.join(dir, 'file.ts'), 'hello\n');
  git(dir, 'add', 'file.ts');git(dir, 'commit', '-m', 'initial');
  return dir;
}
test('staged content with no other worktree changes is testable', (t) => {
  const repo=fixture(t);
  fs.writeFileSync(path.join(repo,'file.ts'),'changed\n');
  git(repo,'add','file.ts');
  assert.equal(inspectStagedSnapshot(repo).status,'PASS');
});
test('staged A and unstaged B cannot be accepted as same tested snapshot', (t) => {
  const repo=fixture(t);
  fs.writeFileSync(path.join(repo,'file.ts'),'staged\n');git(repo,'add','file.ts');
  fs.writeFileSync(path.join(repo,'file.ts'),'unstaged\n');
  const result=inspectStagedSnapshot(repo);
  assert.equal(result.status,'FAIL');
  assert.ok(result.reasons.includes('unstaged-changes'));
});
test('untracked source makes automated submission evidence incomplete', (t) => {
  const repo=fixture(t);
  fs.appendFileSync(path.join(repo,'file.ts'),'next\n');git(repo,'add','file.ts');
  fs.writeFileSync(path.join(repo,'untracked.py'),'bad');
  assert.equal(inspectStagedSnapshot(repo).status,'FAIL');
});
test('no staged files cannot claim precommit PASS', (t) => {
  const repo=fixture(t);
  assert.equal(inspectStagedSnapshot(repo).status,'UNKNOWN');
});

test('compare rejects index mutation after a successful check', async (t) => {
  const { compareStagedSnapshots } = await import('../lib/staged-check.mjs');
  const repo = fixture(t);
  fs.writeFileSync(path.join(repo, 'file.ts'), 'A\n');
  git(repo, 'add', 'file.ts');
  const before = inspectStagedSnapshot(repo);
  assert.equal(before.status, 'PASS');
  fs.writeFileSync(path.join(repo, 'file.ts'), 'B\n');
  git(repo, 'add', 'file.ts');
  assert.equal(compareStagedSnapshots(before, inspectStagedSnapshot(repo)).status, 'FAIL');
});

function qualityFixture(t, command = 'test:pass') {
  const repo = fixture(t);
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'fixture-staged', version: '0.0.0', private: true,
    scripts: { 'test:pass': 'node verify.mjs', 'test:mutate': 'node mutate.mjs' },
  }));
  fs.writeFileSync(path.join(repo, 'verify.mjs'), "import fs from 'node:fs';\nif(fs.readFileSync('file.ts','utf8')!=='changed\\n')process.exit(2);\n");
  fs.writeFileSync(path.join(repo, 'mutate.mjs'), "import fs from 'node:fs';\nfs.writeFileSync('file.ts', 'edited by test\\n');\n");
  fs.writeFileSync(path.join(repo, 'manifest.json'), JSON.stringify({ schema: 1, allow: { test: `npm run ${command}` } }));
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'test tooling');
  fs.writeFileSync(path.join(repo, 'file.ts'), 'changed\n');
  git(repo, 'add', 'file.ts');
  return repo;
}
function checkCLI(repo) {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = spawnSync(process.execPath, [path.join(dir,'scripts/staged-check.mjs'), 'run', repo,
    '--manifest', path.join(repo, 'manifest.json'), '--category', 'test'],
    { cwd: dir, encoding: 'utf8', shell: false });
  return { rc: child.status, data: JSON.parse(child.stdout) };
}
test('wrapper binds a passing test to the staged index SHA', (t) => {
  const repo = qualityFixture(t);
  const {rc,data} = checkCLI(repo);
  assert.equal(rc, 0, JSON.stringify(data));
  assert.equal(data.status, 'PASS');
  assert.match(data.indexTreeSha, /^[0-9a-f]{40}$/);
});
test('wrapper rejects staged A and unstaged B before executing tests', (t) => {
  const repo = qualityFixture(t);
  fs.writeFileSync(path.join(repo, 'file.ts'), 'not staged\n');
  const {rc,data} = checkCLI(repo);
  assert.notEqual(rc, 0);
  assert.equal(data.status, 'FAIL');
});
test('passing test which modifies source cannot be used as PASS evidence', (t) => {
  const repo = qualityFixture(t, 'test:mutate');
  const {rc,data} = checkCLI(repo);
  assert.notEqual(rc, 0);
  assert.equal(data.status, 'FAIL');
  assert.equal(data.checkStatus, 'PASS');
  assert.ok(data.reasons.includes('postcheck-incomplete'));
});
