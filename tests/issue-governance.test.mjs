import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseIndexedIssue, selectCandidates, parseBoundaryItems, renderMatrix, writeMatrix } from '../lib/issue-governance.mjs';

const config = { marker: 'delivery-index/v1', statusLabels: {
  'workflow:rework': 'REWORK', 'workflow:ready': 'READY',
  'workflow:needs-verify': 'NEEDS_VERIFY', 'workflow:done': 'DONE',
}, ownerGateLabels: ['owner:required'],
  boundarySection: 'Acceptance Criteria',
};
function issue(number, status, body = '') {
  return { number, title: `Item ${number}`, state: 'OPEN',
    body: `<!-- delivery-index/v1 id: T-${number} -->\n### Acceptance Criteria\n- [ ] Must keep previous data\n- [ ] Never silently overwrite\n${body}`,
    labels: [{ name: status }], url: `https://github.com/example/repo/issues/${number}` };
}
test('indexed issue needs an exact marker and configured status', () => {
  assert.equal(parseIndexedIssue(issue(2, 'workflow:ready'), config).semantic, 'READY');
  assert.equal(parseIndexedIssue({ ...issue(3, 'workflow:ready'), body: 'Missing marker' }, config), null);
  assert.equal(parseIndexedIssue(issue(4, 'unknown'), config).semantic, 'UNCLASSIFIED');
});
test('candidate ordering is fail-safe and does not treat owner gate as runnable', () => {
  const list = [issue(2, 'workflow:ready'), issue(9, 'workflow:rework'),
    { ...issue(1, 'workflow:ready'), labels: [{ name: 'workflow:ready' }, { name: 'owner:required' }] },
    { ...issue(4, 'workflow:ready'), state: 'CLOSED' }, issue(10, 'workflow:needs-verify')];
  const parsed = list.map(item => parseIndexedIssue(item, config));
  assert.deepEqual(selectCandidates(parsed).map(i => i.number), [9, 2, 10]);
});
test('boundary parsing produces obligations not proof, preserves Chinese negative rule', () => {
  const src = issue(9, 'workflow:ready', '- [ ] 不得静默覆盖工作区内容');
  const entry = parseIndexedIssue(src, config);
  const items = parseBoundaryItems(entry, config);
  assert.equal(items.length, 3);
  assert.ok(items.some(item => item.kind === 'NEGATIVE'));
  assert.ok(items.every(item => item.evidenceStatus === 'UNVERIFIED'));
  assert.ok(renderMatrix(entry, items).includes('UNVERIFIED'));
});
test('existing human matrix is never overwritten silently', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepstack-matrix-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'matrix.md');
  assert.equal(writeMatrix(file, 'first').status, 'PASS');
  assert.equal(writeMatrix(file, 'new').status, 'BLOCKED');
  assert.equal(fs.readFileSync(file, 'utf8'), 'first');
});
