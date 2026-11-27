/** Read-only interpretation of native GitHub Issues. No workflow truth is stored here. */
import fs from 'node:fs';
import path from 'node:path';

const PRIORITY = ['REWORK', 'READY', 'NEEDS_VERIFY'];
const NEGATIVE = /不得|绝不能|不允许|不能|不静默|不引入|禁止|仅|never|must not|do not|without|only/i;
const POSITIVE = /必须|应该|应当|提供|实现|支持|显示|允许|shall|must|should|support/i;

function escaped(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function labelsFrom(raw) {
  return (raw.labels || []).map(item => typeof item === 'string' ? item : item?.name).filter(Boolean);
}
function sections(body) {
  const map = {};
  let current = '';
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) { current = heading[1].trim(); map[current] = []; continue; }
    if (current) {
      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      if (bullet) map[current].push(bullet[1].trim());
    }
  }
  return map;
}
export function parseIndexedIssue(raw, policy) {
  if (!raw || !policy || typeof policy.marker !== 'string' || !policy.marker.trim()) return null;
  if (typeof raw.body !== 'string' || typeof raw.number !== 'number') return null;
  const marker = raw.body.match(new RegExp(`<!--\\s*${escaped(policy.marker)}\\s+id:\\s*([A-Za-z0-9_-]+)\\s*-->`));
  if (!marker) return null;
  const labels = labelsFrom(raw);
  const recognized = labels.map(l => policy.statusLabels?.[l]).filter(Boolean);
  let semantic = recognized.length === 1 ? recognized[0] : 'UNCLASSIFIED';
  const ownerGate = labels.some(l => (policy.ownerGateLabels || []).includes(l));
  if (raw.state !== 'OPEN') semantic = 'CLOSED';
  else if (ownerGate) semantic = 'OWNER_GATE';
  return {
    number: raw.number, key: marker[1], title: raw.title || '', url: raw.url || '',
    state: raw.state, semantic, ownerGate, labels, sections: sections(raw.body),
    source: 'github-issue',
  };
}
export function selectCandidates(entries) {
  return (entries || []).filter(e => e && PRIORITY.includes(e.semantic))
    .sort((a, b) => PRIORITY.indexOf(a.semantic) - PRIORITY.indexOf(b.semantic) || a.number - b.number);
}
function normalizedText(input) {
  return input.replace(/^\[[ xX]\]\s*/, '').replace(/\*\*/g, '').trim();
}
export function parseBoundaryItems(entry, policy) {
  if (!entry) return [];
  const heading = policy.boundarySection || 'Acceptance Criteria';
  return (entry.sections[heading] || []).map(raw => normalizedText(raw)).filter(Boolean)
    .map((text, i) => ({ id: `M${i + 1}`, text,
      kind: NEGATIVE.test(text) ? 'NEGATIVE' : POSITIVE.test(text) ? 'POSITIVE' : 'BOUNDARY',
      evidenceStatus: 'UNVERIFIED' }));
}
function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
}
export function renderMatrix(entry, items) {
  const lines = [
    `# 反例义务矩阵 · #${entry.number} ${entry.key}`,
    '',
    '> 仅生成测试义务；不构成测试运行结果、审查通过或 owner 验收。',
    `> 来源：${entry.url || 'GitHub Issue'}；请使用具体反例和真实测试证据填充。`,
    '',
    '| ID | 需求边界 | 类型 | 反例输入/状态 | 期望行为 | 测试证据 | 证据状态 |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const item of items) {
    lines.push(`| ${item.id} | ${escapeTable(item.text)} | ${item.kind} | 待填 | 待填 | 待填 | ${item.evidenceStatus} |`);
  }
  lines.push('', '请对否定式约束构造能触发失败的输入；未运行的测试不可填写 PASS。', '');
  return lines.join('\n');
}
export function writeMatrix(fileInput, content) {
  const file = path.resolve(fileInput);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o644); }
  catch (error) {
    return { status: error.code === 'EEXIST' ? 'BLOCKED' : 'UNKNOWN',
      reason: error.code === 'EEXIST' ? 'existing-matrix-preserved' : 'write-error' };
  }
  try { fs.writeFileSync(fd, content); } finally { fs.closeSync(fd); }
  return { status: 'PASS', path: file };
}
