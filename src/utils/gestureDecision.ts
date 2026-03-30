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

export class GestureDecisionEngine {
  private activeGesture: GestureName = 'None';
  private gestureStartTime = 0;
  private readonly triggerDurationMs: number;
  private hasTriggered = false;
  private interruptionStartTime: number | null = null;

  constructor(triggerDurationMs = 3000) {
    this.triggerDurationMs = triggerDurationMs;
  }

  private resetTo(gesture: GestureName, timestampMs: number) {
    this.activeGesture = gesture;
    this.gestureStartTime = timestampMs;
    this.hasTriggered = false;
    this.interruptionStartTime = null;
  }

  process(input: GestureDecisionInput): GestureDecisionOutput {
    const { gesture, handDetected, timestampMs } = input;

    if (this.activeGesture === 'None') {
      this.resetTo(gesture, timestampMs);
    } else if (gesture === this.activeGesture) {
      this.interruptionStartTime = null;
    } else if (gesture === 'None' || !handDetected) {
      if (this.interruptionStartTime === null) {
        this.interruptionStartTime = timestampMs;
      } else if (timestampMs - this.interruptionStartTime > INTERRUPTION_GRACE_MS) {
        this.resetTo('None', timestampMs);
      }
    } else {
      this.resetTo(gesture, timestampMs);
    }

    let progress = 0;
    let isTriggered = false;

    if (this.activeGesture !== 'None') {
      const heldDuration = timestampMs - this.gestureStartTime;
      progress = Math.min(heldDuration / this.triggerDurationMs, 1);

      if (heldDuration >= this.triggerDurationMs && !this.hasTriggered) {
        isTriggered = true;
        this.hasTriggered = true;
      }
    }

    return {
      gesture,
      isTriggered,
      handDetected,
      progress,
    };
  }
}
