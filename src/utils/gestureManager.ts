import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

export class GestureManager {
  private static instance: GestureManager;
  private recognizer: GestureRecognizer | null = null;
  private lastGesture: string = 'None';
  private gestureCount: number = 0;
  private readonly TRIGGER_THRESHOLD = 5;
  private lastVideoTimestamp: number = -1;
  private initPromise: Promise<void> | null = null;

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
    
    if (this.initPromise) {
      console.log("[GestureManager] Initialization already in progress, waiting...");
      return this.initPromise;
    }

    this.initPromise = (async () => {
      console.log("[GestureManager] Starting initialization...");
      // WASM loaded from local public directory for better reliability
      const WASM_URL = "/wasm";
      const MODEL_PATH = "/models/gesture_recognizer.task";
      
      try {
        console.log("[GestureManager] Loading WASM from:", WASM_URL);
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        console.log("[GestureManager] WASM loaded successfully");
        
        console.log("[GestureManager] Loading LOCAL Model from:", MODEL_PATH);
        
        // Add timeout for GPU initialization
        const createRecognizerWithTimeout = async (options: any, timeoutMs: number) => {
          return Promise.race([
            GestureRecognizer.createFromOptions(vision, options),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Initialization timed out after ${timeoutMs}ms`)), timeoutMs)
            )
          ]);
        };

        try {
          this.recognizer = await createRecognizerWithTimeout({
            baseOptions: {
              modelAssetPath: MODEL_PATH,
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.4,
            minHandPresenceConfidence: 0.4,
            minTrackingConfidence: 0.4
          }, 5000) as GestureRecognizer; // 5s timeout for GPU
          
          console.log("[GestureManager] Model loaded and Recognizer ready (GPU)");
        } catch (gpuError) {
          console.warn("[GestureManager] GPU init failed or timed out, trying CPU fallback...", gpuError);
          // Fallback to CPU
          this.recognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_PATH,
              delegate: "CPU"
            },
            runningMode: "VIDEO",
            numHands: 1
          });
          console.log("[GestureManager] Model loaded and Recognizer ready (CPU)");
        }

      } catch (e) {
        console.error("[GestureManager] Fatal: Initialization failed", e);
        this.initPromise = null;
        throw e;
      }
    })();

    return this.initPromise;
  }

  processFrame(videoElement: HTMLVideoElement, timestamp: number): { gesture: string; isTriggered: boolean; handDetected: boolean } {
    if (!this.recognizer) return { gesture: 'Loading', isTriggered: false, handDetected: false };

    const timestampMs = Math.floor(timestamp);

    // Ensure strictly increasing timestamp to avoid MediaPipe errors
    if (timestampMs <= this.lastVideoTimestamp) {
      return { 
        gesture: this.lastGesture, 
        isTriggered: false, 
        handDetected: this.lastGesture !== 'None' 
      };
    }
    this.lastVideoTimestamp = timestampMs;

    try {
      const result = this.recognizer.recognizeForVideo(videoElement, timestampMs);
      let currentGesture = 'None';
      const handDetected = result.landmarks && result.landmarks.length > 0;

      if (result.gestures && result.gestures.length > 0 && result.gestures[0].length > 0) {
        currentGesture = result.gestures[0][0].categoryName;
        // console.log("Detected Gesture:", currentGesture); // Debug log
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
    } catch (e) {
      console.warn("[GestureManager] Recognition failed", e);
      return { gesture: 'Error', isTriggered: false, handDetected: false };
    }
  }
}
