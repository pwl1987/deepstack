#!/usr/bin/env node
import { acquireWriter, verifyWriter, releaseWriter, inspectWriter, breakWriter } from '../lib/writer-lease.mjs';
const [command, repo, ...rest] = process.argv.slice(2);
if (!repo || !['acquire', 'verify', 'release', 'status', 'break'].includes(command)) {
  console.error('Usage: node scripts/writer-lease.mjs <acquire|verify|release|status|break> <repo> [owner|--force --reason <text>]');
  console.error('verify/release use DEEPSTACK_WRITER_TOKEN environment variable, not argv');
  process.exit(2);
}
if (command === 'status') {
  const result = inspectWriter(repo);
  console.log(JSON.stringify(result));
  if (result.status === 'UNKNOWN') process.exitCode = 3;
  else if (result.status === 'CORRUPT') process.exitCode = 1;
} else if (command === 'break') {
  const force = rest.includes('--force');
  const reasonIdx = rest.indexOf('--reason');
  const reason = reasonIdx >= 0 ? (rest[reasonIdx + 1] ?? '') : '';
  const result = breakWriter(repo, { force, reason });
  console.log(JSON.stringify(result));
  if (result.status !== 'PASS') process.exitCode = result.status === 'UNKNOWN' ? 3 : 1;
} else {
  const result = command === 'acquire' ? acquireWriter(repo, rest[0] || 'local-agent')
    : command === 'verify' ? verifyWriter(repo, process.env.DEEPSTACK_WRITER_TOKEN)
      : releaseWriter(repo, process.env.DEEPSTACK_WRITER_TOKEN);
  console.log(JSON.stringify(result));
  if (result.status !== 'PASS') process.exitCode = result.status === 'UNKNOWN' ? 3 : 1;
}
