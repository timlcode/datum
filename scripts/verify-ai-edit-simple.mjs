// Regression: a plain (non-date) AI edit on the bundled school template, plus the
// "no changes" result state via an instruction the AI cannot act on.
import { chromium } from 'playwright-core';

const URL = 'http://127.0.0.1:4517';
const OUT = '/tmp/datum-shots';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };

await page.goto(URL);
await page.evaluate(() => localStorage.removeItem('datum.autosave'));
await page.goto(URL);
await page.waitForSelector('.home');
await page.click('text=School expansion template');
await page.waitForSelector('.grid tbody tr[data-uid]');
const before = await page.locator('.grid tbody tr[data-uid]').count();

const runEdit = async (instruction) => {
  const t0 = Date.now();
  await page.keyboard.press('Control+Shift+A');
  await page.waitForSelector('.dialog textarea');
  await page.fill('.dialog textarea', instruction);
  await page.click('button:has-text("Propose changes")');
  await page.waitForSelector('.dialog .ai-preview, .dialog .finding', { timeout: 600000 });
  console.log(`answered in ${Math.round((Date.now() - t0) / 1000)}s`);
};

await runEdit('Add a 3-day "Owner walkthrough" task after the punch list, responsible Owner, and make it a predecessor of substantial completion.');
await shot('60-simple-edit-preview');
if (await page.locator('.dialog .ai-preview').count()) {
  for (const o of await page.locator('.dialog .ai-preview .tk').allInnerTexts()) console.log('  -', o);
  await page.click('.dialog button:has-text("Apply")');
  await page.waitForTimeout(400);
  console.log('rows before/after:', before, await page.locator('.grid tbody tr[data-uid]').count());
  console.log('walkthrough present:', await page.locator('td.c-name:has-text("walkthrough")').count());
} else {
  console.log('FINDING:', (await page.locator('.dialog .finding').innerText()).replace(/\n/g, ' | '));
  await page.keyboard.press('Escape');
}

await runEdit('Do not change anything. Just confirm you read the schedule.');
await shot('61-no-changes');
console.log('no-change state:', (await page.locator('.dialog .finding, .dialog .ai-preview').first().innerText()).replace(/\n/g, ' | ').slice(0, 300));
console.log('footer buttons:', (await page.locator('.dialog .d-foot button').allInnerTexts()).join(' / '));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
