// easycord/src/utils/videoConverter.ts

/**
 * Video Converter - Converts WebM to MP4 using FFmpeg WASM in a Web Worker
 *
 * Browser recording produces WebM files, but users want MP4.
 * This offloads the FFmpeg WASM conversion to a Web Worker to prevent UI blocking.
 */

// Declare worker for TypeScript
// No longer need to redeclare postMessage since we're using type: 'module' and direct import
// declare global {
//   interface Worker {
//     postMessage(message: any, transfer: Transferable[]): void;
//   }
// }

let worker: Worker | null = null;
let workerLoadPromise: Promise<Worker> | null = null;

async function loadWorker(): Promise<Worker> {
  if (worker) {
    return worker;
  }

  if (workerLoadPromise) {
    return workerLoadPromise;
  }

  workerLoadPromise = (async () => {
    // Create worker as a module worker to support 'import' statements
    // The path should directly point to the compiled ffmpegWorker.js
    // Vite/Webpack typically handles the URL resolution for module workers correctly
    worker = new Worker(new URL('./ffmpegWorker.ts', import.meta.url), { type: 'module' });
    console.log('[videoConverter] FFmpeg Worker created as module.');
    return worker;
  })();

  return workerLoadPromise;
}

/**
 * Convert a WebM blob to MP4 using a Web Worker
 * @param webmBlob - The WebM video blob from MediaRecorder
 * @param onProgress - Optional callback for progress updates
 * @returns MP4 blob
 */
export async function convertWebMToMP4(
  webmBlob: Blob,
  onProgress?: (message: string) => void
): Promise<Blob> {
  const ffmpegWorker = await loadWorker();

  return new Promise((resolve, reject) => {
    ffmpegWorker.onmessage = (event) => {
      const { type, message, mp4Blob } = event.data;
      if (type === 'progress') {
        onProgress?.(message);
      } else if (type === 'log') {
        console.log(message);
      } else if (type === 'error') {
        console.error('[videoConverter] Worker Error:', message);
        reject(new Error(message));
      } else if (type === 'result') {
        // mp4Blob is actually a Transferable here (ArrayBuffer or similar), needs to be Blob-ified
        if (!(mp4Blob instanceof Blob)) {
            const resultBlob = new Blob([mp4Blob], { type: 'video/mp4' });
            resolve(resultBlob);
        } else {
            resolve(mp4Blob);
        }
        ffmpegWorker.onmessage = null; // Clean up listener
      }
    };

    ffmpegWorker.onerror = (error) => {
      console.error('[videoConverter] Worker failed:', error);
      reject(new Error('FFmpeg Worker failed to load or run.'));
      ffmpegWorker.onmessage = null; // Clean up listener
    };

    // Post message to worker to start conversion.
    // For Blobs, postMessage usually clones them automatically if not in transfer list.
    // However, for efficiency, if we deal with ArrayBuffer, we should transfer.
    // The webmBlob itself is not directly transferable; its underlying ArrayBuffer is.
    // Let's send the Blob directly and let it be cloned.
    ffmpegWorker.postMessage({ type: 'convert', webmBlob: webmBlob });
  });
}
