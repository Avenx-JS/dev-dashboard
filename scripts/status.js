#!/usr/bin/env node
/**
 * Reports the outcome of each collection step and fails when one failed.
 *
 * The workflow runs this after the site is deployed: a crashing benchmark or a
 * failing test file shows up on the dashboard AND turns the run red, instead of
 * either blocking the whole deployment (legacy behaviour) or passing silently.
 *
 * Usage: node scripts/status.js [--from .cache/collected]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/history.js';

const fromIdx = process.argv.indexOf('--from');
const from = path.resolve(fromIdx > -1 ? process.argv[fromIdx + 1] : path.join(ROOT, '.cache/collected'));
const metaFile = path.join(from, 'meta.json');
if (!fs.existsSync(metaFile)) {
  console.error(`No meta.json in ${from}`);
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

const lines = [
  '### Avenx.js Developer Dashboard',
  '',
  `Upstream \`${meta.upstream.repository}@${meta.upstream.commit.slice(0, 7)}\` (${meta.upstream.version}), Node ${meta.node}`,
  '',
  '| Step | Status | Exit | Duration | Note |',
  '| --- | --- | --- | --- | --- |',
];
let failed = 0;
for (const [step, s] of Object.entries(meta.steps)) {
  if (s.status !== 'ok') failed++;
  const note = [s.reason, s.errors != null ? `${s.errors} JSDoc errors, ${s.warnings} warnings` : null].filter(Boolean).join('; ');
  lines.push(`| ${step} | ${s.status === 'ok' ? '✅ ok' : '❌ failed'} | ${s.exitCode ?? ''} | ${s.seconds ?? ''}s | ${note} |`);
}
const text = lines.join('\n') + '\n';
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
for (const [step, s] of Object.entries(meta.steps)) {
  if (s.status !== 'ok') console.log(`::error title=${step} failed::${s.reason || 'see logs'}`);
}
process.exit(failed ? 1 : 0);
