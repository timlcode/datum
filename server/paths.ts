import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOME = homedir();
export const PORT = Number(process.env.DATUM_PORT) || 4517;

// dist-server/index.js at runtime, server/paths.ts under tsx.
const here = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = existsSync(join(here, '..', 'package.json')) ? resolve(here, '..') : resolve(here, '..', '..');
export const DIST_DIR = join(APP_ROOT, 'dist');
export const MPXJ_DIR = join(APP_ROOT, 'vendor', 'mpxj');
export const DATA_DIR = process.env.DATUM_DATA_DIR || join(HOME, '.local', 'share', 'datum');
export const TMP_DIR = join(DATA_DIR, 'tmp');
export const AI_CWD = join(DATA_DIR, 'ai-workspace');

for (const d of [DATA_DIR, TMP_DIR, AI_CWD]) mkdirSync(d, { recursive: true });

export function expandHome(p: string): string {
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return join(HOME, p.slice(2));
  return p;
}
