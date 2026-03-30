import { test, expect } from 'playwright/test';

const SCENARIOS = [
  { durationMs: 1000, preRecordDelayMs: 0, prewarmAtCameraReady: true, label: 'short_no_gap' },
  { durationMs: 1000, preRecordDelayMs: 3000, prewarmAtCameraReady: true, label: 'short_with_hold' },
  { durationMs: 3000, preRecordDelayMs: 0, prewarmAtCameraReady: true, label: 'long_no_gap' },
  { durationMs: 3000, preRecordDelayMs: 3000, prewarmAtCameraReady: true, label: 'long_with_hold' },
];

async function runScenario(page, scenario) {
  const params = new URLSearchParams({
    durationMs: String(scenario.durationMs),
    preRecordDelayMs: String(scenario.preRecordDelayMs),
    prewarmAtCameraReady: scenario.prewarmAtCameraReady ? '1' : '0',
  });

  await page.goto(`/firefox-transcode-benchmark.html?${params.toString()}`, {
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
  test.setTimeout(420_000);

  const scenarioResults = [];
  for (const scenario of SCENARIOS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const result = await runScenario(page, scenario);
      scenarioResults.push({ scenario, result });
    } finally {
      await context.close();
    }
  }

  const byLabel = Object.fromEntries(scenarioResults.map(({ scenario, result }) => [scenario.label, result]));
  const coldAverage = scenarioResults.reduce((sum, { result }) => sum + Number(result.cold_transcode_ms), 0) / scenarioResults.length;
  const warmAverage = scenarioResults.reduce((sum, { result }) => sum + Number(result.warm_transcode_ms), 0) / scenarioResults.length;
  const warmMins = scenarioResults.map(({ result }) => Number(result.warm_min_ms));
  const warmMaxes = scenarioResults.map(({ result }) => Number(result.warm_max_ms));
  const inputAverage = scenarioResults.reduce((sum, { result }) => sum + Number(result.input_bytes), 0) / scenarioResults.length;
  const outputAverage = scenarioResults.reduce((sum, { result }) => sum + Number(result.output_bytes), 0) / scenarioResults.length;

  const aggregate = {
    cold_transcode_ms: Number(coldAverage.toFixed(3)),
    warm_transcode_ms: Number(warmAverage.toFixed(3)),
    short_no_gap_cold_ms: Number(Number(byLabel.short_no_gap.cold_transcode_ms).toFixed(3)),
    short_with_hold_cold_ms: Number(Number(byLabel.short_with_hold.cold_transcode_ms).toFixed(3)),
    long_no_gap_cold_ms: Number(Number(byLabel.long_no_gap.cold_transcode_ms).toFixed(3)),
    long_with_hold_cold_ms: Number(Number(byLabel.long_with_hold.cold_transcode_ms).toFixed(3)),
    short_no_gap_warm_ms: Number(Number(byLabel.short_no_gap.warm_transcode_ms).toFixed(3)),
    short_with_hold_warm_ms: Number(Number(byLabel.short_with_hold.warm_transcode_ms).toFixed(3)),
    long_no_gap_warm_ms: Number(Number(byLabel.long_no_gap.warm_transcode_ms).toFixed(3)),
    long_with_hold_warm_ms: Number(Number(byLabel.long_with_hold.warm_transcode_ms).toFixed(3)),
    warm_min_ms: Number(Math.min(...warmMins).toFixed(3)),
    warm_max_ms: Number(Math.max(...warmMaxes).toFixed(3)),
    input_bytes: Number(inputAverage.toFixed(3)),
    output_bytes: Number(outputAverage.toFixed(3)),
    scenario_count: scenarioResults.length,
    fps: Number(byLabel.short_no_gap.fps),
    width: Number(byLabel.short_no_gap.width),
    height: Number(byLabel.short_no_gap.height),
  };

  for (const [name, value] of Object.entries(aggregate)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      console.log(`METRIC ${name}=${value}`);
    }
  }
});
