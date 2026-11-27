/** Exact-SHA workflow evidence, never a heuristic stage-completion score. */
export function judgeCiEvidence(sha, required, runs) {
  if (!/^[a-f0-9]{40}$/.test(sha)) return { status: 'FAIL', reasons: ['invalid-full-sha'], warnings: [] };
  if (!Array.isArray(required) || required.length === 0 || required.some(v => typeof v !== 'string' || !v.trim())) {
    return { status: 'UNKNOWN', reasons: ['required-workflows-not-configured'], warnings: [] };
  }
  if (!Array.isArray(runs)) return { status: 'UNKNOWN', reasons: ['ci-response-invalid'], warnings: [] };
  const byWorkflow = {};
  const reasons = [];
  const warnings = [];
  for (const workflow of [...new Set(required)]) {
    const found = runs.filter(run => run.headSha === sha && run.workflowName === workflow);
    if (!found.length) { byWorkflow[workflow] = 'MISSING'; reasons.push(`${workflow}:missing`); continue; }
    const orderedEligible = found.every(
      run => (typeof run.createdAt === 'string' && Number.isFinite(Date.parse(run.createdAt))) || Number.isFinite(run.databaseId)
    );
    if (orderedEligible) {
      const ordered = [...found].sort((a, b) => {
        const tsA = typeof a.createdAt === 'string' && Number.isFinite(Date.parse(a.createdAt)) ? Date.parse(a.createdAt) : null;
        const tsB = typeof b.createdAt === 'string' && Number.isFinite(Date.parse(b.createdAt)) ? Date.parse(b.createdAt) : null;
        if (tsA !== null && tsB !== null && tsB !== tsA) return tsB - tsA;
        const idA = Number.isFinite(a.databaseId) ? a.databaseId : 0;
        const idB = Number.isFinite(b.databaseId) ? b.databaseId : 0;
        return idB - idA;
      });
      const latest = ordered[0];
      if (latest.status !== 'completed') {
        byWorkflow[workflow] = 'UNKNOWN';
      } else if (latest.conclusion === 'success') {
        byWorkflow[workflow] = 'PASS';
        const priorFailures = ordered.slice(1).filter(run => run.status === 'completed' && run.conclusion !== 'success').length;
        if (priorFailures > 0) warnings.push(`${workflow}:previous-non-success(${priorFailures})`);
      } else {
        byWorkflow[workflow] = 'FAIL';
      }
    } else {
      const bad = found.some(run => run.status === 'completed' && run.conclusion !== 'success');
      const pending = found.some(run => run.status !== 'completed');
      byWorkflow[workflow] = bad ? 'FAIL' : pending ? 'UNKNOWN' : 'PASS';
    }
    if (byWorkflow[workflow] !== 'PASS') reasons.push(`${workflow}:${byWorkflow[workflow].toLowerCase()}`);
  }
  return {
    status: Object.values(byWorkflow).includes('FAIL') ? 'FAIL' : reasons.length ? 'UNKNOWN' : 'PASS',
    sha, workflows: byWorkflow, reasons, warnings,
  };
}
