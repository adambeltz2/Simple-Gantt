// @ts-check
const { defineConfig } = require('@playwright/test');

// Serves the repo root over http:// (rather than opening index.html via
// file://) so the app's relative-asset handling behaves the same way it
// would in real deployment (GitHub Pages, or opening it locally with any
// static server).
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Deliberately non-UTC: `new Date("YYYY-MM-DD")` parses as UTC midnight,
    // which silently rolls back a calendar day when read with local getters
    // in any timezone behind UTC. That class of bug is invisible if tests
    // run in UTC (as most CI/sandbox defaults do) -- it only surfaces here
    // because the browser context itself is pinned to a real, behind-UTC
    // timezone.
    timezoneId: 'America/New_York',
  },
  webServer: {
    command: 'npx http-server -p 4173 -c-1 .',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
