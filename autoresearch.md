# Autoresearch: Firefox MP4 transcoding speed

## Objective
Improve how quickly EasyCord produces a downloadable MP4 in Firefox after recording stops.

Firefox does not use the native MP4 recording path here, so the user-visible flow is:
1. record WebM with `MediaRecorder`
2. hand the blob to the FFmpeg web worker
3. transcode to MP4
4. return the MP4 blob for download / preview

We are optimizing that realistic Firefox-compatible path without cheating on the benchmark or reducing output quality so aggressively that it stops being a plausible default for users.

## Metrics
- **Primary**: `cold_transcode_ms` (ms, lower is better) — first-stop Firefox wait time for the first WebM→MP4 conversion, including worker/core initialization
- **Secondary**:
  - `warm_transcode_ms` — median hot-path conversion time after FFmpeg is already loaded
  - `warm_min_ms`
  - `warm_max_ms`
  - `input_bytes`
  - `output_bytes`

## How to Run
`./autoresearch.sh`

The benchmark starts a local Vite server, opens Firefox headlessly through Playwright, generates deterministic synthetic WebM samples in-browser, then runs the actual app conversion code and prints `METRIC` lines.

It now covers four isolated cold-start scenarios spanning both recording length and pre-record wait time:
- short 1s recording with no pre-record gap
- short 1s recording after a 3s pre-record wait
- long 3s recording with no pre-record gap
- long 3s recording after a 3s pre-record wait

For the wait-time scenarios, the benchmark now prewarms at "camera ready" time before the simulated 3s hold gap, which better matches the real app lifecycle. Zero-gap scenarios still prewarm only at recording start.

This is meant to reflect both immediate-start flows and the app's real gesture-hold flow without cheating on the conversion path.

`cold_transcode_ms` is the average first-conversion wait across those isolated scenarios.

## Files in Scope
- `src/utils/videoConverter.ts` — main-thread worker lifecycle / data handoff to FFmpeg worker
- `src/utils/ffmpegWorker.ts` — FFmpeg loading and conversion command line
- `src/components/EasyCord.tsx` — recording / conversion wiring if Firefox-specific flow changes are needed
- `src/utils/webCodecsRecorder.ts` — only if a realistic Firefox-compatible faster path becomes viable
- `src/benchmarks/firefoxTranscodeBenchmark.ts` — in-browser benchmark workload
- `firefox-transcode-benchmark.html` — benchmark entry page
- `scripts/firefox_transcode_benchmark.spec.mjs` — Playwright benchmark test
- `playwright.firefox-bench.config.mjs` — Playwright benchmark config / local web server setup

## Off Limits
- MediaPipe gesture model assets in `public/models/`
- Gesture decision logic unrelated to the Firefox MP4 path
- Browser-specific hacks that special-case the benchmark page instead of improving the real conversion path

## Constraints
- Keep behavior plausible for real Firefox users
- Do not cheat on the benchmark workload
- `npm run build` must pass
- No new dependencies unless clearly justified
- Prefer improvements that also help real stop-to-download latency, not just synthetic internals

## What's Been Tried
- Established a real Firefox benchmark harness around the actual browser conversion path instead of guessing from Node-only proxies.
- A plain Node runner launched via `npx -p playwright node ...` was not viable because the ephemeral package was not resolvable from the script; use Playwright's own test runner / bundled module entrypoints instead.
- Playwright also could not reliably automate the stock macOS Firefox.app binary here; the harness uses Playwright's managed Firefox build instead.
- Major warm-path wins so far:
  - Switched the default Firefox transcode from `libx264` to `mpeg4` while keeping H.264 as fallback; this was a large speedup.
  - Relaxed MPEG-4 quality from `q=6` → `q=9`; `q=10` regressed.
  - Replaced Blob cloning + `fetchFile()` with direct `ArrayBuffer` transfer into the worker, shaving off additional overhead.
- Dead ends / non-wins:
  - Removing `+faststart` regressed.
  - Lowering AAC bitrate to `96k` regressed.
  - Removing the forced CFR/timestamp-normalization path caused the benchmark to hang.
  - Longer GOP tuning (`-g 300`) regressed.
  - Static `/public` FFmpeg asset paths were not a stable improvement over Vite-served local asset URLs.
  - `-bf 0` for MPEG-4 is now conclusively a non-win on the median-stabilized benchmark.
  - Explicit `-threads 1`, fragmented MP4 output, lower probe/analyze limits, and q=8 all regressed on the corrected benchmark.
  - Coarsening progress updates to 10% buckets regressed badly even after log suppression.
- Major cold-path wins so far:
  - Prewarming the FFmpeg worker/core before conversion cut first-stop latency substantially.
  - Serving `@ffmpeg/core` locally instead of fetching from `unpkg` was another large cold-start win.
  - Having preload do a lightweight `ff.exec(['-version'])` after core load removes additional first-exec initialization cost.
  - Suppressing FFmpeg banner/log output and removing worker log forwarding produced another moderate cold-start win.
- Benchmark-shaping status:
  - The benchmark uses isolated browser contexts so each scenario is truly cold.
  - It now spans both recording length and pre-record wait time, so we can evaluate zero-gap versus gesture-hold-like flows directly.
- Real app nuance: EasyCord starts the camera on mount and recording itself requires a 3-second gesture hold, so prewarming before recording begins is plausibly part of the true user flow rather than a benchmark trick.
- Probe result: current headless Firefox in this harness exposes no usable direct MP4 path (`VideoEncoder`/`AudioEncoder` unavailable and `MediaRecorder.isTypeSupported('video/mp4') === false`), so FFmpeg remains necessary for now.
