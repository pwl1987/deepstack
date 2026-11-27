/** Pure evidence adjudication, deliberately never returns owner ACCEPTED. */
const FULL_SHA = /^[0-9a-f]{40}$/;
const CHECK_KEY = ({ component, category }) => `${component}:${category}`;
export function judgeReviewEvidence({ commitSha, parentSha, treeSha, policy, ci, checks = [] }) {
  const reasons = [];
  if (!FULL_SHA.test(commitSha || '') || !FULL_SHA.test(treeSha || '') ||
      !FULL_SHA.test(parentSha || '')) {
    return { status: 'BLOCKED', ownerVerdict: 'WAIT_HUMAN', reasons: ['commit-parent-tree-unverified'] };
  }
  if (!Array.isArray(policy?.requiredWorkflows) || !policy.requiredWorkflows.length ||
      policy.requiredWorkflows.some(v => typeof v !== 'string' || !v.trim()) ||
      !Array.isArray(policy?.requiredLocalChecks) ||
      policy.requiredLocalChecks.some(v => !v || typeof v.component !== 'string' || typeof v.category !== 'string')) {
    return { status: 'INCOMPLETE', ownerVerdict: 'WAIT_HUMAN', reasons: ['verification-policy-incomplete'] };
  }
  if (!ci || ci.sha !== commitSha || ci.status !== 'PASS' ||
      !policy.requiredWorkflows.every(name => ci.workflows?.[name] === 'PASS')) {
    reasons.push('exact-sha-ci-not-passing');
  }
  const items = [];
  for (const required of policy.requiredLocalChecks) {
    const bound = checks.find(row => row?.source === 'index-matched-worktree' &&
      row.status === 'PASS' && row.checkStatus === 'PASS' &&
      row.headSha === parentSha && row.indexTreeSha === treeSha &&
      CHECK_KEY(row.check || {}) === CHECK_KEY(required));
    items.push({ component: required.component, category: required.category,
      status: bound ? 'PASS' : 'MISSING_OR_MISMATCHED' });
    if (!bound) reasons.push(`local-check-unverified:${CHECK_KEY(required)}`);
  }
  const blocked = ci?.status === 'FAIL';
  return {
    status: blocked ? 'BLOCKED' : reasons.length ? 'INCOMPLETE' : 'READY_FOR_HUMAN_REVIEW',
    ownerVerdict: 'WAIT_HUMAN', commitSha, parentSha, treeSha,
    ciStatus: ci?.status || 'UNKNOWN', localChecks: items, reasons,
    evidenceLimitations: [
      'Local reports are caller-provided and are not signed attestations',
      'CI must be independently fetched for the exact commit',
      'Review readiness is not owner acceptance, production authorization, or deploy readiness',
    ],
  };
}
