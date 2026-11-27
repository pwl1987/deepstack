import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectProject } from '../lib/project-doctor.mjs';

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function fixture(t, options = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-doctor-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const remote = path.join(home, 'origin.git');
  const repo = path.join(home, 'repo');
  git(home, 'init', '--bare', '-b', 'main', remote);
  git(home, 'init', '-b', 'main', repo);
  git(repo, 'config', 'user.email', 'fixture@example.test');
  git(repo, 'config', 'user.name', 'fixture');
  fs.mkdirSync(path.join(repo, '.project'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# Rules\n');
  fs.writeFileSync(path.join(repo, '.project', 'STATUS.md'), '# Status\n');
  fs.writeFileSync(path.join(repo, '.project', 'TODO.md'), options.todo ?? '- [>] Task A\n');
  fs.writeFileSync(path.join(repo, 'deepstack.config.json'), JSON.stringify({
    git: { workflow: 'main-only', baseBranch: 'main', writerPolicy: 'local' },
  }));
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"fixture","private":true}');
  fs.writeFileSync(path.join(repo, 'pyproject.toml'), '[project]\nname="fixture"\nversion="0.1.0"\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'initial');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-u', 'origin', 'main');
  return { repo, home };
}
test('doctor is read-only, preserves project Authority, detects mixed stack', (t) => {
  const { repo } = fixture(t);
  const before = git(repo, 'status', '--porcelain');
  const r = inspectProject(repo);
  assert.equal(r.status, 'READONLY_READY', JSON.stringify(r));
  assert.equal(r.git.status, 'PASS');
  assert.equal(r.task.status, 'ONE_CURRENT_DECLARATION');
  assert.equal(r.task.source, '.project/TODO.md');
  assert.deepEqual(r.technologies.sort(), ['node', 'python']);
  assert.deepEqual(r.authorityPaths.slice(0, 2), ['AGENTS.md', '.project/STATUS.md']);
  assert.equal(r.writePermission, 'NOT_EVALUATED');
  assert.equal(git(repo, 'status', '--porcelain'), before);
});
test('doctor does not turn multiple CURRENT declarations into an execution task', (t) => {
  const { repo } = fixture(t, { todo: '- [>] Task A\n- [>] Task B\n' });
  const result = inspectProject(repo);
  assert.equal(result.status, 'CONFLICT');
  assert.equal(result.task.status, 'CONFLICT');
  assert.equal(result.task.current, null);
});
test('without policy doctor never invents main-only or write permission', (t) => {
  const { repo } = fixture(t);
  fs.rmSync(path.join(repo, 'deepstack.config.json'));
  const result = inspectProject(repo);
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.equal(result.git.status, 'NOT_CONFIGURED');
});
test('dirty or non-main checkout is never write-ready', (t) => {
  const { repo } = fixture(t);
  git(repo, 'switch', '-c', 'feature/unsafe');
  let r = inspectProject(repo);
  assert.equal(r.status, 'BLOCKED');
  git(repo, 'switch', 'main');
  fs.appendFileSync(path.join(repo, 'AGENTS.md'), 'mutated\n');
  r = inspectProject(repo);
  assert.equal(r.status, 'BLOCKED');
});
test('nested project directory resolves its Git root, not its parent', (t) => {
  const { repo } = fixture(t);
  const sub = path.join(repo, '.project');
  const result = inspectProject(sub);
  assert.equal(result.repo, repo);
  assert.equal(result.status, 'READONLY_READY');
});
test('missing Git repo is reported without creating files', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-no-git-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = inspectProject(dir);
  assert.equal(r.status, 'UNKNOWN');
  assert.deepEqual(fs.readdirSync(dir), []);
});
