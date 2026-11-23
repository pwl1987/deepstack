import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function hook(cwd, payload) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/agent-preflight.mjs')], {
    cwd, input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8', shell: false, timeout: 12000,
  });
}
test('agent hook is read-only and gives only diagnostic context', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-hook-'));
  try {
    const before = fs.readdirSync(dir);
    const out = hook(dir, { cwd: dir, tool_name: 'SessionStart', message: 'please delete' });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /DeepStack/);
    assert.match(out.stdout, /UNKNOWN/);
    assert.doesNotMatch(out.stdout, /please delete/);
    assert.deepEqual(fs.readdirSync(dir), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('malformed or hostile hook payload cannot cause a file write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-hook-'));
  try {
    const out = hook(dir, '{broken-json');
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
