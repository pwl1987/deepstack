import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeCiEvidence } from '../lib/ci-evidence.mjs';
const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const success = (workflowName, headSha = a) => ({ workflowName, headSha, status: 'completed', conclusion: 'success' });
test('only exact SHA of every required workflow passes', () => {
  assert.equal(judgeCiEvidence(a, ['web', 'api'], [success('web'), success('api')]).status, 'PASS');
  assert.equal(judgeCiEvidence(a, ['web', 'api'], [success('web'), success('api', b)]).status, 'UNKNOWN');
});
test('missing workflow and pending are UNKNOWN, never PASS', () => {
  assert.equal(judgeCiEvidence(a, ['web'], []).status, 'UNKNOWN');
  assert.equal(judgeCiEvidence(a, ['web'], [{ ...success('web'), status: 'in_progress', conclusion: null }]).status, 'UNKNOWN');
  assert.equal(judgeCiEvidence(a, [], [success('web')]).status, 'UNKNOWN');
});
test('failed workflow or invalid SHA cannot be promoted', () => {
  assert.equal(judgeCiEvidence(a, ['web'], [{ ...success('web'), conclusion: 'failure' }]).status, 'FAIL');
  assert.equal(judgeCiEvidence('abc', ['web'], [success('web')]).status, 'FAIL');
});
test('re-run success after earlier failure yields PASS with historical warning', () => {
  const res = judgeCiEvidence(a, ['web'], [
    { ...success('web'), databaseId: 10, createdAt: '2026-11-27T10:00:00Z', conclusion: 'failure' },
    { ...success('web'), databaseId: 11, createdAt: '2026-11-27T10:05:00Z', conclusion: 'success' },
  ]);
  assert.equal(res.status, 'PASS');
  assert.deepEqual(res.warnings, ['web:previous-non-success(1)']);
});
test('newer failure after earlier pass yields FAIL', () => {
  const res = judgeCiEvidence(a, ['web'], [
    { ...success('web'), databaseId: 20, createdAt: '2026-11-27T10:00:00Z', conclusion: 'success' },
    { ...success('web'), databaseId: 21, createdAt: '2026-11-27T10:05:00Z', conclusion: 'failure' },
  ]);
  assert.equal(res.status, 'FAIL');
});
test('unordered runs without timestamps or databaseId fall back conservatively to FAIL', () => {
  const res = judgeCiEvidence(a, ['web'], [
    { ...success('web'), conclusion: 'failure' },
    { ...success('web'), conclusion: 'success' },
  ]);
  assert.equal(res.status, 'FAIL');
});
