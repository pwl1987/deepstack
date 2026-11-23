#!/usr/bin/env node
import { acquireWriter, verifyWriter, releaseWriter } from '../lib/writer-lease.mjs';
const [command, repo, arg] = process.argv.slice(2);
if (!repo || !['acquire', 'verify', 'release'].includes(command)) {
  console.error('Usage: node scripts/writer-lease.mjs <acquire|verify|release> <repo> [owner]');
  console.error('verify/release use DEEPSTACK_WRITER_TOKEN environment variable, not argv');
  process.exit(2);
}
const result = command === 'acquire' ? acquireWriter(repo, arg || 'local-agent')
  : command === 'verify' ? verifyWriter(repo, process.env.DEEPSTACK_WRITER_TOKEN)
    : releaseWriter(repo, process.env.DEEPSTACK_WRITER_TOKEN);
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = result.status === 'UNKNOWN' ? 3 : 1;
