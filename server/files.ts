import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { DATA_DIR, HOME, expandHome } from './paths';
import { READABLE_EXTENSIONS } from './mpxj';

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  modified?: number;
  ext?: string;
}

const SCHEDULE_EXTS = new Set(READABLE_EXTENSIONS);

export async function listDirectory(rawPath: string, opts: { all?: boolean } = {}): Promise<{ path: string; parent: string | null; entries: FsEntry[] }> {
  const path = resolve(expandHome(rawPath || HOME));
  const names = await readdir(path, { withFileTypes: true });
  const entries: FsEntry[] = [];
  for (const d of names) {
    if (d.name.startsWith('.')) continue;
    const full = join(path, d.name);
    if (d.isDirectory()) {
      entries.push({ name: d.name, path: full, isDir: true });
      continue;
    }
    if (!d.isFile()) continue;
    const ext = extname(d.name).toLowerCase();
    if (!opts.all && !SCHEDULE_EXTS.has(ext)) continue;
    try {
      const s = await stat(full);
      entries.push({ name: d.name, path: full, isDir: false, size: s.size, modified: s.mtimeMs, ext });
    } catch {
      /* unreadable */
    }
  }
  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.isDir ? -1 : 1));
  const parent = path === '/' ? null : dirname(path);
  return { path, parent, entries };
}

export function places(): { name: string; path: string }[] {
  const candidates = [
    ['Home', HOME],
    ['Desktop', join(HOME, 'Desktop')],
    ['Documents', join(HOME, 'Documents')],
    ['Downloads', join(HOME, 'Downloads')],
    ['Projects', join(HOME, 'Projects')],
    ['Schedules', join(HOME, 'Documents', 'Datum')],
  ];
  return candidates.filter(([, p]) => existsSync(p)).map(([name, path]) => ({ name, path }));
}

const RECENT_FILE = join(DATA_DIR, 'recent.json');

export interface RecentEntry {
  path: string;
  name: string;
  openedAt: number;
}

export async function readRecent(): Promise<RecentEntry[]> {
  try {
    const list = JSON.parse(await readFile(RECENT_FILE, 'utf8')) as RecentEntry[];
    return list.filter((r) => existsSync(r.path));
  } catch {
    return [];
  }
}

export async function pushRecent(path: string, name?: string): Promise<void> {
  const list = (await readRecent()).filter((r) => r.path !== path);
  list.unshift({ path, name: name || basename(path), openedAt: Date.now() });
  await writeFile(RECENT_FILE, JSON.stringify(list.slice(0, 20), null, 2));
}

export async function removeRecent(path: string): Promise<void> {
  const list = (await readRecent()).filter((r) => r.path !== path);
  await writeFile(RECENT_FILE, JSON.stringify(list, null, 2));
}
