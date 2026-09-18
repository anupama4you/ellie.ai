const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/.netlify/functions/demo-vapi-config', route => route.fulfill({ json: { publicKey: 'test-public', assistantId: 'test-assistant', assistantOverrides: { firstMessage: 'Hello' } } }));
  await page.addInitScript(() => {
    window.clients = [];
    window.Vapi = class {
      constructor(key) { this.events = {}; window.clients.push(this); }
      on(event, fn) { this.events[event] = fn; }
      emit(event, value) { this.events[event]?.(value); }
      async start() { this.emit('call-start'); return { id: 'test' }; }
      stop() { this.stopped = true; this.emit('call-end'); }
      setMuted(value) { this.muted = value; }
    };
  });
  await page.goto('http://localhost:8765/');
  const avatar = page.locator('ellie-avatar');
  await avatar.scrollIntoViewIfNeeded();
  await avatar.screenshot({ path: '/tmp/ellie-avatar-desktop.png' });
  await page.locator('#website-avatar').screenshot({ path: '/tmp/ellie-avatar-section.png' });
  await avatar.getByRole('button', { name: 'Talk to Ellie' }).click();
  await avatar.getByRole('button', { name: 'End conversation' }).waitFor();
  await page.evaluate(() => { clients[0].emit('speech-start'); clients[0].emit('volume-level', .8); });
  assert.equal(await avatar.getAttribute('data-state'), 'speaking');
  assert.equal(await avatar.locator('.mouth ellipse').getAttribute('ry'), '9.2');
  await page.evaluate(() => clients[0].emit('message', { type: 'transcript', role: 'assistant', transcript: '<img src=x onerror=alert(1)>' }));
  assert.equal(await avatar.locator('.caption img').count(), 0);
  assert.match(await avatar.locator('.caption').innerText(), /<img/);
  await avatar.getByRole('button', { name: 'Mute mic', exact: true }).click();
  assert.equal(await page.evaluate(() => clients[0].muted), true);
  let blocked = false;
  page.once('dialog', dialog => { blocked = true; dialog.dismiss(); });
  await page.locator('#hero-av-live-btn').click();
  assert.equal(blocked, true);
  assert.equal(await page.evaluate(() => clients.length), 1);
  await page.evaluate(() => clients[0].emit('speech-end'));
  assert.equal(await avatar.getAttribute('data-state'), 'listening');
  assert.equal(await avatar.locator('.mouth ellipse').getAttribute('ry'), '2');
  await avatar.getByRole('button', { name: 'End conversation' }).click();
  assert.equal(await page.evaluate(() => clients[0].stopped), true);
  assert.equal(await page.evaluate(() => window.__ellieCallOwner), null);
  await page.evaluate(() => clients[0].emit('speech-start'));
  assert.equal(await avatar.getAttribute('data-state'), 'idle');
  await avatar.getByRole('button', { name: 'Talk to Ellie' }).click();
  await avatar.getByRole('button', { name: 'End conversation' }).waitFor();
  await page.evaluate(() => clients[1].emit('error', new Error('permission denied')));
  assert.match(await avatar.getByRole('status').innerText(), /microphone permission/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#website-avatar').scrollIntoViewIfNeeded();
  await page.locator('#website-avatar').screenshot({ path: '/tmp/ellie-avatar-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.route('**/.netlify/functions/demo-vapi-config', async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.fulfill({json:{ publicKey:'test' }}).catch(()=>{}); });
  await avatar.getByRole('button', { name: 'Talk to Ellie' }).click();
  await avatar.getByRole('button', { name: 'Cancel connection' }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => clients.length), 2);
  assert.equal(await avatar.getAttribute('data-state'), 'idle');
  // A second component shares the page lock, and releasing it permits retry.
  await page.evaluate(() => window.__ellieCallOwner = {});
  await avatar.getByRole('button', { name: 'Talk to Ellie' }).click();
  assert.match(await avatar.getByRole('status').innerText(), /other Ellie call/);
  await browser.close();
  console.log('PASS: speaking/audio amplitude, captions, mute, hangup, retry, errors, cancellation, call exclusion and mobile overflow.');
})();
