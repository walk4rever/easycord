// easycord/src/utils/ffmpegWorker.ts

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let loadPromise: Promise<FFmpeg> | null = null;

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  if (isLoading && loadPromise) return loadPromise;

  isLoading = true;
  loadPromise = (async () => {
    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => postMessage({ type: 'log', message: `[FFmpeg Worker] ${message}` }));
    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
      postMessage({ type: 'progress', message: `Converting: ${percent}%` });
    });

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
    } catch (error) {
      isLoading = false; loadPromise = null; throw error;
    }
    return ffmpeg;
  })();

  return loadPromise;
}

self.onmessage = async (event) => {
  const { type, webmBlob } = event.data;

  if (type === 'convert') {
    try {
      const ff = await loadFFmpeg();
      postMessage({ type: 'progress', message: 'Preparing video...' });

      const webmData = await fetchFile(webmBlob);
      await ff.writeFile('input.webm', webmData);

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
          '-fflags', '+genpts+igndts',
          '-avoid_negative_ts', 'make_zero',
          '-i', 'input.webm',
          '-r', '30',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '26',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-af', 'aresample=async=1', // Sync audio
          '-movflags', '+faststart',
          '-vsync', 'cfr',
          'output.mp4'
        ]);
      } catch {
        postMessage({ type: 'log', message: `[FFmpeg Worker] Primary conversion failed, trying robust fallback...` });
        await ff.exec([
          '-i', 'input.webm',
          '-r', '30',
          '-c:v', 'mpeg4',
          '-q:v', '6',
          '-c:a', 'aac',
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

      const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' });
      postMessage({ type: 'result', mp4Blob: mp4Blob });
    } catch (error) {
      postMessage({ type: 'error', message: `Conversion failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
};
