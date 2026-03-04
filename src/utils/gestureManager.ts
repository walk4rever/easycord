import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

export class GestureManager {
  private static instance: GestureManager;
  private recognizer: GestureRecognizer | null = null;
  private lastGesture: string = 'None';
  private gestureStartTime: number = 0;
  private readonly TRIGGER_DURATION = 3000; // 3 seconds in ms
  private lastVideoTimestamp: number = -1;
  private initPromise: Promise<void> | null = null;
  private hasTriggered: boolean = false; // Prevent multiple triggers for the same hold

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
        type GestureRecognizerCreateOptions = Parameters<typeof GestureRecognizer.createFromOptions>[1];
        const createRecognizerWithTimeout = async (options: GestureRecognizerCreateOptions, timeoutMs: number): Promise<GestureRecognizer> => {
          return Promise.race([
            GestureRecognizer.createFromOptions(vision, options),
            new Promise<GestureRecognizer>((_, reject) => 
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
          }, 5000); // 5s timeout for GPU
          
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

  processFrame(videoElement: HTMLVideoElement, timestamp: number): { gesture: string; isTriggered: boolean; handDetected: boolean; progress: number } {
    if (!this.recognizer) return { gesture: 'Loading', isTriggered: false, handDetected: false, progress: 0 };

    const timestampMs = Math.floor(timestamp);

    // Ensure strictly increasing timestamp to avoid MediaPipe errors
    if (timestampMs <= this.lastVideoTimestamp) {
      return { 
        gesture: this.lastGesture, 
        isTriggered: false, 
        handDetected: this.lastGesture !== 'None',
        progress: 0
      };
    }
    this.lastVideoTimestamp = timestampMs;

    try {
      const result = this.recognizer.recognizeForVideo(videoElement, timestampMs);
      let currentGesture = 'None';
      const handDetected = result.landmarks && result.landmarks.length > 0;

      if (result.gestures && result.gestures.length > 0 && result.gestures[0].length > 0) {
        currentGesture = result.gestures[0][0].categoryName;
      }

      let progress = 0;
      let isTriggered = false;

      if (currentGesture === this.lastGesture && currentGesture !== 'None') {
        const duration = timestampMs - this.gestureStartTime;
        progress = Math.min(duration / this.TRIGGER_DURATION, 1);
        
        if (duration >= this.TRIGGER_DURATION) {
          if (!this.hasTriggered) {
            isTriggered = true;
            this.hasTriggered = true;
          }
        }
      } else {
        this.lastGesture = currentGesture;
        this.gestureStartTime = timestampMs;
        this.hasTriggered = false;
        progress = 0;
      }

      return { 
        gesture: currentGesture, 
        isTriggered, 
        handDetected,
        progress
      };
    } catch (e) {
      console.warn("[GestureManager] Recognition failed", e);
      return { gesture: 'Error', isTriggered: false, handDetected: false, progress: 0 };
    }
  }
}
