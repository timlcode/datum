// End-to-end AI: build a schedule from the dialog, accept it, then run the AI review panel.
import { chromium } from 'playwright-core';

const URL = 'http://127.0.0.1:4517';
const OUT = '/tmp/datum-shots';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };

await page.goto(URL);
await page.evaluate(() => localStorage.removeItem('datum.autosave'));
await page.goto(URL);
await page.waitForSelector('.home');
await page.click('text=Build with AI');
await page.waitForSelector('.dialog');
await page.fill('.dialog textarea', 'Single-story 6,000 sf classroom addition to Cedar Ridge Elementary. Wood frame on slab, brick veneer, shingle roof. CMAR. Ready before the August 2027 school start.');
await page.selectOption('.dialog select >> nth=2', 'simple');
const t0 = Date.now();
await page.click('button:has-text("Build schedule")');
await page.waitForSelector('.ai-progress');
await page.waitForTimeout(4000);
await shot('40-ai-progress');
await page.waitForSelector('.ai-preview', { timeout: 600000 });
console.log('generated in', Math.round((Date.now() - t0) / 1000), 's');
await shot('41-ai-preview');
await page.click('button:has-text("Use this schedule")');
await page.waitForSelector('.grid tbody tr[data-uid]');
await page.waitForTimeout(500);
await shot('42-ai-result-gantt');
console.log('rows:', await page.locator('.grid tbody tr[data-uid]').count());
console.log('status:', (await page.locator('.statusbar').innerText()).replace(/\n/g, ' | '));

// AI review.
const t1 = Date.now();
await page.click('.btn.ai');
await page.click('.menu button:has-text("AI schedule review")');
await page.waitForSelector('.side-panel');
await page.waitForSelector('.side-panel .finding', { timeout: 600000 });
console.log('review in', Math.round((Date.now() - t1) / 1000), 's; findings:', await page.locator('.side-panel .finding').count());
await shot('43-ai-review');

// AI edit.
const t2 = Date.now();
await page.keyboard.press('Control+Shift+A');
await page.waitForSelector('.dialog textarea');
await page.fill('.dialog textarea', 'Add a 3-day "Owner walkthrough" task after the punch list, responsible Owner, and make it a predecessor of substantial completion.');
await page.click('button:has-text("Propose changes")');
await page.waitForSelector('.dialog .ai-preview', { timeout: 600000 });
console.log('edit proposed in', Math.round((Date.now() - t2) / 1000), 's');
await shot('44-ai-edit-preview');
const applyBtn = page.locator('button:has-text("Apply")');
if (await applyBtn.isEnabled()) {
  await applyBtn.click();
  await page.waitForTimeout(400);
  console.log('walkthrough present:', await page.locator('td.c-name:has-text("walkthrough")').count());
}
await shot('45-after-ai-edit');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
