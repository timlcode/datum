import { execFile } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MPXJ_DIR, TMP_DIR } from './paths';
import type { MpxjJson } from '../src/engine/mpxjImport';

const execFileAsync = promisify(execFile);

/** File extensions MPXJ can read. */
export const READABLE_EXTENSIONS = [
  '.mpp', '.mpt', '.mpx', '.xml', '.mspdi', '.xer', '.pmxml', '.planner', '.pod', '.pp', '.ppx',
  '.gan', '.mdb', '.sdef', '.pep', '.prx', '.cdpx', '.cdpz', '.fts', '.gnt', '.zip', '.sp', '.bk3', '.pc', '.stx',
];

export async function readWithMpxj(filePath: string): Promise<MpxjJson> {
  const out = join(TMP_DIR, `import-${process.pid}-${Date.now()}.json`);
  try {
    await execFileAsync('java', ['-Xmx1g', '-cp', `${MPXJ_DIR}/*`, 'org.mpxj.sample.MpxjConvert', filePath, out], {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
    const text = await readFile(out, 'utf8');
    return JSON.parse(text) as MpxjJson;
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const detail = (e.stderr || e.stdout || e.message || '').split('\n').filter((l) => l && !l.includes('log4j')).slice(-4).join(' ');
    throw new Error(`Could not read the schedule file. ${detail}`.trim());
  } finally {
    unlink(out).catch(() => {});
  }
}

export async function javaAvailable(): Promise<boolean> {
  try {
    await execFileAsync('java', ['-version']);
    return true;
  } catch {
    return false;
  }
}
