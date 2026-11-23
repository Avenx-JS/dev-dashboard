/**
 * Read/write access to the history files in `data/`.
 *
 * These are the only files the workflow commits back to the repository. They
 * hold one entry per recorded run and are small enough to diff by eye.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const SCHEMA_VERSION = 1;

const file = (kind) => path.join(DATA_DIR, kind, 'history.json');

/**
 * @param {'benchmarks' | 'coverage'} kind
 * @returns {{ schemaVersion: number, runs: any[] }}
 */
export function readHistory(kind) {
  if (!fs.existsSync(file(kind))) return { schemaVersion: SCHEMA_VERSION, runs: [] };
  const data = JSON.parse(fs.readFileSync(file(kind), 'utf8'));
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`${file(kind)}: schemaVersion ${data.schemaVersion}, expected ${SCHEMA_VERSION}`);
  }
  return data;
}

/**
 * @param {'benchmarks' | 'coverage'} kind
 * @param {{ runs: any[] }} history
 */
export function writeHistory(kind, history) {
  fs.mkdirSync(path.dirname(file(kind)), { recursive: true });
  const runs = [...history.runs].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  fs.writeFileSync(file(kind), JSON.stringify({ schemaVersion: SCHEMA_VERSION, runs }, null, 1) + '\n');
}
