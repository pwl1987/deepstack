import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
}
function setup(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-manifest-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 'fixture@example.test');
  git(repo, 'config', 'user.name', 'fixture');
  fs.writeFileSync(path.join(repo, 'test.mjs'), "import assert from 'node:assert/strict'; assert.equal(1,1);\n");
  fs.writeFileSync(path.join(repo, 'write.mjs'), "import fs from 'node:fs';fs.writeFileSync('marker','BAD');\n");
  const manifest = path.join(repo, 'deepstack-quality-gate.json');
  const content = {schema: 2, components: {app: {cwd: '.', allow: {test: {executable:'node', args:['test.mjs']}}}}};
  fs.writeFileSync(manifest, JSON.stringify(content));
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'approved');
  return {repo, manifest, content};
}
function run({repo, manifest}) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/quality-gate.mjs'), 'run', repo, '--manifest', manifest, '--component', 'app', '--category', 'test'], {cwd:root, encoding:'utf8'});
  assert.ok(result.stdout.trim().startsWith('{'), result.stderr);
  return JSON.parse(result.stdout);
}
test('approved committed manifest passes', t => {
  const props = setup(t);
  assert.equal(run(props).status, 'PASS');
});
test('locally modified tracked manifest cannot change authorized command', t => {
  const props = setup(t);
  props.content.components.app.allow.test.args = ['write.mjs'];
  fs.writeFileSync(props.manifest, JSON.stringify(props.content));
  assert.equal(run(props).status, 'REJECTED');
  assert.equal(fs.existsSync(path.join(props.repo,'marker')), false);
});
test('even staged manifest override is not a committed authorization', t => {
  const props = setup(t);
  props.content.components.app.allow.test.args = ['write.mjs'];
  fs.writeFileSync(props.manifest, JSON.stringify(props.content));
  git(props.repo, 'add', 'deepstack-quality-gate.json');
  assert.equal(run(props).status, 'REJECTED');
  assert.equal(fs.existsSync(path.join(props.repo,'marker')), false);
});
test('intent-to-add uncommitted manifest is not trusted', t => {
  const props = setup(t);
  git(props.repo, 'rm', '-f', 'deepstack-quality-gate.json');
  git(props.repo, 'commit', '-m', 'manifest removed');
  fs.writeFileSync(props.manifest, JSON.stringify(props.content));
  git(props.repo, 'add', '-N', 'deepstack-quality-gate.json');
  assert.equal(run(props).status, 'REJECTED');
});

function setupSchema1(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-s1-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 'fixture@example.test');
  git(repo, 'config', 'user.name', 'fixture');
  fs.writeFileSync(path.join(repo, 'pass.mjs'), 'process.exit(0);\n');
  fs.writeFileSync(path.join(repo, 'fail.mjs'), 'process.exit(3);\n');
  fs.writeFileSync(path.join(repo, 'slow.mjs'), 'setTimeout(() => {}, 5000);\n');
  fs.writeFileSync(path.join(repo, 'write.mjs'), "import fs from 'node:fs'; fs.writeFileSync('marker', 'BAD');\n");
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'schema1-fixture',
    private: true,
    scripts: {
      'test:pass': 'node pass.mjs',
      'test:fail': 'node fail.mjs',
      'test:slow': 'node slow.mjs',
      'danger:write': 'node write.mjs',
      'format:write': 'node write.mjs',
    },
  }));
  const manifest = path.join(repo, 'deepstack-quality-gate.json');
  const content = {
    schema: 1,
    allow: { test: 'npm run test:pass', format: 'npm run format:write' },
    readonlySkipCategories: ['format'],
  };
  const failManifest = path.join(repo, 'deepstack-quality-gate.fail.json');
  const slowManifest = path.join(repo, 'deepstack-quality-gate.slow.json');
  fs.writeFileSync(manifest, JSON.stringify(content));
  fs.writeFileSync(failManifest, JSON.stringify({ schema: 1, allow: { test: 'npm run test:fail' } }));
  fs.writeFileSync(slowManifest, JSON.stringify({ schema: 1, allow: { test: 'npm run test:slow' } }));
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'seed schema1');
  return { repo, manifest, failManifest, slowManifest, content };
}

function runSchema1(repo, manifest, extra = []) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/quality-gate.mjs'), 'run', repo, '--manifest', manifest, ...extra],
    { cwd: root, encoding: 'utf8', shell: false },
  );
  assert.ok(result.stdout.trim().startsWith('{'), result.stderr);
  return { rc: result.status, data: JSON.parse(result.stdout) };
}

test('schema 1 sets action:run without clobbering command and returns non-zero on FAIL/REJECTED/TIMEOUT', t => {
  const { repo, manifest, failManifest, slowManifest } = setupSchema1(t);

  const passRes = runSchema1(repo, manifest, ['--mode', 'write-authorized', '--category', 'test']);
  assert.equal(passRes.rc, 0);
  assert.equal(passRes.data.action, 'run');
  assert.equal(passRes.data.command, 'npm run test:pass');
  assert.equal(passRes.data.status, 'PASS');

  const skipRes = runSchema1(repo, manifest, ['--mode', 'readonly', '--category', 'format']);
  assert.equal(skipRes.rc, 0);
  assert.equal(skipRes.data.action, 'run');
  assert.equal(skipRes.data.command, null);
  assert.equal(skipRes.data.status, 'SKIPPED');

  const failRes = runSchema1(repo, failManifest, ['--mode', 'write-authorized', '--category', 'test']);
  assert.notEqual(failRes.rc, 0);
  assert.equal(failRes.data.action, 'run');
  assert.equal(failRes.data.status, 'FAIL');

  const rejectRes = runSchema1(repo, manifest, ['--mode', 'write-authorized', '--category', 'test', '--allow-command', 'npm run danger:write']);
  assert.notEqual(rejectRes.rc, 0);
  assert.equal(rejectRes.data.action, 'run');
  assert.equal(rejectRes.data.status, 'REJECTED');

  const timeoutRes = runSchema1(repo, slowManifest, ['--mode', 'write-authorized', '--category', 'test', '--timeout-ms', '150']);
  assert.notEqual(timeoutRes.rc, 0);
  assert.equal(timeoutRes.data.action, 'run');
  assert.equal(timeoutRes.data.status, 'TIMEOUT');
});

test('locally modified schema 1 manifest is REJECTED with non-zero exit code', t => {
  const { repo, manifest, content } = setupSchema1(t);
  content.allow.test = 'npm run danger:write';
  fs.writeFileSync(manifest, JSON.stringify(content));
  const res = runSchema1(repo, manifest, ['--mode', 'write-authorized', '--category', 'test']);
  assert.notEqual(res.rc, 0);
  assert.equal(res.data.status, 'REJECTED');
  assert.equal(res.data.reason, 'manifest-not-identical-to-committed-HEAD');
  assert.equal(fs.existsSync(path.join(repo, 'marker')), false);
});
