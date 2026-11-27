import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts/host-acceptance.mjs');

function runCli(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
}

function makeFixtureEvidence(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-ha-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const evidencePath = path.join(dir, 'evidence.json');
  const rec = runCli(['record-fixture', '--out', evidencePath]);
  assert.equal(rec.status, 0, rec.stderr);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  return { dir, evidencePath, evidence };
}

test('import accepts valid recorded fixture evidence and keeps countsAsLiveVerified false', (t) => {
  const { evidencePath } = makeFixtureEvidence(t);
  const res = runCli(['import', '--input', evidencePath]);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const out = JSON.parse(res.stdout);
  assert.equal(out.status, 'PASS');
  assert.equal(out.countsAsLiveVerified, false);
});

test('import rejects missing repoSha or repoSha:"unknown"', (t) => {
  const { dir, evidence } = makeFixtureEvidence(t);

  const missingSha = { ...evidence };
  delete missingSha.repoSha;
  const p1 = path.join(dir, 'missing-sha.json');
  fs.writeFileSync(p1, JSON.stringify(missingSha));
  const r1 = runCli(['import', '--input', p1]);
  assert.notEqual(r1.status, 0);
  assert.equal(JSON.parse(r1.stdout).status, 'REJECTED');

  const unknownSha = { ...evidence, repoSha: 'unknown' };
  const p2 = path.join(dir, 'unknown-sha.json');
  fs.writeFileSync(p2, JSON.stringify(unknownSha));
  const r2 = runCli(['import', '--input', p2]);
  assert.notEqual(r2.status, 0);
  assert.equal(JSON.parse(r2.stdout).status, 'REJECTED');
});

test('import rejects missing caseSetDigest', (t) => {
  const { dir, evidence } = makeFixtureEvidence(t);
  const missingDigest = { ...evidence };
  delete missingDigest.caseSetDigest;
  const file = path.join(dir, 'missing-digest.json');
  fs.writeFileSync(file, JSON.stringify(missingDigest));
  const res = runCli(['import', '--input', file]);
  assert.notEqual(res.status, 0);
  assert.equal(JSON.parse(res.stdout).status, 'REJECTED');
});

test('import rejects parsed-only case entry without raw hostOutput', (t) => {
  const { dir, evidence } = makeFixtureEvidence(t);
  const tampered = {
    ...evidence,
    cases: evidence.cases.map((c, idx) => {
      if (idx !== 0) return c;
      return {
        id: c.id,
        parsed: c.parse,
      };
    }),
  };
  const file = path.join(dir, 'parsed-only.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  const res = runCli(['import', '--input', file]);
  assert.notEqual(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.status, 'FAIL');
  assert.equal(out.importAdjudication[0].status, 'MALFORMED');
  assert.equal(out.importAdjudication[0].ok, false);
});

test('import rejects paths outside repo or tmp including tmp-evil prefix trick', () => {
  const tmpPrefixTrick = path.join(path.dirname(os.tmpdir()), `${path.basename(os.tmpdir())}-evil`, 'x.json');
  const r1 = runCli(['import', '--input', tmpPrefixTrick]);
  assert.notEqual(r1.status, 0);
  assert.match(r1.stderr, /path outside repo or tmp/);

  const r2 = runCli(['import', '--input', '/tmp-evil/x.json']);
  assert.notEqual(r2.status, 0);
  assert.match(r2.stderr, /path outside repo or tmp/);
});

test('probe-live never sets liveVerified:true prior to per-case adjudication', () => {
  const res = spawnSync(process.execPath, [script, 'probe-live'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      DEEPSTACK_HOST_ACCEPTANCE: JSON.stringify({
        hostId: 'zcode',
        argv: [process.execPath, '-e', 'console.log("ok")'],
        timeoutMs: 5000,
      }),
    },
  });
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.status, 'EXECUTED');
  assert.equal(out.commandExecuted, true);
  assert.equal(out.liveVerified, false);
});
