// easycord/src/utils/ffmpegWorker.ts

/// <reference lib="webworker" />

import { FFmpeg } from '@ffmpeg/ffmpeg';
import ffmpegCoreURL from '@ffmpeg/core?url';
import ffmpegWasmURL from '@ffmpeg/core/wasm?url';

const workerScope = self as DedicatedWorkerGlobalScope;

let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let loadPromise: Promise<FFmpeg> | null = null;
let preloadExecPromise: Promise<void> | null = null;

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  if (isLoading && loadPromise) return loadPromise;

  isLoading = true;
  loadPromise = (async () => {
    ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
      postMessage({ type: 'progress', message: `Converting: ${percent}%` });
    });

    try {
      await ffmpeg.load({
        coreURL: ffmpegCoreURL,
        wasmURL: ffmpegWasmURL,
      });
    } catch (error) {
      isLoading = false; loadPromise = null; throw error;
    }
    return ffmpeg;
  })();

  return loadPromise;
}

self.onmessage = async (event) => {
  const { type, webmData } = event.data;

  if (type === 'preload') {
    try {
      const ff = await loadFFmpeg();
      if (!preloadExecPromise) {
        preloadExecPromise = ff.exec(['-nostdin', '-hide_banner', '-loglevel', 'error', '-version']).then(() => undefined);
      }
      await preloadExecPromise;
    } catch (error) {
      postMessage({ type: 'log', message: `[FFmpeg Worker] Preload failed: ${error instanceof Error ? error.message : String(error)}` });
    }
    return;
  }

  if (type === 'convert') {
    try {
      const ff = await loadFFmpeg();
      postMessage({ type: 'progress', message: 'Preparing video...' });

      await ff.writeFile('input.webm', new Uint8Array(webmData));

      postMessage({ type: 'progress', message: 'Converting to MP4...' });

      /**
       * FIREFOX SYNC FIX:
       * 1. -fflags +genpts+igndts: Ignore source DTS and regenerate pts to avoid desync
       * 2. -avoid_negative_ts make_zero: Force all timestamps to start from 0
       * 3. -r 30: Force constant 30fps
       * 4. -af aresample=async=1: Synchronize audio with video frames by stretching/shrinking audio
       */
      try {
        await ff.exec([
          '-nostdin',
          '-hide_banner',
          '-loglevel', 'error',
          '-fflags', '+genpts+igndts',
          '-avoid_negative_ts', 'make_zero',
          '-i', 'input.webm',
          '-r', '30',
          '-c:v', 'mpeg4',
          '-q:v', '9',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-af', 'aresample=async=1', // Sync audio
          '-movflags', '+faststart',
          '-vsync', 'cfr',
          'output.mp4'
        ]);
      } catch {
        postMessage({ type: 'log', message: `[FFmpeg Worker] Primary conversion failed, trying H.264 fallback...` });
        await ff.exec([
          '-nostdin',
          '-hide_banner',
          '-loglevel', 'error',
          '-fflags', '+genpts+igndts',
          '-avoid_negative_ts', 'make_zero',
          '-i', 'input.webm',
          '-r', '30',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '26',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-af', 'aresample=async=1',
          '-movflags', '+faststart',
          '-vsync', 'cfr',
          'output.mp4'
        ]);
      }

      postMessage({ type: 'progress', message: 'Finalizing...' });
      const mp4Data = await ff.readFile('output.mp4');
      await ff.deleteFile('input.webm');
      await ff.deleteFile('output.mp4');

      const mp4Bytes = new Uint8Array(mp4Data as Uint8Array);
      const mp4Buffer = mp4Bytes.buffer.slice(mp4Bytes.byteOffset, mp4Bytes.byteOffset + mp4Bytes.byteLength);
      workerScope.postMessage({ type: 'result', mp4Data: mp4Buffer }, [mp4Buffer]);
    } catch (error) {
      postMessage({ type: 'error', message: `Conversion failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
};
