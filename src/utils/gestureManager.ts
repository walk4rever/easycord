import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

export class GestureManager {
  private static instance: GestureManager;
  private recognizer: GestureRecognizer | null = null;
  private lastGesture: string = 'None';
  private gestureCount: number = 0;
  private readonly TRIGGER_THRESHOLD = 15; // 连续 15 帧确认手势 (约 0.5s)

  private constructor() {}

  static getInstance(): GestureManager {
    if (!GestureManager.instance) {
      GestureManager.instance = new GestureManager();
    }
    return GestureManager.instance;
  }

  async init() {
    if (this.recognizer) return;
    
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    
    this.recognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence: 0.7,
      minTrackingConfidence: 0.7
    });
  }

  processFrame(videoElement: HTMLVideoElement, timestamp: number): { gesture: string; isTriggered: boolean } {
    if (!this.recognizer) return { gesture: 'Loading', isTriggered: false };

    const result = this.recognizer.recognizeForVideo(videoElement, timestamp);
    
    let currentGesture = 'None';
    if (result.gestures && result.gestures.length > 0) {
      currentGesture = result.gestures[0][0].categoryName;
    }

    if (currentGesture === this.lastGesture && currentGesture !== 'None') {
      this.gestureCount++;
    } else {
      this.lastGesture = currentGesture;
      this.gestureCount = 0;
    }

    const isTriggered = this.gestureCount === this.TRIGGER_THRESHOLD;
    
    return { gesture: currentGesture, isTriggered };
  }
}
