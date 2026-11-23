/**
 * Read-only project cold start. Facts come from project Git and declared Authority.
 * No task/CI/permissions are inferred from agent memory or duplicated into state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectWorkflow } from './scm-workflow.mjs';

function git(cwd, ...args) {
  const child = spawnSync('git', args, {
    cwd, encoding: 'utf8', timeout: 20_000, shell: false,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return child.status === 0 ? child.stdout.trim() : null;
}
function contained(root, file) {
  const rel = path.relative(root, file);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}
function existingFile(root, relative) {
  const file = path.join(root, relative);
  try {
    if (!fs.statSync(file).isFile() || !contained(root, fs.realpathSync(file))) return false;
    return true;
  } catch { return false; }
}
function parseCurrent(root) {
  const source = '.project/TODO.md';
  if (!existingFile(root, source)) {
    return { status: 'NO_CURRENT_DECLARATION', current: null, source: null, count: 0 };
  }
  let text;
  try { text = fs.readFileSync(path.join(root, source), 'utf8'); }
  catch { return { status: 'UNKNOWN', current: null, source, count: null }; }
  const lines = text.split(/\r?\n/).filter(line => /^\s*-\s*\[>\]\s*\S/.test(line));
  if (lines.length === 1) {
    return { status: 'ONE_CURRENT_DECLARATION', current: lines[0].trim().slice(0, 400), source, count: 1 };
  }
  if (lines.length > 1) return { status: 'CONFLICT', current: null, source, count: lines.length };
  return { status: 'NO_CURRENT_DECLARATION', current: null, source, count: 0 };
}
function detectTechnologies(root) {
  const node = ['package.json', 'web/package.json', 'frontend/package.json', 'client/package.json'];
  const python = ['pyproject.toml', 'requirements.txt', 'setup.py', 'backend/pyproject.toml', 'backend/requirements.txt'];
  return [node.some(p => existingFile(root, p)) && 'node',
    python.some(p => existingFile(root, p)) && 'python'].filter(Boolean);
}
const AUTHORITY_FILES = ['AGENTS.md', '.project/STATUS.md', '.project/TODO.md',
  'CURRENT.md', '.project/CURRENT.md', 'CLAUDE.md'];
export function inspectProject(repoInput) {
  const requested = path.resolve(repoInput);
  const gitRoot = git(requested, 'rev-parse', '--show-toplevel');
  if (!gitRoot) return {
    schema: 1, status: 'UNKNOWN', reason: 'not-a-single-git-worktree',
    requested, writePermission: 'NOT_EVALUATED',
  };
  const root = path.resolve(gitRoot);
  const authorityPaths = AUTHORITY_FILES.filter(p => existingFile(root, p));
  const task = parseCurrent(root);
  const technologies = detectTechnologies(root);
  let policy = null;
  let gitState = { status: 'NOT_CONFIGURED', reasons: ['workflow-not-declared'] };
  const configPath = 'deepstack.config.json';
  if (existingFile(root, configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(root, configPath), 'utf8'));
      policy = config.git || (config.workflow ? config : null);
      if (policy) gitState = inspectWorkflow(root, policy);
    } catch (error) {
      gitState = { status: 'FAIL', reasons: ['project-config-invalid'] };
    }
  }
  const reasons = [];
  if (task.status === 'CONFLICT') reasons.push('multiple-current-task-declarations');
  if (gitState.status === 'FAIL') reasons.push(...(gitState.reasons || ['git-admission-failed']));
  else if (gitState.status === 'UNKNOWN') reasons.push(...(gitState.reasons || ['git-unverified']));
  let status = gitState.status === 'FAIL' ? 'BLOCKED' : gitState.status === 'UNKNOWN' ? 'UNKNOWN'
    : gitState.status === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'READONLY_READY';
  if (task.status === 'CONFLICT') status = 'CONFLICT';
  return {
    schema: 1, status, requested, repo: root, git: gitState,
    policy: policy ? { workflow: policy.workflow || null, baseBranch: policy.baseBranch || 'main' } : null,
    authorityPaths, task, technologies, reasons,
    writePermission: 'NOT_EVALUATED',
    note: 'Read-only project facts; does not select or authorize execution, writer, commit or deployment.',
  };
}
