export type GestureName = 'None' | 'Thumb_Up' | 'Closed_Fist' | 'Open_Palm' | 'Error' | 'Loading' | string;

export type GestureDecisionInput = {
  gesture: GestureName;
  handDetected: boolean;
  timestampMs: number;
};

export type GestureDecisionOutput = {
  gesture: GestureName;
  isTriggered: boolean;
  handDetected: boolean;
  progress: number;
};

const INTERRUPTION_GRACE_MS = 220;
const WRONG_GESTURE_GRACE_MS = 90;
const MATCH_GAIN = 1.1;
const NO_HAND_DECAY = 0.2;
const WRONG_GESTURE_DECAY = 0.5;

export class GestureDecisionEngine {
  private activeGesture: GestureName = 'None';
  private holdProgressMs = 0;
  private readonly triggerDurationMs: number;
  private hasTriggered = false;
  private interruptionStartTime: number | null = null;
  private pendingGesture: GestureName = 'None';
  private lastTimestampMs: number | null = null;

  constructor(triggerDurationMs = 3000) {
    this.triggerDurationMs = triggerDurationMs;
  }

  private resetTo(gesture: GestureName) {
    this.activeGesture = gesture;
    this.holdProgressMs = 0;
    this.hasTriggered = false;
    this.interruptionStartTime = null;
    this.pendingGesture = 'None';
  }

  process(input: GestureDecisionInput): GestureDecisionOutput {
    const { gesture, handDetected, timestampMs } = input;
    const deltaMs = this.lastTimestampMs === null ? 0 : Math.max(0, timestampMs - this.lastTimestampMs);
    this.lastTimestampMs = timestampMs;

    if (this.activeGesture === 'None') {
      if (gesture !== 'None' && handDetected) {
        this.resetTo(gesture);
      }
    } else if (gesture === this.activeGesture) {
      this.interruptionStartTime = null;
      this.pendingGesture = 'None';
      this.holdProgressMs = Math.min(this.triggerDurationMs, this.holdProgressMs + deltaMs * MATCH_GAIN);
    } else if (gesture === 'None' || !handDetected) {
      this.pendingGesture = 'None';
      if (this.interruptionStartTime === null) {
        this.interruptionStartTime = timestampMs;
      } else if (timestampMs - this.interruptionStartTime > INTERRUPTION_GRACE_MS) {
        this.resetTo('None');
      }
      this.holdProgressMs = Math.max(0, this.holdProgressMs - deltaMs * NO_HAND_DECAY);
    } else {
      this.holdProgressMs = Math.max(0, this.holdProgressMs - deltaMs * WRONG_GESTURE_DECAY);
      if (this.pendingGesture !== gesture) {
        this.pendingGesture = gesture;
        this.interruptionStartTime = timestampMs;
      } else if (this.interruptionStartTime !== null && timestampMs - this.interruptionStartTime > WRONG_GESTURE_GRACE_MS) {
        this.resetTo(gesture);
      }
    }

    let isTriggered = false;
    if (this.activeGesture !== 'None' && this.holdProgressMs >= this.triggerDurationMs && !this.hasTriggered) {
      isTriggered = true;
      this.hasTriggered = true;
    }

    const outputGesture = this.activeGesture !== 'None' ? this.activeGesture : gesture;

    return {
      gesture: outputGesture,
      isTriggered,
      handDetected,
      progress: Math.min(this.holdProgressMs / this.triggerDurationMs, 1),
    };
  }
}
