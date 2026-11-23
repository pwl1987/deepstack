#!/usr/bin/env node
import path from 'node:path';
import { inspectWorkflow, issuePreflight, verifyPreflight, checkPush, loadWorkflowConfig } from '../lib/scm-workflow.mjs';

const [cmd, repoArg, ...args] = process.argv.slice(2);
const repo = path.resolve(repoArg || '.');
let policy;
try {
  policy = loadWorkflowConfig(repo);
  const workflowIndex = args.indexOf('--workflow');
  if (workflowIndex >= 0) {
    if (policy) throw new Error('cannot-override-repository-workflow-config');
    if (cmd !== 'check') throw new Error('write-preflight-requires-tracked-project-config');
    policy = { workflow: args[workflowIndex + 1] };
  }
  const result = cmd === 'check' ? inspectWorkflow(repo, policy)
    : cmd === 'preflight' ? issuePreflight(repo, policy)
    : cmd === 'verify-preflight' ? verifyPreflight(repo, policy)
    : cmd === 'push-check' ? checkPush(repo, policy) : null;
  if (!result) throw new Error('Usage: node scripts/scm-workflow.mjs <check|preflight|verify-preflight|push-check> <repo> [--workflow main-only|branch-pr]');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = result.status === 'UNKNOWN' ? 3 : 1;
} catch (error) {
  console.error(error.message); process.exitCode = 2;
}
