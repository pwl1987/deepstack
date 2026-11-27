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
