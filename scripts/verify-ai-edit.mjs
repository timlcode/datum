// End-to-end AI edit with a date-driven instruction on a restored autosave.
// Usage: node scripts/verify-ai-edit.mjs /path/to/project.json /path/to/instruction.txt
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const URL = 'http://127.0.0.1:4517';
const OUT = '/tmp/datum-shots';
const project = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const instruction = readFileSync(process.argv[3], 'utf8').trim();

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };

await page.goto(URL);
await page.evaluate((p) => localStorage.setItem('datum.autosave', JSON.stringify({ savedAt: Date.now(), project: p })), project);
await page.goto(URL);
await page.waitForSelector('.home .recover');
await page.click('.home .recover button');
await page.waitForSelector('.grid tbody tr[data-uid]');
console.log('rows:', await page.locator('.grid tbody tr[data-uid]').count());

const t0 = Date.now();
await page.keyboard.press('Control+Shift+A');
await page.waitForSelector('.dialog textarea');
await page.fill('.dialog textarea', instruction);
await page.click('button:has-text("Propose changes")');
await page.waitForSelector('.dialog .ai-progress');
await page.waitForTimeout(3000);
await shot('50-ai-edit-progress');
console.log('progress text:', (await page.locator('.dialog .ai-progress .st').innerText()).trim());
await page.waitForSelector('.dialog .ai-preview, .dialog .finding', { timeout: 600000 });
console.log('answered in', Math.round((Date.now() - t0) / 1000), 's');
await shot('51-ai-edit-result');
const preview = page.locator('.dialog .ai-preview');
if (await preview.count()) {
  console.log('explanation:', (await preview.locator('.sum').innerText()).trim());
  const ops = await preview.locator('.tk').allInnerTexts();
  console.log('ops (' + ops.length + '):');
  for (const o of ops) console.log('  -', o);
  await page.click('.dialog button:has-text("Apply")');
  await page.waitForTimeout(600);
  await shot('52-after-apply-gantt');
  console.log('toast:', (await page.locator('.toast, .toasts').allInnerTexts()).join(' | '));
  await page.click('.view-tabs button:has-text("Task Sheet")');
  await page.waitForTimeout(300);
  await shot('53-after-apply-sheet');
  console.log('status:', (await page.locator('.statusbar').innerText()).replace(/\n/g, ' | '));
} else {
  console.log('finding:', (await page.locator('.dialog .finding').innerText()).replace(/\n/g, ' | '));
}
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
