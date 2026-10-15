import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { PORT, TMP_DIR } from './paths';

const execFileAsync = promisify(execFile);

/** Print jobs are stored briefly so the headless browser can fetch the project. */
const jobs = new Map<string, { project: unknown; options: unknown; createdAt: number }>();

export function createPrintJob(project: unknown, options: unknown): string {
  const token = randomUUID();
  jobs.set(token, { project, options, createdAt: Date.now() });
  for (const [k, v] of jobs) if (Date.now() - v.createdAt > 15 * 60_000) jobs.delete(k);
  return token;
}

export function getPrintJob(token: string) {
  return jobs.get(token);
}

export function findChromium(): string | null {
  const candidates = [process.env.DATUM_BROWSER, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/brave', '/usr/bin/microsoft-edge'];
  for (const c of candidates) if (c && existsSync(c)) return c;
  return null;
}

export async function renderPdf(token: string, outPath: string, opts: { landscape?: boolean; paper?: string } = {}): Promise<{ path: string; bytes: number }> {
  const browser = findChromium();
  if (!browser) throw new Error('No Chromium-based browser found for PDF export. Install chromium.');
  await mkdir(dirname(outPath), { recursive: true });
  const url = `http://127.0.0.1:${PORT}/print?token=${token}&pdf=1`;
  const profile = join(TMP_DIR, `chrome-${process.pid}`);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=15000',
    `--user-data-dir=${profile}`,
    '--no-pdf-header-footer',
    `--print-to-pdf=${outPath}`,
    url,
  ];
  try {
    await execFileAsync(browser, args, { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    if (!existsSync(outPath)) throw new Error(`PDF export failed. ${(e.stderr || e.message || '').split('\n').slice(-2).join(' ')}`.trim());
  }
  const buf = await readFile(outPath);
  return { path: outPath, bytes: buf.length };
}

export async function cleanupTemp(path: string) {
  await unlink(path).catch(() => {});
}
