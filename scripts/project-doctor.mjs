#!/usr/bin/env node
import { inspectProject } from '../lib/project-doctor.mjs';
const [repo, ...args] = process.argv.slice(2);
if (!repo || args.length) {
  console.error('Usage: node scripts/project-doctor.mjs <project-repo-or-child-dir>');
  process.exit(2);
}
const result = inspectProject(repo);
console.log(JSON.stringify(result, null, 2));
if (result.status === 'BLOCKED' || result.status === 'CONFLICT') process.exitCode = 1;
else if (result.status !== 'READONLY_READY') process.exitCode = 3;
