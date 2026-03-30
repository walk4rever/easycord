# Autoresearch: Gesture recognition accuracy

## Objective
Improve the app-level accuracy of gesture-triggered recording commands in EasyCord.
The focus is temporal decision quality on top of MediaPipe outputs: trigger the intended gesture reliably after a sustained hold while resisting brief misclassifications, dropouts, and accidental spikes.

We are **not** changing model weights or cheating with benchmark-specific shortcuts. Any improvement should plausibly help real webcam usage with noisy frame-to-frame predictions.

## Metrics
- **Primary**: `accuracy_score` (unitless, higher is better) — scenario-suite score balancing recall, false positives, and latency.
- **Secondary**:
  - `missed_events` — expected gesture holds that failed to trigger
  - `false_triggers` — accidental triggers in non-hold/noisy scenarios
  - `avg_latency_penalty_s` — normalized trigger timing error

## How to Run
`./autoresearch.sh`

The benchmark simulates noisy frame sequences representing realistic webcam gesture streams and prints structured `METRIC` lines.

## Files in Scope
- `src/utils/gestureManager.ts` — runtime MediaPipe integration and per-frame processing
- `src/utils/gestureDecision.ts` — pure temporal gesture decision logic shared with benchmark
- `scripts/gesture_accuracy_benchmark.mjs` — synthetic multi-scenario accuracy benchmark
- `src/components/EasyCord.tsx` — only if wiring changes are needed

## Off Limits
- MediaPipe model assets under `public/models/`
- Browser recording pipeline unrelated to gesture accuracy
- Benchmark shortcuts that use scenario identity or special-case synthetic seeds

## Constraints
- Do not overfit to benchmark-specific quirks
- Keep behavior plausible for real user webcam noise
- `npm run build` must pass
- No new dependencies unless clearly justified

## What's Been Tried
- Extracted a pure `GestureDecisionEngine` matching the current hold-for-3s behavior so benchmark and app logic can stay aligned.
- Built a scenario suite with noisy sustained holds, dropout-heavy borderline holds, gesture switching, and false-positive guards.
- Added temporal smoothing via short grace windows for brief `None` dropouts and very short wrong-gesture blips; this greatly improved hold recall.
- Fixed an output-alignment bug where the engine could trigger based on the stabilized gesture while still returning the raw instantaneous label to the app.
- New concern discovered: rapid oscillation between two gestures can still look like a sustained hold if the logic never fully abandons the active gesture. The benchmark now needs an adversarial alternating-gesture scenario so we don't overfit to easy noise.
