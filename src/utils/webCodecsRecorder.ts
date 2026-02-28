/**
 * WebCodecs Recorder - Records canvas directly to MP4
 * 
 * Optimized with real-time timestamps for perfect A/V sync.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && 
         typeof AudioEncoder !== 'undefined' && 
         typeof VideoFrame !== 'undefined' && 
         typeof AudioData !== 'undefined';
}

export interface WebCodecsRecorderOptions {
  width: number;
  height: number;
  frameRate?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  audioStream?: MediaStream;
}

export class WebCodecsRecorder {
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private videoEncoder: VideoEncoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;

  private width: number;
  private height: number;
  private frameRate: number;
  private videoBitrate: number;
  private audioBitrate: number;
  private audioStream: MediaStream | null;

  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private audioSampleRate: number = 48000;
  private startTime: number = 0;
  private lastTimestamp: number = -1;

  constructor(options: WebCodecsRecorderOptions) {
    this.width = options.width % 2 === 0 ? options.width : options.width - 1;
    this.height = options.height % 2 === 0 ? options.height : options.height - 1;
    this.frameRate = options.frameRate || 30;
    this.videoBitrate = options.videoBitrate || 5_000_000;
    this.audioBitrate = options.audioBitrate || 128_000;
    this.audioStream = options.audioStream || null;
  }

  async start(): Promise<void> {
    this.startTime = performance.now();
    this.lastTimestamp = -1;

    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: this.width,
        height: this.height,
      },
      audio: this.audioStream ? {
        codec: 'aac',
        numberOfChannels: 1,
        sampleRate: this.audioSampleRate,
      } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });

    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer?.addVideoChunk(chunk, meta),
      error: (e) => console.error('VideoEncoder error:', e),
    });

    this.videoEncoder.configure({
      codec: 'avc1.640028',
      width: this.width,
      height: this.height,
      bitrate: this.videoBitrate,
      framerate: this.frameRate,
      latencyMode: 'realtime',
    });

    if (this.audioStream) {
      await this.setupAudioEncoder();
    }

    this.isRecording = true;
    this.isPaused = false;
  }

  private async setupAudioEncoder(): Promise<void> {
    if (!this.audioStream) return;

    this.audioEncoder = new AudioEncoder({
      output: (chunk, meta) => this.muxer?.addAudioChunk(chunk, meta),
      error: (e) => console.error('AudioEncoder error:', e),
    });

    this.audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: 1,
      sampleRate: this.audioSampleRate,
      bitrate: this.audioBitrate,
    });

    this.audioContext = new AudioContext({ sampleRate: this.audioSampleRate });
    const audioTrack = this.audioStream.getAudioTracks()[0];
    const audioOnlyStream = new MediaStream([audioTrack]);
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(audioOnlyStream);

    const bufferSize = 4096;
    this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isRecording || this.isPaused || !this.audioEncoder) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Use real-time elapsed for audio timestamp
      const timestamp = (performance.now() - this.startTime) * 1000;

      const audioData = new AudioData({
        format: 's16',
        sampleRate: this.audioSampleRate,
        numberOfFrames: int16Data.length,
        numberOfChannels: 1,
        timestamp: timestamp,
        data: int16Data,
      });

      try {
        if (this.audioEncoder.state === 'configured') {
          this.audioEncoder.encode(audioData);
        }
      } catch (e) {
        console.error('Audio encode error:', e);
      } finally {
        audioData.close();
      }
    };

    this.mediaStreamSource.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  addFrame(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    if (!this.isRecording || this.isPaused || !this.videoEncoder) return;

    // Use actual elapsed time for video timestamp
    const now = performance.now();
    const timestamp = (now - this.startTime) * 1000; // in microseconds

    // Ensure monotonically increasing timestamps
    if (timestamp <= this.lastTimestamp) return;
    this.lastTimestamp = timestamp;

    const frame = new VideoFrame(canvas, {
      timestamp: timestamp,
      duration: 1_000_000 / this.frameRate,
    });

    // Keyframe every 2 seconds
    const keyFrame = Math.floor(timestamp / 2_000_000) > Math.floor((timestamp - 40000) / 2_000_000);
    
    try {
      if (this.videoEncoder.state === 'configured') {
        this.videoEncoder.encode(frame, { keyFrame: keyFrame || timestamp === 0 });
      }
    } catch (e) {
      console.error('Video encode error:', e);
    } finally {
      frame.close();
    }
  }

  async stop(): Promise<Blob> {
    this.isRecording = false;
    if (this.videoEncoder) {
      if (this.videoEncoder.state === 'configured') await this.videoEncoder.flush();
      this.videoEncoder.close();
    }
    if (this.audioEncoder) {
      if (this.audioEncoder.state === 'configured') await this.audioEncoder.flush();
      this.audioEncoder.close();
    }
    if (this.scriptProcessor) this.scriptProcessor.disconnect();
    if (this.audioContext) await this.audioContext.close();
    
    if (!this.muxer) throw new Error('Muxer not initialized');
    this.muxer.finalize();
    return new Blob([this.muxer.target.buffer], { type: 'video/mp4' });
  }

  get recording(): boolean { return this.isRecording; }
}
