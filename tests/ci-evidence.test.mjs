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
