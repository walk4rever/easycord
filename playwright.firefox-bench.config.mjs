import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    browserName: 'firefox',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/firefox-transcode-benchmark.html',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
