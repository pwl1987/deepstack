/** Pure evidence adjudication, deliberately never returns owner ACCEPTED. */
const FULL_SHA = /^[0-9a-f]{40}$/;
const CHECK_KEY = ({ component, category }) => `${component}:${category}`;
export function judgeReviewEvidence({ commitSha, parentSha, parentShas, treeSha, policy, ci, checks = [] }) {
  const reasons = [];
  const parents = Array.isArray(parentShas)
    ? parentShas
    : (parentSha !== undefined && parentSha !== null && parentSha !== '' ? [parentSha] : []);
  if (!FULL_SHA.test(commitSha || '') || !FULL_SHA.test(treeSha || '') ||
      (parentShas === undefined && !parentSha) ||
      !parents.every(p => FULL_SHA.test(p || ''))) {
    return { status: 'BLOCKED', ownerVerdict: 'WAIT_HUMAN', reasons: ['commit-parent-tree-unverified'] };
  }
  const isMergeCommit = parents.length > 1;
  const isRootCommit = parents.length === 0;
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
  if (policy.requiredLocalChecks.length > 0) {
    if (isMergeCommit) {
      for (const required of policy.requiredLocalChecks) {
        items.push({ component: required.component, category: required.category, status: 'MISSING_OR_MISMATCHED' });
      }
      reasons.push('merge-commit-not-supported-for-staged-binding');
    } else if (isRootCommit) {
      for (const required of policy.requiredLocalChecks) {
        items.push({ component: required.component, category: required.category, status: 'MISSING_OR_MISMATCHED' });
      }
      reasons.push('root-commit-not-supported-for-staged-binding');
    } else {
      for (const required of policy.requiredLocalChecks) {
        const bound = checks.find(row => row?.source === 'index-matched-worktree' &&
          row.status === 'PASS' && row.checkStatus === 'PASS' &&
          row.headSha === parents[0] && row.indexTreeSha === treeSha &&
          CHECK_KEY(row.check || {}) === CHECK_KEY(required));
        items.push({ component: required.component, category: required.category,
          status: bound ? 'PASS' : 'MISSING_OR_MISMATCHED' });
        if (!bound) reasons.push(`local-check-unverified:${CHECK_KEY(required)}`);
      }
    }
  }
  const blocked = ci?.status === 'FAIL';
  return {
    status: blocked ? 'BLOCKED' : reasons.length ? 'INCOMPLETE' : 'READY_FOR_HUMAN_REVIEW',
    ownerVerdict: 'WAIT_HUMAN', commitSha, parentSha: parents[0] || null, parentShas: parents, isMergeCommit, treeSha,
    ciStatus: ci?.status || 'UNKNOWN', localChecks: items, reasons,
    evidenceLimitations: [
      'Local reports are caller-provided and are not signed attestations',
      'CI must be independently fetched for the exact commit',
      'Review readiness is not owner acceptance, production authorization, or deploy readiness',
    ],
  };
}
