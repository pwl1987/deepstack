import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.join(root, 'fixtures/quality-gate/mixed');
function run(manifest, component = 'backend', category = 'test', extra = []) {
  const result = spawnSync(process.execPath, [
    'scripts/quality-gate.mjs', 'run', repo, '--manifest', path.join(repo, manifest),
    '--component', component, '--category', category, ...extra,
  ], { cwd: root, encoding: 'utf8', shell: false });
  assert.ok(result.stdout.startsWith('{'), result.stderr);
  return JSON.parse(result.stdout);
}
test('mixed Python backend command succeeds', () => {
  assert.equal(run('deepstack-quality-gate.json').status, 'PASS');
});
test('mixed Node frontend command succeeds', () => {
  assert.equal(run('deepstack-quality-gate.json', 'frontend').status, 'PASS');
});
test('unconfigured optional check stays NOT_CONFIGURED', () => {
  assert.equal(run('deepstack-quality-gate.json', 'backend', 'lint').status, 'NOT_CONFIGURED');
});
test('invalid component and dynamic override are rejected', () => {
  assert.equal(run('deepstack-quality-gate.json', 'unknown').status, 'REJECTED');
  assert.equal(run('deepstack-quality-gate.json', 'backend', 'test', ['--allow-command','npm run danger:write']).status, 'REJECTED');
});
test('cwd escape and shell wrappers are rejected', () => {
  assert.equal(run('deepstack-quality-gate.escape.json').status, 'REJECTED');
  assert.equal(run('deepstack-quality-gate.shell.json').status, 'REJECTED');
});
test('missing runtime cannot be PASS', () => {
  assert.equal(run('deepstack-quality-gate.missing.json').status, 'NOT_CONFIGURED');
});
test('timeouts are not PASS', () => {
  assert.equal(run('deepstack-quality-gate.timeout.json', 'backend', 'test', ['--timeout-ms', '100']).status, 'TIMEOUT');
});
