// Drives the built app in the system Chromium and captures screenshots.
// Usage: node scripts/verify.mjs [step]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.DATUM_URL || 'http://127.0.0.1:4517';
const OUT = '/tmp/datum-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

await page.goto(URL);
await page.waitForSelector('.home');
await shot('01-home');

// Open the school template.
await page.click('text=School expansion template');
await page.waitForSelector('.grid tbody tr');
await page.waitForTimeout(400);
await shot('02-gantt-template');

// Task sheet view.
await page.click('.view-tabs button:has-text("Task Sheet")');
await page.waitForTimeout(200);
await shot('03-sheet');

// Look-ahead.
await page.click('.view-tabs button:has-text("Look-Ahead")');
await page.waitForTimeout(200);
await shot('04-lookahead');

// Milestones.
await page.click('.view-tabs button:has-text("Milestones")');
await page.waitForTimeout(200);
await shot('05-milestones');

// Back to gantt, edit a cell: change duration of row 3.
await page.click('.view-tabs button:has-text("Gantt")');
await page.waitForTimeout(200);
const rows = page.locator('.grid tbody tr[data-uid]');
console.log('rows', await rows.count());
const durCell = rows.nth(2).locator('td.c-dur');
const before = await durCell.textContent();
await durCell.dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.type('12d');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const after = await rows.nth(2).locator('td.c-dur').textContent();
console.log('duration edit', before, '->', after);

// Edit predecessors on row 4 with a bad value to see the inline error.
const predCell = rows.nth(3).locator('td.c-pred');
await predCell.dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.type('999');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await shot('06-pred-error');
const err = await page.locator('.cell-error').textContent().catch(() => null);
console.log('pred error shown:', err);
await page.keyboard.press('Escape');

// Insert a task via Insert key with row 3 active.
await rows.nth(2).locator('td.c-name').click();
await page.keyboard.press('Insert');
await page.waitForTimeout(200);
await page.keyboard.type('Verification task');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
console.log('rows after insert', await rows.count());
const inserted = await page.locator('.grid tbody tr[data-uid] td.c-name:has-text("Verification task")').count();
console.log('inserted visible:', inserted);

// Undo twice.
await page.keyboard.press('Control+Z');
await page.waitForTimeout(100);
console.log('rows after undo', await rows.count());

// Details panel.
await page.keyboard.press('Control+I');
await page.waitForTimeout(200);
await shot('07-details');

// Health panel.
await page.click('button:has-text("Health")');
await page.waitForTimeout(200);
await shot('08-health');

// Print dialog.
await page.keyboard.press('Control+P');
await page.waitForTimeout(300);
await shot('09-print-dialog');
await page.keyboard.press('Escape');

// AI build dialog (no generation).
await page.click('.btn.ai');
await page.waitForTimeout(150);
await shot('10-ai-menu');
await page.keyboard.press('Escape');

// Command palette.
await page.keyboard.press('Control+K');
await page.waitForTimeout(200);
await shot('11-palette');
await page.keyboard.press('Escape');

// Save As dialog.
await page.keyboard.press('Control+Shift+S');
await page.waitForSelector('.filebrowser');
await page.waitForTimeout(400);
await shot('12-saveas');

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
