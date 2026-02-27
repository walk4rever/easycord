import { useState, useRef, useEffect, useCallback } from 'react';
import { WebCodecsRecorder, isWebCodecsSupported } from '../utils/webCodecsRecorder';
import { convertWebMToMP4 } from '../utils/videoConverter';

export default function EasyCord() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'ready' | 'not-ready'>('not-ready');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertMessage, setConvertMessage] = useState('就绪');
  const [recordingMode, setRecordingMode] = useState<'WebCodecs' | 'MediaRecorder' | null>(null);
  const [webCodecsError, setWebCodecsError] = useState<string | null>(null);
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');


  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const discardOnStopRef = useRef(false);
  const recordedBlobRef = useRef<Blob | null>(null);
  const webCodecsRecorderRef = useRef<WebCodecsRecorder | null>(null);
  const drawLoopRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    streamRef.current = stream;
    // 当 stream 存在但 videoUrl 为 null 时，确保 video 元素被正确赋值 stream
    // 修复第二次录制时 video 元素重新挂载但未被赋值 srcObject 导致的黑屏问题
    if (stream && videoRef.current) {
      console.log('Restoring stream to video element');
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoUrl]);

  const getSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'video/webm';
  };

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const audioTracks = mediaStream.getAudioTracks();
      const videoTracks = mediaStream.getVideoTracks();
      console.log('Camera started - audio tracks:', audioTracks.length, 'video tracks:', videoTracks.length);

      audioTracks.forEach(track => {
        track.enabled = true;
        console.log('Audio track enabled:', track.enabled);
      });
      videoTracks.forEach(track => {
        track.enabled = true;
        console.log('Video track enabled:', track.enabled);
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
      setCameraStatus('ready');
      return mediaStream;
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('无法访问摄像头和麦克风，请确保已授予权限。');
      setCameraStatus('not-ready');
      return null;
    }
  }, []);

  const discardVideo = useCallback(() => {
    setVideoUrl(null);
    recordedBlobRef.current = null;
    setHasRecording(false);
    if (webCodecsRecorderRef.current) {
      webCodecsRecorderRef.current = null;
    }
  }, []);

  const startRecording = async () => {
    // If there is an existing recording, discard it first
    if (videoUrl || recordedBlobRef.current) {
      discardVideo();
    }
    setWebCodecsError(null);
    setRecordingMode(null);

    let currentStream = stream;
    if (!currentStream) {
      currentStream = await startCamera();
      if (!currentStream) return;
    }

    console.log('Starting recording process...');
    // Ensure any previous recorder is stopped
    if (webCodecsRecorderRef.current?.recording) {
      const recorder = webCodecsRecorderRef.current;
      webCodecsRecorderRef.current = null;
      if (drawLoopRef.current !== null) {
        cancelAnimationFrame(drawLoopRef.current);
        drawLoopRef.current = null;
      }
      try {
        await recorder.stop();
      } catch (e) {
        console.error(e);
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      discardOnStopRef.current = true;
      mediaRecorderRef.current.stop();
    }

    recordedBlobRef.current = null;
    setVideoUrl(null);
    setHasRecording(false);

    const supportedType = getSupportedMimeType();
    console.log('Using MIME type:', supportedType);

    const webCodecsSupported = isWebCodecsSupported() && !isFirefox;

    if (isFirefox) {
      console.log('Firefox detected: forcing MediaRecorder for compatibility');
      setWebCodecsError(null);
    }



    if (webCodecsSupported && videoRef.current) {
      const videoTrack = currentStream.getVideoTracks()[0];
      const settings = videoTrack?.getSettings() || {};
      // 优先使用 settings.width/height，其次使用 videoRef.videoWidth/Height，最后使用默认值
      // 注意：videoRef.videoWidth 在黑屏时可能为 0，所以必须要有默认值
      const width = Number(settings.width || (videoRef.current?.videoWidth) || 1280);
      const height = Number(settings.height || (videoRef.current?.videoHeight) || 720);

      console.log('WebCodecs setup - dimensions:', width, 'x', height);
      if (width === 0 || height === 0) {
        console.warn('Invalid dimensions for WebCodecsRecorder:', width, height);
      }

      const recorder = new WebCodecsRecorder({ width, height, audioStream: currentStream });
      try {
        await recorder.start();
        webCodecsRecorderRef.current = recorder;
        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvasRef.current = canvas;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get 2D context');
        } else {
          const draw = () => {
            const currentRecorder = webCodecsRecorderRef.current;
            if (!currentRecorder || !currentRecorder.recording) return;
            if (videoRef.current) {
              ctx.drawImage(videoRef.current, 0, 0, width, height);
              currentRecorder.addFrame(canvas);
            }
            drawLoopRef.current = requestAnimationFrame(draw);
          };
          draw();
          setIsRecording(true);
          setRecordingMode('WebCodecs');
          setWebCodecsError(null);
          console.log('Recording started successfully with WebCodecs');
          return;
        }
      } catch (err) {
        console.error('WebCodecsRecorder start failed:', err);
        setWebCodecsError(err instanceof Error ? err.message : String(err));
        
        // Clean up if partially started
        try { await recorder.stop(); } catch { void 0; }
        webCodecsRecorderRef.current = null;
        // Fall through to MediaRecorder...
      }
    } else if (webCodecsSupported && !videoRef.current) {
      // setWebCodecsError('WebCodecs 未尝试：预览未就绪');
    } else if (!webCodecsSupported) {
      // setWebCodecsError('WebCodecs 不支持：缺少 VideoEncoder/AudioEncoder');
    }
    
    // Fallback to MediaRecorder
    try {
      console.log('Falling back to MediaRecorder');
      setRecordingMode('MediaRecorder');
      // Show warning to user if fallback happens (unexpectedly)
      if (isWebCodecsSupported() && !isFirefox) {
         setError('WebCodecs 录制启动失败，已降级为普通录制模式。保存视频时将保存为 WebM 格式。');
         setTimeout(() => setError(null), 8000);
      }
      const recorder = new MediaRecorder(currentStream, { mimeType: supportedType });
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        if (discardOnStopRef.current) {
          discardOnStopRef.current = false;
          return;
        }
        const blob = new Blob(chunks, { type: supportedType });
        recordedBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        setHasRecording(true);
        setIsRecording(false);
      };
      
      recorder.start(100); // Collect chunks every 100ms
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      console.error('MediaRecorder error:', e);
      setError('无法启动录制');
    }
  };

  const stopRecording = async () => {
    if (webCodecsRecorderRef.current?.recording) {
      const recorder = webCodecsRecorderRef.current;
      // Don't nullify ref here yet, we need it to stop properly?
      // Actually original code nullified it first then stopped.
      // But we need to keep it to call stop() which returns blob.
      
      if (drawLoopRef.current !== null) {
        cancelAnimationFrame(drawLoopRef.current);
        drawLoopRef.current = null;
      }
      
      setIsRecording(false);
      try {
        const blob = await recorder.stop();
        recordedBlobRef.current = blob;
        console.log('Recording stopped, blob size:', blob.size, 'type:', blob.type);
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        setHasRecording(true);
      } catch (error: unknown) {
        console.error('[Recording] Failed to stop recorder:', error);
        const message = error instanceof Error ? error.message : String(error);
        alert(`Failed to save recording: ${message}`);
      } finally {
        webCodecsRecorderRef.current = null;
      }
      return;
    }
    
    // Fallback for MediaRecorder if WebCodecs not supported (though we mainly use WebCodecs)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setHasRecording(true);
    }
  };

  const saveVideo = async () => {
    const blob = recordedBlobRef.current;
    if (!blob) {
      console.log('No video blob to download');
      return;
    }
    
    let downloadBlob = blob;
    
    if (blob.type !== 'video/mp4') {
      try {
        setIsConverting(true);
        setConvertMessage('正在加载转换器...');
        console.log('Converting WebM to MP4...');
        const timeoutMs = 300000;
        const timeoutPromise = new Promise<Blob>((_, reject) =>
          setTimeout(() => reject(new Error('convert_timeout')), timeoutMs)
        );
        downloadBlob = await Promise.race([
          convertWebMToMP4(blob, (msg) => {
            setConvertMessage(msg);
          }),
          timeoutPromise
        ]);
        console.log('Conversion successful');
        setConvertMessage('转换完成');
      } catch (e) {
        console.error('Conversion failed:', e);
        const message = e instanceof Error ? e.message : String(e);
        if (message === 'convert_timeout') {
          setConvertMessage('转换超时，将下载原始 WebM');
        } else {
          setConvertMessage('转换失败，将下载原始 WebM');
        }
        downloadBlob = blob;
      } finally {
        setIsConverting(false);
        setTimeout(() => setConvertMessage('就绪'), 5000);
      }
    }
    
    const url = URL.createObjectURL(downloadBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    
    const isMp4 = downloadBlob.type === 'video/mp4';
    const ext = isMp4 ? 'mp4' : 'webm';
    
    a.download = `recording-${new Date().getTime()}.${ext}`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };
  useEffect(() => {
    startCamera();
    return () => {
      if (webCodecsRecorderRef.current?.recording) {
        void webCodecsRecorderRef.current.stop();
      }
      if (drawLoopRef.current !== null) {
        cancelAnimationFrame(drawLoopRef.current);
        drawLoopRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('Track stopped:', track.kind);
        });
      }
    };
  }, [startCamera]);

  return (
    <div className="easycord-container">
      <h3>📷 简单视频录制 (Simple Recording)</h3>

      {error && <div className="error-message">{error}</div>}

      <div className={`camera-viewport ${isRecording ? 'recording-active' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="live-video"
          style={{ display: videoUrl && !isRecording ? 'none' : 'block' }}
        />

        {videoUrl && !isRecording && (
          <video
            src={videoUrl}
            controls
            className="playback-video"
          />
        )}

        <div className="status-overlay">
          {isRecording && (
            <div className="status-badge rec">
              <span className="blink-dot">●</span> REC
            </div>
          )}
          {!isRecording && !videoUrl && cameraStatus === 'ready' && (
            <div className="status-badge ready">
              READY
            </div>
          )}
          {!isRecording && !videoUrl && cameraStatus === 'not-ready' && (
            <div className="status-badge paused">
              NOT READY
            </div>
          )}
          {!isRecording && videoUrl && (
            <div className="status-badge stopped">
              ⏹ STOPPED
            </div>
          )}
        </div>
      </div>

      <div className="controls-section">
        <div className="status-panel">
            <p>🎥 录制状态: {isRecording ? '录制中' : (hasRecording ? '已录制' : '就绪')}</p>
            {recordingMode && (
              <p>🛠 录制模式: <span style={{ 
                color: recordingMode === 'WebCodecs' ? '#4CAF50' : '#FFC107',
                fontWeight: 'bold'
              }}>
                {recordingMode === 'WebCodecs' ? '高性能 (MP4)' : '兼容 (WebM)'}
              </span>
              {recordingMode !== 'WebCodecs' && webCodecsError && !isFirefox && (
                <span style={{ fontSize: '10px', display: 'block', color: '#ff6b6b', marginTop: '2px' }}>
                  ({webCodecsError})
                </span>
              )}
              </p>
            )}
            <p>🎬 导出状态: <span className="action">{convertMessage}</span></p>
          </div>

        <div className="manual-controls">
          <button 
            onClick={startRecording} 
            disabled={isRecording || isConverting}
          >
            开始录制
          </button>
          
          <button 
            onClick={stopRecording} 
            disabled={!isRecording || isConverting}
          >
            停止录制
          </button>

          <button 
            onClick={saveVideo} 
            className="save-btn" 
            disabled={isRecording || !hasRecording || isConverting}
          >
            保存视频
          </button>
        </div>
      </div>

    </div>
  );
}
