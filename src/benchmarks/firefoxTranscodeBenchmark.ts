import { convertWebMToMP4, primeVideoConverter } from '../utils/videoConverter';

declare global {
  interface Window {
    __firefoxTranscodeBenchmarkResult?: Record<string, number | string>;
  }
}

interface SampleVideo {
  blob: Blob;
  teardown: () => Promise<void>;
}

interface ScenarioResult {
  coldMs: number;
  warmMs: number;
  warmMinMs: number;
  warmMaxMs: number;
  inputBytes: number;
  outputBytes: number;
}

const SAMPLE_DURATIONS_MS = [1000, 3000];
const WIDTH = 640;
const HEIGHT = 360;
const FPS = 30;
const WARM_RUNS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function createSilentAudioTrack() {
  const audioContext = new AudioContext({ sampleRate: 48_000 });
  const destination = audioContext.createMediaStreamDestination();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  gain.gain.value = 0.00001;
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start();

  return {
    track: destination.stream.getAudioTracks()[0],
    teardown: async () => {
      oscillator.stop();
      destination.stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
    },
  };
}

async function recordSyntheticWebM(durationMs: number): Promise<SampleVideo> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');

  const stream = canvas.captureStream(FPS);
  const audio = await createSilentAudioTrack();
  stream.addTrack(audio.track);

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm';

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 96_000,
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const startedAt = performance.now();
  const paint = () => {
    const elapsed = performance.now() - startedAt;
    const progress = Math.min(1, elapsed / durationMs);
    const hue = Math.round(progress * 300);
    context.fillStyle = `hsl(${hue}, 70%, 52%)`;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = 'rgba(255,255,255,0.9)';
    context.fillRect(40 + progress * 320, 80, 120, 120);
    context.fillStyle = '#111827';
    context.font = 'bold 28px sans-serif';
    context.fillText('EasyCord Firefox MP4 Bench', 32, 42);
    context.font = '20px monospace';
    context.fillText(`duration=${durationMs} progress=${progress.toFixed(4)}`, 32, HEIGHT - 40);
    if (elapsed < durationMs) requestAnimationFrame(paint);
  };

  paint();
  recorder.start(250);
  await new Promise<void>((resolve) => setTimeout(resolve, durationMs));

  const blob = await new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('Synthetic MediaRecorder failed'));
    recorder.stop();
  });

  return {
    blob,
    teardown: async () => {
      stream.getTracks().forEach((track) => track.stop());
      await audio.teardown();
    },
  };
}

async function measureConversion(webmBlob: Blob) {
  const startedAt = performance.now();
  const mp4Blob = await convertWebMToMP4(webmBlob);
  return { elapsedMs: performance.now() - startedAt, outputBytes: mp4Blob.size };
}

async function runScenario(durationMs: number): Promise<ScenarioResult> {
  void primeVideoConverter();
  const sample = await recordSyntheticWebM(durationMs);
  try {
    const cold = await measureConversion(sample.blob);
    const warmRuns: number[] = [];
    let warmOutputBytes = cold.outputBytes;

    for (let index = 0; index < WARM_RUNS; index += 1) {
      const warm = await measureConversion(sample.blob);
      warmRuns.push(warm.elapsedMs);
      warmOutputBytes = warm.outputBytes;
    }

    return {
      coldMs: cold.elapsedMs,
      warmMs: median(warmRuns),
      warmMinMs: Math.min(...warmRuns),
      warmMaxMs: Math.max(...warmRuns),
      inputBytes: sample.blob.size,
      outputBytes: warmOutputBytes,
    };
  } finally {
    await sample.teardown();
  }
}

async function runBenchmark() {
  const scenarioEntries: Array<readonly [number, ScenarioResult]> = [];
  for (const durationMs of SAMPLE_DURATIONS_MS) {
    scenarioEntries.push([durationMs, await runScenario(durationMs)] as const);
  }

  const scenarios = Object.fromEntries(scenarioEntries);
  const coldValues = scenarioEntries.map(([, result]) => result.coldMs);
  const warmValues = scenarioEntries.map(([, result]) => result.warmMs);

  window.__firefoxTranscodeBenchmarkResult = {
    cold_transcode_ms: Number((coldValues.reduce((sum, value) => sum + value, 0) / coldValues.length).toFixed(3)),
    warm_transcode_ms: Number((warmValues.reduce((sum, value) => sum + value, 0) / warmValues.length).toFixed(3)),
    short_cold_transcode_ms: Number(scenarios[1000].coldMs.toFixed(3)),
    long_cold_transcode_ms: Number(scenarios[3000].coldMs.toFixed(3)),
    short_warm_transcode_ms: Number(scenarios[1000].warmMs.toFixed(3)),
    long_warm_transcode_ms: Number(scenarios[3000].warmMs.toFixed(3)),
    warm_min_ms: Number(Math.min(...scenarioEntries.map(([, result]) => result.warmMinMs)).toFixed(3)),
    warm_max_ms: Number(Math.max(...scenarioEntries.map(([, result]) => result.warmMaxMs)).toFixed(3)),
    input_bytes: Number((scenarioEntries.reduce((sum, [, result]) => sum + result.inputBytes, 0) / scenarioEntries.length).toFixed(3)),
    output_bytes: Number((scenarioEntries.reduce((sum, [, result]) => sum + result.outputBytes, 0) / scenarioEntries.length).toFixed(3)),
    scenario_count: SAMPLE_DURATIONS_MS.length,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
  };
}

runBenchmark().catch((error) => {
  console.error(error);
  window.__firefoxTranscodeBenchmarkResult = {
    error: error instanceof Error ? error.message : String(error),
  };
});
