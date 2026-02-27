// easycord/src/utils/ffmpegWorker.ts

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let loadPromise: Promise<FFmpeg> | null = null;

async function loadFFmpeg(onProgress?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  if (isLoading && loadPromise) {
    return loadPromise;
  }

  isLoading = true;

  loadPromise = (async () => {
    ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      // console.log('[FFmpeg Worker]', message);
      postMessage({ type: 'log', message: `[FFmpeg Worker] ${message}` });
    });

    ffmpeg.on('progress', ({ progress }) => {
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const percent = Math.round(clampedProgress * 100);
      postMessage({ type: 'progress', message: `Converting: ${percent}%` });
    });

    postMessage({ type: 'progress', message: 'Loading converter...' });

    try {
      const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
      postMessage({ type: 'log', message: `[FFmpeg Worker] Loading core from: ${baseURL}` });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('FFmpeg load timeout')), 300000) // Increased timeout to 5 minutes
      );

      await Promise.race([
        ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        }),
        timeoutPromise
      ]);
      postMessage({ type: 'log', message: '[FFmpeg Worker] Core loaded successfully' });
    } catch (error) {
      postMessage({ type: 'error', message: `Failed to load FFmpeg: ${error instanceof Error ? error.message : String(error)}` });
      isLoading = false;
      loadPromise = null;
      throw error;
    }

    return ffmpeg;
  })();

  return loadPromise;
}

self.onmessage = async (event) => {
  const { type, webmBlob } = event.data;

  if (type === 'convert') {
    try {
      const ff = await loadFFmpeg(); // Load FFmpeg within the worker context
      
      postMessage({ type: 'progress', message: 'Preparing video...' });

      const webmData = await fetchFile(webmBlob);
      await ff.writeFile('input.webm', webmData);

      postMessage({ type: 'progress', message: 'Converting to MP4...' });

      try {
        await ff.exec([
          '-i', 'input.webm',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          'output.mp4'
        ]);
      } catch (error) {
        postMessage({ type: 'log', message: `[FFmpeg Worker] libx264 conversion failed, trying mpeg4... ${error instanceof Error ? error.message : String(error)}` });
        postMessage({ type: 'progress', message: 'Converting to MP4 (fallback)...' });
        await ff.exec([
          '-i', 'input.webm',
          '-c:v', 'mpeg4',
          '-q:v', '5',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          'output.mp4'
        ]);
      }

      postMessage({ type: 'progress', message: 'Finalizing...' });

      const mp4Data = await ff.readFile('output.mp4');
      
      await ff.deleteFile('input.webm');
      await ff.deleteFile('output.mp4');

      const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' });

      postMessage({ type: 'result', mp4Blob: mp4Blob }, [mp4Blob]); // Transfer ownership of blob
    } catch (error) {
      postMessage({ type: 'error', message: `Conversion failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
};
