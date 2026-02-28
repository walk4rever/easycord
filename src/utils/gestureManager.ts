import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

export class GestureManager {
  private static instance: GestureManager;
  private recognizer: GestureRecognizer | null = null;
  private lastGesture: string = 'None';
  private gestureCount: number = 0;
  private readonly TRIGGER_THRESHOLD = 5;

  private constructor() {}

  static getInstance(): GestureManager {
    if (!GestureManager.instance) {
      GestureManager.instance = new GestureManager();
    }
    return GestureManager.instance;
  }

  async init() {
    if (this.recognizer) {
      console.log("[GestureManager] Already initialized");
      return;
    }
    
    console.log("[GestureManager] Starting initialization...");
    // WASM 依然使用 unpkg (你那边已经证明能通)，模型切换到 Vercel 本地
    const WASM_URL = "https://unpkg.com/@mediapipe/tasks-vision@0.10.32/wasm";
    const MODEL_PATH = "/models/gesture_recognizer.task";
    
    try {
      console.log("[GestureManager] Loading WASM from:", WASM_URL);
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      console.log("[GestureManager] WASM loaded successfully");
      
      console.log("[GestureManager] Loading LOCAL Model from:", MODEL_PATH);
      this.recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4
      });
      console.log("[GestureManager] Model loaded and Recognizer ready (GPU)");
    } catch (e) {
      console.warn("[GestureManager] GPU init failed, trying CPU fallback...", e);
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        this.recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        console.log("[GestureManager] Model loaded and Recognizer ready (CPU)");
      } catch (err2) {
        console.error("[GestureManager] Fatal: Both GPU and CPU init failed", err2);
        throw err2;
      }
    }
  }

  processFrame(videoElement: HTMLVideoElement, timestamp: number): { gesture: string; isTriggered: boolean; handDetected: boolean } {
    if (!this.recognizer) return { gesture: 'Loading', isTriggered: false, handDetected: false };

    try {
      const result = this.recognizer.recognizeForVideo(videoElement, Math.floor(timestamp));
      let currentGesture = 'None';
      const handDetected = result.landmarks && result.landmarks.length > 0;

      if (result.gestures && result.gestures.length > 0 && result.gestures[0].length > 0) {
        currentGesture = result.gestures[0][0].categoryName;
      }

      if (currentGesture === this.lastGesture && currentGesture !== 'None') {
        this.gestureCount++;
      } else {
        this.lastGesture = currentGesture;
        this.gestureCount = 0;
      }

      return { 
        gesture: currentGesture, 
        isTriggered: this.gestureCount === this.TRIGGER_THRESHOLD, 
        handDetected 
      };
    } catch {
      return { gesture: 'Error', isTriggered: false, handDetected: false };
    }
  }
}
