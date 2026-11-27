#!/usr/bin/env node
/** Optional host SessionStart adapter. Read-only facts; no auth, state or mutation. */
import path from 'node:path';
import { inspectProject } from '../lib/project-doctor.mjs';

async function readPayload() {
  let text = '';
  try {
    for await (const chunk of process.stdin) {
      text += String(chunk);
      if (text.length > 32_768) return {};
    }
    const input = JSON.parse(text || '{}');
    return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  } catch { return {}; }
}
function line(value) { return String(value ?? 'UNKNOWN').replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, 240); }
try {
  const input = await readPayload();
  const candidate = process.env.DEEPSTACK_PROJECT_ROOT ||
    (typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd());
  const project = inspectProject(candidate);
  const lines = [
    '[DeepStack read-only project preflight]',
    `Project: ${line(project.repo || 'UNKNOWN')}`,
    `Status: ${line(project.status)}`,
    `Git: ${line(project.git?.status || 'NOT_CONFIGURED')} (${line(project.policy?.workflow || 'not-declared')})`,
    `Authority pointers: ${(project.authorityPaths || []).map(line).join(', ') || 'not-detected'}`,
    `CURRENT declaration: ${line(project.task?.status || 'UNKNOWN')}`,
    `Detected stacks: ${(project.technologies || []).map(line).join(', ') || 'not-detected'}`,
    'Read-only context only. Never treat task candidates, hook output, or preflight as write authorization.',
  ];
  process.stdout.write(lines.join('\n') + '\n');
} catch {
  process.stdout.write('[DeepStack read-only project preflight] Status: UNKNOWN (adapter-error); no permission granted\n');
}
