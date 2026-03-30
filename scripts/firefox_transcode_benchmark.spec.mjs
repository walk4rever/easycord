import { test, expect } from 'playwright/test';

const SCENARIO_DURATIONS_MS = [1000, 3000];

async function runScenario(page, durationMs) {
  await page.goto(`/firefox-transcode-benchmark.html?durationMs=${durationMs}`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  await page.waitForFunction(() => Boolean(window.__firefoxTranscodeBenchmarkResult), {
    timeout: 180_000,
  });

  const result = await page.evaluate(() => window.__firefoxTranscodeBenchmarkResult);
  expect(result).toBeTruthy();
  expect(result).not.toHaveProperty('error');
  return result;
}

test('Firefox MP4 transcode benchmark', async ({ browser }) => {
  test.setTimeout(300_000);

  const scenarioResults = [];
  for (const durationMs of SCENARIO_DURATIONS_MS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const result = await runScenario(page, durationMs);
      scenarioResults.push({ durationMs, result });
    } finally {
      await context.close();
    }
  }

  const byDuration = Object.fromEntries(scenarioResults.map(({ durationMs, result }) => [durationMs, result]));
  const coldAverage = scenarioResults.reduce((sum, { result }) => sum + Number(result.cold_transcode_ms), 0) / scenarioResults.length;
  const warmAverage = scenarioResults.reduce((sum, { result }) => sum + Number(result.warm_transcode_ms), 0) / scenarioResults.length;
  const warmMins = scenarioResults.map(({ result }) => Number(result.warm_min_ms));
  const warmMaxes = scenarioResults.map(({ result }) => Number(result.warm_max_ms));
  const inputAverage = scenarioResults.reduce((sum, { result }) => sum + Number(result.input_bytes), 0) / scenarioResults.length;
  const outputAverage = scenarioResults.reduce((sum, { result }) => sum + Number(result.output_bytes), 0) / scenarioResults.length;

  const aggregate = {
    cold_transcode_ms: Number(coldAverage.toFixed(3)),
    warm_transcode_ms: Number(warmAverage.toFixed(3)),
    short_cold_transcode_ms: Number(Number(byDuration[1000].cold_transcode_ms).toFixed(3)),
    long_cold_transcode_ms: Number(Number(byDuration[3000].cold_transcode_ms).toFixed(3)),
    short_warm_transcode_ms: Number(Number(byDuration[1000].warm_transcode_ms).toFixed(3)),
    long_warm_transcode_ms: Number(Number(byDuration[3000].warm_transcode_ms).toFixed(3)),
    warm_min_ms: Number(Math.min(...warmMins).toFixed(3)),
    warm_max_ms: Number(Math.max(...warmMaxes).toFixed(3)),
    input_bytes: Number(inputAverage.toFixed(3)),
    output_bytes: Number(outputAverage.toFixed(3)),
    scenario_count: scenarioResults.length,
    fps: Number(byDuration[1000].fps),
    width: Number(byDuration[1000].width),
    height: Number(byDuration[1000].height),
  };

  for (const [name, value] of Object.entries(aggregate)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      console.log(`METRIC ${name}=${value}`);
    }
  }
});
