import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3100',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/index.js',
    url: 'http://localhost:3100/api/catalog',
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      PORT: '3100',
      HMR_PORT: '24778',
      HOST: '127.0.0.1',
      APP_ORIGIN: 'http://localhost:3100',
      DATABASE_PATH: ':memory:',
      COOKIE_SECURE: 'false',
      TRUSTED_PROXIES: '',
    },
  },
  reporter: 'list',
});
