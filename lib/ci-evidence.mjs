/** Exact-SHA workflow evidence, never a heuristic stage-completion score. */
export function judgeCiEvidence(sha, required, runs) {
  if (!/^[a-f0-9]{40}$/.test(sha)) return { status: 'FAIL', reasons: ['invalid-full-sha'] };
  if (!Array.isArray(required) || required.length === 0 || required.some(v => typeof v !== 'string' || !v.trim())) {
    return { status: 'UNKNOWN', reasons: ['required-workflows-not-configured'] };
  }
  if (!Array.isArray(runs)) return { status: 'UNKNOWN', reasons: ['ci-response-invalid'] };
  const byWorkflow = {};
  const reasons = [];
  for (const workflow of [...new Set(required)]) {
    const found = runs.filter(run => run.headSha === sha && run.workflowName === workflow);
    if (!found.length) { byWorkflow[workflow] = 'MISSING'; reasons.push(`${workflow}:missing`); continue; }
    const bad = found.some(run => run.status === 'completed' && run.conclusion !== 'success');
    const pending = found.some(run => run.status !== 'completed');
    byWorkflow[workflow] = bad ? 'FAIL' : pending ? 'UNKNOWN' : 'PASS';
    if (byWorkflow[workflow] !== 'PASS') reasons.push(`${workflow}:${byWorkflow[workflow].toLowerCase()}`);
  }
  return {
    status: Object.values(byWorkflow).includes('FAIL') ? 'FAIL' : reasons.length ? 'UNKNOWN' : 'PASS',
    sha, workflows: byWorkflow, reasons,
  };
}
