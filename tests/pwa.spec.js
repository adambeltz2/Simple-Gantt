// @ts-check
const { test, expect } = require('./fixtures');

// Covers backlog #15's PWA half: a web app manifest + icon set + a service
// worker caching the app shell and CDN libraries, so the app is installable
// and keeps working offline after a first successful load.

test('the manifest link and PWA meta tags are present', async ({ page }) => {
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.json');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('manifest.json is valid and points at real, fetchable icons', async ({ page }) => {
  const manifestResponse = await page.request.get('/manifest.json');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();

  expect(manifest.name).toBe('Simple Gantt');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(`/${icon.src}`);
    expect(iconResponse.ok(), `icon ${icon.src} should be fetchable`).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  }
});

test('sw.js is fetchable and registers as the page\'s service worker', async ({ page }) => {
  const swResponse = await page.request.get('/sw.js');
  expect(swResponse.ok()).toBe(true);

  // navigator.serviceWorker.ready only resolves once a registration for this
  // scope has an active worker -- i.e. install + activate both succeeded.
  await page.evaluate(() => navigator.serviceWorker.ready);

  // This first load happened before the worker existed, so it isn't
  // controlled yet (a service worker never controls the page that installed
  // it); a fresh navigation should be.
  await page.reload();
  await page.waitForSelector('#spreadsheet .jexcel');
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  expect(controlled).toBe(true);
});

test('the app shell is served from the service worker cache when offline', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('#spreadsheet .jexcel');

  await context.setOffline(true);
  await page.reload();
  // A successful reload while offline (grid renders, no browser error page)
  // proves the app shell -- index.html plus whatever it needs to boot --
  // came out of the cache rather than the network.
  await expect(page.locator('#spreadsheet .jexcel')).toBeVisible();
  await context.setOffline(false);
});
