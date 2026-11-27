import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectWorkflow, issuePreflight, verifyPreflight, checkPush, loadWorkflowConfig } from '../lib/scm-workflow.mjs';
import { acquireWriter, verifyWriter, releaseWriter } from '../lib/writer-lease.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-scm-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'work');
  git(root, 'init', '--bare', '-b', 'main', remote);
  git(root, 'init', '-b', 'main', repo);
  git(repo, 'config', 'user.email', 'fixture@example.test');
  git(repo, 'config', 'user.name', 'fixture');
  fs.writeFileSync(path.join(repo, 'README.md'), 'first\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-m', 'first');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-u', 'origin', 'main');
  return { root, repo, remote };
}
const main = { workflow: 'main-only', baseBranch: 'main' };
const pr = { workflow: 'branch-pr', baseBranch: 'main' };

test('main-only clean synchronized main passes', (t) => {
  const { repo } = fixture(t);
  const result = inspectWorkflow(repo, main);
  assert.equal(result.status, 'PASS', JSON.stringify(result));
  assert.equal(result.branch, 'main');
});
test('main-only rejects non-main while branch-pr accepts tracked feature branch', (t) => {
  const { repo } = fixture(t);
  git(repo, 'switch', '-c', 'feature/one');
  git(repo, 'push', '-u', 'origin', 'feature/one');
  assert.equal(inspectWorkflow(repo, main).status, 'FAIL');
  assert.equal(inspectWorkflow(repo, pr).status, 'PASS');
});
test('detached HEAD, dirty and ahead are not admitted', (t) => {
  const { repo } = fixture(t);
  fs.writeFileSync(path.join(repo, 'dirty.txt'), 'dirty');
  assert.equal(inspectWorkflow(repo, main).status, 'FAIL');
  fs.unlinkSync(path.join(repo, 'dirty.txt'));
  fs.appendFileSync(path.join(repo, 'README.md'), 'ahead\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-m', 'ahead');
  assert.equal(inspectWorkflow(repo, main).status, 'FAIL');
  git(repo, 'switch', '--detach');
  assert.equal(inspectWorkflow(repo, main).status, 'FAIL');
});
test('missing origin is UNKNOWN and cannot issue a passing stamp', (t) => {
  const { repo } = fixture(t);
  git(repo, 'remote', 'remove', 'origin');
  assert.equal(inspectWorkflow(repo, main).status, 'UNKNOWN');
  assert.equal(issuePreflight(repo, main).status, 'UNKNOWN');
  assert.equal(verifyPreflight(repo, main).status, 'FAIL');
});
test('preflight success becomes invalid when content or flags are altered', (t) => {
  const { repo } = fixture(t);
  const lease = acquireWriter(repo, 'test-agent');
  assert.equal(lease.status, 'PASS');
  const opts = { writerToken: lease.token };
  assert.equal(issuePreflight(repo, main, opts).status, 'PASS');
  assert.equal(verifyPreflight(repo, main, opts).status, 'PASS');
  const file = path.join(repo, '.git', 'deepstack', 'preflight.json');
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  payload.guardOk = false;
  fs.writeFileSync(file, JSON.stringify(payload));
  assert.equal(verifyPreflight(repo, main, opts).status, 'FAIL');
  assert.equal(issuePreflight(repo, main, opts).status, 'PASS');
  fs.appendFileSync(path.join(repo, 'README.md'), 'changed\n');
  assert.equal(verifyPreflight(repo, main, opts).status, 'FAIL');
});
test('invalid config never silently defaults to an allowed workflow', (t) => {
  const { repo } = fixture(t);
  assert.equal(inspectWorkflow(repo, { workflow: 'unknown' }).status, 'FAIL');
});

test('single writer lease cannot be stolen and mismatched token cannot release', (t) => {
  const { repo } = fixture(t);
  const a = acquireWriter(repo, 'one-agent');
  assert.equal(a.status, 'PASS');
  assert.equal(acquireWriter(repo, 'other-agent').status, 'BLOCKED');
  assert.equal(verifyWriter(repo, a.token).status, 'PASS');
  assert.equal(releaseWriter(repo, 'wrong-token').status, 'FAIL');
  assert.equal(releaseWriter(repo, a.token).status, 'PASS');
  assert.equal(acquireWriter(repo, 'other-agent').status, 'PASS');
});
test('main-only preflight requires writer ownership', (t) => {
  const { repo } = fixture(t);
  assert.equal(issuePreflight(repo, main).status, 'UNKNOWN');
  const a = acquireWriter(repo, 'one-agent');
  assert.equal(issuePreflight(repo, main, { writerToken: a.token }).status, 'PASS');
  assert.equal(verifyPreflight(repo, main, { writerToken: 'wrong' }).status, 'FAIL');
});

test('push check accepts descendant commit while origin baseline stays unchanged', (t) => {
  const { repo } = fixture(t);
  const a = acquireWriter(repo, 'one-agent');
  const opts = { writerToken: a.token };
  assert.equal(issuePreflight(repo, main, opts).status, 'PASS');
  fs.appendFileSync(path.join(repo, 'README.md'), 'local-next\n');
  assert.equal(checkPush(repo, main, opts).status, 'FAIL'); // dirty stage
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-m', 'local-next');
  assert.equal(checkPush(repo, main, opts).status, 'PASS');
  assert.equal(checkPush(repo, main, { writerToken: 'invalid' }).status, 'FAIL');
});
test('push check detects remote main changed after preflight', (t) => {
  const { repo, root, remote } = fixture(t);
  const a = acquireWriter(repo, 'one-agent');
  assert.equal(issuePreflight(repo, main, { writerToken: a.token }).status, 'PASS');
  const other = path.join(root, 'other');
  git(root, 'clone', remote, other);
  git(other, 'config', 'user.email', 'fixture@example.test');
  git(other, 'config', 'user.name', 'fixture');
  fs.appendFileSync(path.join(other, 'README.md'), 'remote advanced\n');
  git(other, 'add', 'README.md');
  git(other, 'commit', '-m', 'another writer');
  git(other, 'push', 'origin', 'main');
  assert.equal(checkPush(repo, main, { writerToken: a.token }).status, 'FAIL');
});

test('main-only mode cannot silently accept a non-main base branch', (t) => {
  const { repo } = fixture(t);
  assert.equal(inspectWorkflow(repo, { workflow: 'main-only', baseBranch: 'develop' }).status, 'FAIL');
});

test('push check rejects expired preflight stamp', (t) => {
  const { repo } = fixture(t);
  const a = acquireWriter(repo, 'one-agent');
  const opts = { writerToken: a.token };
  assert.equal(issuePreflight(repo, main, opts).status, 'PASS');
  const stampFile = path.join(repo, '.git', 'deepstack', 'preflight.json');
  const payload = JSON.parse(fs.readFileSync(stampFile, 'utf8'));
  payload.issuedAt = Date.now() - 120_000;
  payload.expiresAt = Date.now() - 1_000;
  fs.writeFileSync(stampFile, JSON.stringify(payload));
  const res = checkPush(repo, main, opts);
  assert.equal(res.status, 'FAIL');
  assert.ok(res.reasons.includes('preflight-expired'), JSON.stringify(res));
});

test('subdirectory invocation loads workflow config and passes push-check without repository-mismatch', (t) => {
  const { repo } = fixture(t);
  fs.writeFileSync(path.join(repo, 'deepstack.config.json'), JSON.stringify({ git: main }));
  const sub = path.join(repo, 'packages', 'app');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'index.js'), 'console.log(1);\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'add config and sub');
  git(repo, 'push', 'origin', 'main');

  assert.deepEqual(loadWorkflowConfig(sub), main);
  assert.equal(inspectWorkflow(sub, main).status, 'PASS');

  const a = acquireWriter(sub, 'sub-agent');
  assert.equal(a.status, 'PASS');
  const opts = { writerToken: a.token };
  assert.equal(issuePreflight(sub, main, opts).status, 'PASS');

  fs.appendFileSync(path.join(sub, 'index.js'), 'console.log(2);\n');
  git(repo, 'add', 'packages/app/index.js');
  git(repo, 'commit', '-m', 'sub change');
  const pushRes = checkPush(sub, main, opts);
  assert.equal(pushRes.status, 'PASS', JSON.stringify(pushRes));
});
