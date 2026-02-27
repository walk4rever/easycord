import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export const isWebCodecsSupported = (): boolean => 
  typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';

export interface WebCodecsRecorderOptions {
  width: number;
  height: number;
  frameRate?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  audioStream?: MediaStream; // For webcam audio
}

export class WebCodecsRecorder {
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private videoEncoder: VideoEncoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;

  private width: number;
  private height: number;
  private frameRate: number;
  private videoBitrate: number;
  private audioBitrate: number;
  private audioStream: MediaStream | null;

  private frameCount: number = 0;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private audioSampleRate: number = 48000;
  
  // Excalicord specific properties
  private warmupFrames: number = 5; // Skip first few frames for encoder warmup
  private audioTimestamp: number = 0;
  private lastFrameTime: number = 0; // For throttling

  constructor(options: WebCodecsRecorderOptions) {
    this.width = options.width;
    this.height = options.height;
    this.frameRate = options.frameRate || 30;
    this.videoBitrate = options.videoBitrate || 5_000_000; // 5 Mbps
    this.audioBitrate = options.audioBitrate || 128_000; // 128 kbps
    this.audioStream = options.audioStream || null;
  }

  async start(): Promise<void> {
    try {
      this.frameCount = 0;
      this.audioTimestamp = 0;
      this.lastFrameTime = 0;

      // Ensure dimensions are even (requirement for many codecs)
      if (this.width % 2 !== 0) this.width -= 1;
      if (this.height % 2 !== 0) this.height -= 1;

      if (this.audioStream) {
        try {
          this.audioContext = new AudioContext();
          this.audioSampleRate = this.audioContext.sampleRate;
        } catch (e) {
          console.warn('AudioContext creation failed', e);
          this.audioContext = null;
          this.audioStream = null;
        }
      }

      // Create the MP4 muxer
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

    // Create video encoder
    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        this.muxer?.addVideoChunk(chunk, meta);
      },
      error: (e) => console.error('VideoEncoder error:', e),
    });

    // Configure video encoder with H.264
    // Use High Profile Level 4.0 for 1080p support
    // Level 4.0 supports up to 1920x1080 @ 30fps
    this.videoEncoder.configure({
      codec: 'avc1.640028', // H.264 High Profile Level 4.0
      width: this.width,
      height: this.height,
      bitrate: this.videoBitrate,
      framerate: this.frameRate,
      latencyMode: 'realtime', // Optimize for live recording
    });

      // Wait for encoder to be ready
      await this.videoEncoder.flush();

      // Set up audio encoding if we have an audio stream
      if (this.audioStream) {
        await this.setupAudioEncoder();
      }

      this.isRecording = true;
      this.isPaused = false;

      console.log('[WebCodecsRecorder] Started recording', this.width, 'x', this.height);
    } catch (error) {
      console.error('[WebCodecsRecorder] Start failed:', error);
      await this.dispose();
      throw error;
    }
  }

  private async dispose(): Promise<void> {
    // Cleanup helper to release resources
    if (this.videoEncoder) {
      try {
        if (this.videoEncoder.state !== 'closed') this.videoEncoder.close();
      } catch (e) { console.error('Error closing video encoder:', e); }
      this.videoEncoder = null;
    }

    if (this.audioEncoder) {
      try {
        if (this.audioEncoder.state !== 'closed') this.audioEncoder.close();
      } catch (e) { console.error('Error closing audio encoder:', e); }
      this.audioEncoder = null;
    }

    if (this.scriptNode) {
      try { this.scriptNode.disconnect(); } catch (e) { console.error(e); }
      this.scriptNode = null;
    }

    if (this.audioContext) {
      try { await this.audioContext.close(); } catch (e) { console.error('Error closing audio context:', e); }
      this.audioContext = null;
    }
    
    this.muxer = null;
    this.isRecording = false;
  }

  private async setupAudioEncoder(): Promise<void> {
    if (!this.audioStream || !this.audioContext) return;

    // Create audio encoder
    this.audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        this.muxer?.addAudioChunk(chunk, meta);
      },
      error: (e) => console.error('AudioEncoder error:', e),
    });

    this.audioEncoder.configure({
      codec: 'mp4a.40.2', // AAC-LC
      numberOfChannels: 1,
      sampleRate: this.audioSampleRate,
      bitrate: this.audioBitrate,
      // bitrate: 128_000,
    });

    // Get audio track from stream
    const audioTrack = this.audioStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn('[WebCodecsRecorder] No audio track found');
      return;
    }

    // Create media stream source
    const audioOnlyStream = new MediaStream([audioTrack]);
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(audioOnlyStream);

    // Use ScriptProcessorNode for audio capture (simpler than AudioWorklet)
    const bufferSize = 4096;
    this.scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.scriptNode.onaudioprocess = (event) => {
      if (!this.isRecording || this.isPaused || !this.audioEncoder) return;

      const inputData = event.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Create AudioData with accumulated timestamp
      const audioData = new AudioData({
        format: 's16',
        sampleRate: this.audioSampleRate,
        numberOfFrames: int16Data.length,
        numberOfChannels: 1,
        timestamp: this.audioTimestamp,
        data: int16Data,
      });

      // Update timestamp for next chunk
      this.audioTimestamp += (int16Data.length / this.audioSampleRate) * 1_000_000;

      try {
        this.audioEncoder.encode(audioData);
      } catch (e) {
        console.error('Audio encode error:', e);
      }

      audioData.close();
    };

    this.mediaStreamSource.connect(this.scriptNode);
    this.scriptNode.connect(this.audioContext.destination);
  }

  // Call this for each frame with the canvas
  addFrame(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    if (!this.isRecording || this.isPaused || !this.videoEncoder) return;

    // Throttling logic: ensure we don't record faster than target frameRate
    const now = performance.now();
    const minInterval = 1000 / this.frameRate;
    
    // Only throttle if we have recorded at least one frame (after warmup)
    if (this.frameCount >= this.warmupFrames && now - this.lastFrameTime < minInterval) {
      return;
    }
    this.lastFrameTime = now;

    // Skip warmup frames to let encoder initialize
    if (this.frameCount < this.warmupFrames) {
      this.frameCount++;
      return;
    }

    // Calculate timestamp in microseconds (offset by warmup frames)
    // This generates PERFECTLY uniform timestamps (CFR), which is crucial for compatibility
    const adjustedFrame = this.frameCount - this.warmupFrames;
    const timestamp = (adjustedFrame * 1_000_000) / this.frameRate;

    // Create VideoFrame from canvas
    const frame = new VideoFrame(canvas, {
      timestamp,
      duration: 1_000_000 / this.frameRate,
    });

    // Encode the frame
    // First frame and every 2 seconds should be keyframes
    const keyFrame = adjustedFrame === 0 || adjustedFrame % (this.frameRate * 2) === 0;
    this.videoEncoder.encode(frame, { keyFrame });

    frame.close();
    this.frameCount++;
  }

  pause(): void {
    if (!this.isRecording || this.isPaused) return;
    this.isPaused = true;
    console.log('[WebCodecsRecorder] Paused');
  }

  resume(): void {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    console.log('[WebCodecsRecorder] Resumed');
  }

  async stop(): Promise<Blob> {
    if (!this.isRecording) {
      throw new Error('Not recording');
    }

    this.isRecording = false;
    console.log('[WebCodecsRecorder] Stopping, frames:', this.frameCount);

    try {
      // Flush encoders with error handling
      if (this.videoEncoder) {
        if (this.videoEncoder.state === 'configured') {
          try {
            await this.videoEncoder.flush();
          } catch (e) {
            console.warn('[WebCodecsRecorder] Video flush failed:', e);
          }
        }
        try {
          this.videoEncoder.close();
        } catch (e) {
          console.warn('[WebCodecsRecorder] Video encoder close failed:', e);
        }
        this.videoEncoder = null;
      }

      if (this.audioEncoder) {
        if (this.audioEncoder.state === 'configured') {
          try {
            await this.audioEncoder.flush();
          } catch (e) {
             console.warn('[WebCodecsRecorder] Audio flush failed:', e);
          }
        }
        try {
          this.audioEncoder.close();
        } catch (e) {
          console.warn('[WebCodecsRecorder] Audio encoder close failed:', e);
        }
        this.audioEncoder = null;
      }

      // Clean up audio context
      if (this.audioContext) {
        try {
          if (this.audioContext.state !== 'closed') {
            await this.audioContext.close();
          }
        } catch (e) {
          console.warn('[WebCodecsRecorder] Audio context close failed:', e);
        }
        this.audioContext = null;
      }

      // Finalize the muxer
      if (!this.muxer) {
        throw new Error('Muxer not initialized');
      }

      try {
        this.muxer.finalize();
      } catch (e) {
        console.error('[WebCodecsRecorder] Muxer finalize failed:', e);
        // Try to proceed anyway to get whatever is in the buffer
      }
      
      // Get the MP4 data
      const { buffer } = this.muxer.target;
      const blob = new Blob([buffer], { type: 'video/mp4' });

      console.log('[WebCodecsRecorder] Finished, size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');

      return blob;
    } catch (e) {
      console.error('[WebCodecsRecorder] Stop failed:', e);
      throw e;
    }
  }
  
  get recording(): boolean {
    return this.isRecording;
  }

  get paused(): boolean {
    return this.isPaused;
  }
}
