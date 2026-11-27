#!/usr/bin/env node
/** Native GitHub Issue reader and counterexample-obligation generator. No issue writes. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseIndexedIssue, selectCandidates, parseBoundaryItems, renderMatrix, writeMatrix } from '../lib/issue-governance.mjs';

function respond(payload, code = null) {
  console.log(JSON.stringify(payload, null, 2));
  if (code !== null) process.exitCode = code;
}
function run(cwd, args) {
  const result = spawnSync('gh', args, { cwd, encoding: 'utf8', timeout: 30_000, shell: false });
  if (result.status !== 0) throw new Error('github-unavailable');
  return result.stdout.trim();
}
function within(root, file) {
  const rel = path.relative(root, file);
  return rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
const [command, repoArg, ...args] = process.argv.slice(2);
if (!command || !repoArg || !['status', 'candidates', 'matrix'].includes(command)) {
  console.error('Usage: node scripts/issue-governance.mjs <status|candidates|matrix> <repo> [--issue <n>] [--write]');
  process.exit(2);
}
const repo = path.resolve(repoArg);
try {
  const project = JSON.parse(fs.readFileSync(path.join(repo, 'deepstack.config.json'), 'utf8'));
  const policy = project.issueIndex;
  if (!policy || !policy.marker || !policy.statusLabels) {
    respond({ status: 'NOT_CONFIGURED', reason: 'issue-index-policy-not-declared' }, 3);
  } else {
    const slug = run(repo, ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
    const rows = JSON.parse(run(repo, ['issue', 'list', '-R', slug, '--state', 'all', '--limit', '1000',
      '--json', 'number,title,body,labels,state,url']));
    if (!Array.isArray(rows) || rows.length >= 1000) {
      respond({ status: 'UNKNOWN', reason: 'github-issue-list-truncated-or-malformed' }, 3);
    } else {
      const issues = rows.map(row => parseIndexedIssue(row, policy)).filter(Boolean);
      const candidates = selectCandidates(issues);
      if (command === 'status') {
        const counts = {};
        for (const issue of issues) counts[issue.semantic] = (counts[issue.semantic] || 0) + 1;
        respond({ status: 'PASS', source: 'github-issues', repository: slug, count: issues.length, counts,
          note: 'Issue projections only; project CURRENT and human gates still govern execution.' });
      } else if (command === 'candidates') {
        respond({ status: 'PASS', source: 'github-issues', repository: slug,
          candidates: candidates.map(({ number, title, key, url, semantic }) => ({ number, title, key, url, semantic })),
          note: 'Candidates are not execution authorization; check AGENTS/CURRENT first.' });
      } else {
        const index = args.indexOf('--issue');
        const issueNum = index >= 0 ? Number(args[index + 1]) : NaN;
        const issue = issues.find(item => item.number === issueNum);
        if (!issue) respond({ status: 'UNKNOWN', reason: 'indexed-issue-not-found' }, 3);
        else {
          const items = parseBoundaryItems(issue, policy);
          if (!items.length) respond({ status: 'UNKNOWN', reason: 'boundary-section-not-configured-or-empty' }, 3);
          else if (!args.includes('--write')) {
            respond({ status: 'PASS', source: 'github-issues', issue: issueNum,
              evidenceStatus: 'UNVERIFIED', markdown: renderMatrix(issue, items) });
          } else {
            const dirname = policy.matrixDir;
            if (typeof dirname !== 'string' || path.isAbsolute(dirname) || dirname.includes('\0')) {
              respond({ status: 'REJECTED', reason: 'matrix-output-dir-not-configured' }, 1);
            } else {
              const directory = path.resolve(repo, dirname);
              if (!within(repo, directory)) respond({ status: 'REJECTED', reason: 'matrix-path-escape' }, 1);
              else {
                // Check existing ancestors BEFORE creating anything: symlinks may escape.
                const realRoot = fs.realpathSync(repo);
                let ancestor = directory;
                while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
                const realAncestor = fs.realpathSync(ancestor);
                if (realRoot !== realAncestor && !within(realRoot, realAncestor)) {
                  respond({ status: 'REJECTED', reason: 'matrix-symlink-escape' }, 1);
                } else {
                  fs.mkdirSync(directory, { recursive: true });
                  const file = path.join(directory, `${issue.key}.md`);
                  const written = writeMatrix(file, renderMatrix(issue, items));
                  respond({ ...written, source: 'github-issues', issue: issueNum,
                    evidenceStatus: 'UNVERIFIED' }, written.status === 'PASS' ? 0 : 1);
                }
              }
            }
          }
        }
      }
    }
  }
} catch (error) {
  respond({ status: 'UNKNOWN', reason: error.message === 'github-unavailable' ? error.message : 'issue-reader-error' }, 3);
}
