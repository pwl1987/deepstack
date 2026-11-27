import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeReviewEvidence } from '../lib/review-evidence.mjs';
const parent = 'a'.repeat(40), tree = 'b'.repeat(40), commit = 'c'.repeat(40);
const ci = { status: 'PASS', sha: commit, workflows: { validate: 'PASS' }, reasons: [] };
const required = { requiredWorkflows: ['validate'], requiredLocalChecks: [{ component: 'backend', category: 'test' }] };
const evidence = { source: 'index-matched-worktree', status: 'PASS', checkStatus: 'PASS', headSha: parent,
  indexTreeSha: tree, check: { component: 'backend', category: 'test' } };
const input = { commitSha: commit, parentSha: parent, treeSha: tree, policy: required, ci, checks: [evidence] };
test('exact parent/tree + required local checks + CI only yields review readiness', () => {
  const result = judgeReviewEvidence(input);
  assert.equal(result.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(result.ownerVerdict, 'WAIT_HUMAN');
});
test('wrong tree or different parent cannot be promoted', () => {
  assert.notEqual(judgeReviewEvidence({ ...input, treeSha: 'd'.repeat(40) }).status, 'READY_FOR_HUMAN_REVIEW');
  assert.notEqual(judgeReviewEvidence({ ...input, parentSha: 'd'.repeat(40) }).status, 'READY_FOR_HUMAN_REVIEW');
});
test('missing local evidence or failed CI is not ready', () => {
  assert.equal(judgeReviewEvidence({ ...input, checks: [] }).status, 'INCOMPLETE');
  assert.equal(judgeReviewEvidence({ ...input, ci: { ...ci, status: 'UNKNOWN' } }).status, 'INCOMPLETE');
  assert.equal(judgeReviewEvidence({ ...input, ci: { ...ci, status: 'FAIL' } }).status, 'BLOCKED');
});
test('missing required policy cannot pass, even if CI happens to be green', () => {
  assert.equal(judgeReviewEvidence({ ...input, policy: {} }).status, 'INCOMPLETE');
});
test('checking some other category cannot satisfy required one', () => {
  assert.equal(judgeReviewEvidence({ ...input, checks: [{ ...evidence, check: { category: 'lint', component: 'backend' } }] }).status, 'INCOMPLETE');
});
test('local staged report can be omitted only by an explicit no-local-checks policy', () => {
  assert.equal(judgeReviewEvidence({ ...input, checks: [], policy: { ...required, requiredLocalChecks: [] } }).status, 'READY_FOR_HUMAN_REVIEW');
});
