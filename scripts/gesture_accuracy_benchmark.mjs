import { GestureDecisionEngine } from '../src/utils/gestureDecision.ts';

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const HOLD_MS = 3000;
const TARGET_GESTURES = ['Thumb_Up', 'Closed_Fist', 'Open_Palm'];

function mulberry32(seed) {
  return function () {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pushFrames(sequence, durationMs, frameFactory) {
  const frames = Math.max(1, Math.round(durationMs / FRAME_MS));
  for (let i = 0; i < frames; i += 1) sequence.push(frameFactory(i, frames));
}

function maybeNoisyGesture(intendedGesture, rng, options = {}) {
  const {
    missRate = 0,
    wrongRate = 0,
    wrongChoices = TARGET_GESTURES.filter((g) => g !== intendedGesture),
  } = options;
  const roll = rng();
  if (roll < missRate) return { gesture: 'None', handDetected: true };
  if (roll < missRate + wrongRate) {
    return { gesture: wrongChoices[Math.floor(rng() * wrongChoices.length)] ?? 'None', handDetected: true };
  }
  return { gesture: intendedGesture, handDetected: intendedGesture !== 'None' };
}

function makeScenario(seed, kind, gesture) {
  const rng = mulberry32(seed);
  const frames = [];
  const expected = [];

  if (kind === 'stable_hold_with_brief_noise') {
    pushFrames(frames, 800, () => ({ gesture: 'None', handDetected: false }));
    pushFrames(frames, 3600, () => maybeNoisyGesture(gesture, rng, { missRate: 0.05, wrongRate: 0.02 }));
    expected.push({ gesture, earliestMs: 3200, latestMs: 4500 });
  }

  if (kind === 'borderline_hold_with_dropouts') {
    pushFrames(frames, 600, () => ({ gesture: 'None', handDetected: false }));
    pushFrames(frames, 3400, () => maybeNoisyGesture(gesture, rng, { missRate: 0.09, wrongRate: 0.03 }));
    expected.push({ gesture, earliestMs: 3200, latestMs: 4700 });
  }

  if (kind === 'false_positive_guard') {
    pushFrames(frames, 5000, () => {
      const roll = rng();
      if (roll < 0.82) return { gesture: 'None', handDetected: roll < 0.45 };
      return maybeNoisyGesture(gesture, rng, { missRate: 0.3, wrongRate: 0.45 });
    });
  }

  if (kind === 'gesture_switch') {
    const other = TARGET_GESTURES.find((g) => g !== gesture) ?? 'Thumb_Up';
    pushFrames(frames, 1500, () => maybeNoisyGesture(other, rng, { missRate: 0.04, wrongRate: 0.02 }));
    pushFrames(frames, 400, () => ({ gesture: 'None', handDetected: false }));
    pushFrames(frames, 3600, () => maybeNoisyGesture(gesture, rng, { missRate: 0.05, wrongRate: 0.02 }));
    expected.push({ gesture, earliestMs: 4700, latestMs: 6200 });
  }

  if (kind === 'two_frame_spikes') {
    pushFrames(frames, 5200, (i) => {
      const cycle = i % 45;
      if (cycle === 8 || cycle === 9) return { gesture, handDetected: true };
      return { gesture: 'None', handDetected: i % 3 === 0 };
    });
  }

  if (kind === 'alternating_confusion') {
    const other = TARGET_GESTURES.find((g) => g !== gesture) ?? 'Thumb_Up';
    pushFrames(frames, 6200, (i) => ((Math.floor(i / 3) % 2 === 0)
      ? { gesture, handDetected: true }
      : { gesture: other, handDetected: true }));
  }

  if (kind === 'bursty_wrong_gesture_during_hold') {
    const other = TARGET_GESTURES.find((g) => g !== gesture) ?? 'Thumb_Up';
    pushFrames(frames, 700, () => ({ gesture: 'None', handDetected: false }));
    pushFrames(frames, 3900, (i) => {
      const cycle = i % 24;
      if (cycle >= 10 && cycle <= 13) return { gesture: other, handDetected: true };
      return { gesture, handDetected: true };
    });
    expected.push({ gesture, earliestMs: 3300, latestMs: 4900 });
  }

  return { name: `${kind}:${gesture}:${seed}`, frames, expected };
}

function scoreScenario(scenario) {
  const engine = new GestureDecisionEngine(HOLD_MS);
  const events = [];

  scenario.frames.forEach((frame, index) => {
    const timestampMs = Math.round(index * FRAME_MS);
    const result = engine.process({ ...frame, timestampMs });
    if (result.isTriggered) {
      events.push({ gesture: result.gesture, timestampMs });
    }
  });

  let matched = 0;
  let latencyPenalty = 0;
  const unmatchedEvents = [...events];

  for (const expected of scenario.expected) {
    const matchIndex = unmatchedEvents.findIndex((event) => (
      event.gesture === expected.gesture &&
      event.timestampMs >= expected.earliestMs &&
      event.timestampMs <= expected.latestMs
    ));
    if (matchIndex >= 0) {
      const [event] = unmatchedEvents.splice(matchIndex, 1);
      matched += 1;
      const targetMid = (expected.earliestMs + expected.latestMs) / 2;
      latencyPenalty += Math.abs(event.timestampMs - targetMid) / 1000;
    }
  }

  const missed = scenario.expected.length - matched;
  const falseTriggers = unmatchedEvents.length;
  const raw = Math.max(0, 100 - missed * 35 - falseTriggers * 30 - latencyPenalty * 4);
  return { raw, missed, falseTriggers, latencyPenalty, events };
}

const scenarios = [];
let seed = 1;
for (const gesture of TARGET_GESTURES) {
  for (const kind of ['stable_hold_with_brief_noise', 'borderline_hold_with_dropouts', 'false_positive_guard', 'gesture_switch', 'two_frame_spikes', 'alternating_confusion', 'bursty_wrong_gesture_during_hold']) {
    for (let i = 0; i < 12; i += 1) scenarios.push(makeScenario(seed++, kind, gesture));
  }
}

const results = scenarios.map(scoreScenario);
const totalScore = results.reduce((sum, result) => sum + result.raw, 0);
const totalMissed = results.reduce((sum, result) => sum + result.missed, 0);
const totalFalseTriggers = results.reduce((sum, result) => sum + result.falseTriggers, 0);
const avgLatencyPenalty = results.reduce((sum, result) => sum + result.latencyPenalty, 0) / results.length;
const accuracyScore = Number((totalScore / results.length).toFixed(3));

console.log(`METRIC accuracy_score=${accuracyScore}`);
console.log(`METRIC missed_events=${totalMissed}`);
console.log(`METRIC false_triggers=${totalFalseTriggers}`);
console.log(`METRIC avg_latency_penalty_s=${avgLatencyPenalty.toFixed(3)}`);
