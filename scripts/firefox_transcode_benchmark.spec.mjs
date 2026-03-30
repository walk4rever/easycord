import { test, expect } from 'playwright/test';

test('Firefox MP4 transcode benchmark', async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto('/firefox-transcode-benchmark.html', {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  await page.waitForFunction(() => Boolean(window.__firefoxTranscodeBenchmarkResult), {
    timeout: 180_000,
  });

  const result = await page.evaluate(() => window.__firefoxTranscodeBenchmarkResult);
  expect(result).toBeTruthy();
  expect(result).not.toHaveProperty('error');

  for (const [name, value] of Object.entries(result)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      console.log(`METRIC ${name}=${value}`);
    }
  }
});
