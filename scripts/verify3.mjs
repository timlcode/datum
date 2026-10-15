// Save-as XML, reopen, AI edit dialog rendering, settings dialog, mobile-ish narrow viewport.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

const URL = 'http://127.0.0.1:4517';
const OUT = '/tmp/datum-shots';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };

if (existsSync('/tmp/datum-verify.xml')) unlinkSync('/tmp/datum-verify.xml');
const mpp = process.env.DATUM_TEST_MPP ?? 'sample.mpp';
await page.goto(`${URL}/?open=${encodeURIComponent(mpp)}`);
await page.waitForSelector('.grid tbody tr[data-uid]', { timeout: 30000 });
const rows = page.locator('.grid tbody tr[data-uid]');
const countBefore = await rows.count();

// Save As into /tmp.
await page.keyboard.press('Control+Shift+S');
await page.waitForSelector('.filebrowser');
await page.waitForTimeout(300);
await page.click('[data-crumb="root"]');
await page.waitForTimeout(400);
await shot('30-root-listing');
await page.dblclick('.entry.dir:has-text("tmp")');
await page.waitForTimeout(400);
await page.locator('.namebar input').fill('datum-verify');
await page.click('.d-foot button:has-text("Save")');
await page.waitForTimeout(1500);
console.log('saved exists:', existsSync('/tmp/datum-verify.xml'), 'sub:', await page.locator('.project-title .sub').innerText());

// Ctrl+S now saves in place (no dialog).
await rows.nth(2).locator('td.c-name').dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.type('Build new demising wall (edited)');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await page.keyboard.press('Control+S');
await page.waitForTimeout(1200);
console.log('dialog open after Ctrl+S?', await page.locator('.filebrowser').count(), 'saved text:', await page.locator('.statusbar .pill').last().innerText());
console.log('xml has edit:', readFileSync('/tmp/datum-verify.xml', 'utf8').includes('Build new demising wall (edited)'));

// Reopen the XML from the home screen recent list.
await page.click('button:has-text("File")');
await page.click('.menu button:has-text("Close schedule")');
await page.waitForSelector('.home');
await page.waitForTimeout(400);
await shot('31-home-recent');
await page.click('.recent button:has-text("datum-verify")');
await page.waitForSelector('.grid tbody tr[data-uid]', { timeout: 30000 });
await page.waitForTimeout(300);
console.log('reopened rows:', await rows.count(), 'before:', countBefore, 'edited name present:', await page.locator('td.c-name:has-text("(edited)")').count());

// Settings dialog.
await page.click('button:has-text("File")');
await page.click('.menu button:has-text("Project settings")');
await page.waitForSelector('.dialog');
await page.click('button:has-text("Add US holidays")');
await page.waitForTimeout(200);
await shot('32-settings');
await page.click('button:has-text("Save settings")');
await page.waitForTimeout(300);

// AI edit dialog renders.
await page.keyboard.press('Control+Shift+A');
await page.waitForSelector('.dialog');
await shot('33-ai-edit');
await page.keyboard.press('Escape');

// AI build dialog renders.
await page.click('.btn.ai');
await page.click('.menu button:has-text("Build a new schedule")');
await page.waitForSelector('.dialog');
await page.click('.chip:has-text("Example 1")');
await shot('34-ai-build');
await page.keyboard.press('Escape');

// Narrow viewport check (laptop half-screen).
await page.setViewportSize({ width: 1100, height: 700 });
await page.waitForTimeout(300);
await shot('35-narrow');
await page.setViewportSize({ width: 800, height: 600 });
await page.waitForTimeout(300);
await shot('36-narrower');

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
