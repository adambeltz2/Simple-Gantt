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
  },
  webServer: {
    command: 'npx http-server -p 4173 -c-1 .',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
