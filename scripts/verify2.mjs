// Second pass: open a real .mpp, edit, drag a bar, save as XML, re-open, print preview.
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

const URL = 'http://127.0.0.1:4517';
const OUT = '/tmp/datum-shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };

// Launch with ?open= like the desktop entry does.
const mpp = process.env.DATUM_TEST_MPP ?? 'sample.mpp';
await page.goto(`${URL}/?open=${encodeURIComponent(mpp)}`);
await page.waitForSelector('.grid tbody tr[data-uid]', { timeout: 30000 });
await page.waitForTimeout(500);
await shot('20-real-mpp');
const rows = page.locator('.grid tbody tr[data-uid]');
console.log('rows from mpp:', await rows.count());
console.log('status:', await page.locator('.statusbar').innerText());

// Zoom to month and screenshot.
await page.click('.toolbar .seg button:has-text("Month")');
await page.waitForTimeout(300);
await shot('21-real-mpp-month');

// Drag a bar: find the first non-summary bar rect and drag it right by 3 weeks (week zoom 11px/day).
await page.click('.toolbar .seg button:has-text("Week")');
await page.waitForTimeout(200);
const bar = page.locator('.gantt g.bar rect[rx="3"]').first();
const box = await bar.boundingBox();
if (box) {
  const finishBefore = await page.locator('.grid tbody tr.active td.c-finish').textContent().catch(() => '');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 77, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const row = page.locator('.grid tbody tr.active');
  console.log('after drag -> start:', await row.locator('td.c-start').textContent(), 'constraint set?', await page.locator('.grid tbody tr.active').count(), 'finishBefore', finishBefore);
  await shot('22-after-drag');
  await page.keyboard.press('Control+Z');
}

// Link two tasks by dragging the handle: hover row 3's bar then drag the dot to row 5.
// (covered by unit logic; skip flaky drag)

// Save as XML into /tmp via the dialog.
await page.keyboard.press('Control+Shift+S');
await page.waitForSelector('.filebrowser');
await page.waitForTimeout(300);
// Navigate to /tmp via crumbs: click "/" then type name.
await page.click('.crumbs button:has-text("/")');
await page.waitForTimeout(300);
await page.dblclick('.entry.dir:has-text("tmp")');
await page.waitForTimeout(300);
const nameInput = page.locator('.namebar input');
await nameInput.fill('datum-verify');
await page.click('.d-foot button:has-text("Save")');
await page.waitForTimeout(1500);
console.log('saved exists:', existsSync('/tmp/datum-verify.xml'));
console.log('title sub:', await page.locator('.project-title .sub').innerText());
await shot('23-after-save');

// Re-open the saved XML through the Open dialog recent list.
await page.keyboard.press('Control+O');
await page.waitForSelector('.filebrowser');
await page.click('.places button:has-text("datum-verify")').catch(async () => {
  await page.click('.crumbs button:has-text("/")');
  await page.dblclick('.entry.dir:has-text("tmp")');
  await page.dblclick('.entry:has-text("datum-verify.xml")');
});
await page.waitForTimeout(2500);
console.log('rows after reopen:', await rows.count(), 'title:', await page.locator('.project-title input').inputValue());

// Print preview page renders.
const p2 = await ctx.newPage();
const job = await (await fetch(`${URL}/api/print/job`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: JSON.parse(readFileSync('/tmp/school-template.json', 'utf8')), options: { view: 'gantt', paper: 'letter', orientation: 'landscape' } }) })).json();
await p2.goto(`${URL}/print?token=${job.token}`);
await p2.waitForSelector('.rep');
await p2.waitForTimeout(500);
await p2.screenshot({ path: `${OUT}/24-print-preview.png`, fullPage: false });
console.log('print preview ok');

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
