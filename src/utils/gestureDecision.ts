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

export class GestureDecisionEngine {
  private lastGesture: GestureName = 'None';
  private gestureStartTime = 0;
  private readonly triggerDurationMs: number;
  private hasTriggered = false;

  constructor(triggerDurationMs = 3000) {
    this.triggerDurationMs = triggerDurationMs;
  }

  process(input: GestureDecisionInput): GestureDecisionOutput {
    const { gesture, handDetected, timestampMs } = input;

    let progress = 0;
    let isTriggered = false;

    if (gesture === this.lastGesture && gesture !== 'None') {
      const duration = timestampMs - this.gestureStartTime;
      progress = Math.min(duration / this.triggerDurationMs, 1);

      if (duration >= this.triggerDurationMs) {
        if (!this.hasTriggered) {
          isTriggered = true;
          this.hasTriggered = true;
        }
      }
    } else {
      this.lastGesture = gesture;
      this.gestureStartTime = timestampMs;
      this.hasTriggered = false;
      progress = 0;
    }

    return {
      gesture,
      isTriggered,
      handDetected,
      progress,
    };
  }
}
