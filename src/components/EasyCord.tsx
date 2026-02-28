import { useState, useRef, useEffect, useCallback } from 'react';
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
  const [recordingMode, setRecordingMode] = useState<'NativeMP4' | 'WebCodecs' | 'MediaRecorder' | null>(null);
  
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    streamRef.current = stream;
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const getBestMimeType = () => {
    // Try Native MP4 first (Chrome/Edge)
    const mp4Types = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4'
    ];
    for (const type of mp4Types) {
      if (MediaRecorder.isTypeSupported(type)) return { type, isNativeMP4: true };
    }

    // Fallback to WebM
    const webmTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const type of webmTypes) {
      if (MediaRecorder.isTypeSupported(type)) return { type, isNativeMP4: false };
    }

    return { type: 'video/webm', isNativeMP4: false };
  };

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
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
      setError('无法访问摄像头和麦克风。');
      setCameraStatus('not-ready');
      return null;
    }
  }, []);

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `easycord-${new Date().getTime()}.${blob.type === 'video/mp4' ? 'mp4' : 'webm'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const startRecording = async () => {
    setVideoUrl(null);
    recordedBlobRef.current = null;
    setHasRecording(false);
    
    let currentStream = stream;
    if (!currentStream) {
      currentStream = await startCamera();
      if (!currentStream) return;
    }

    const { type: mimeType, isNativeMP4 } = getBestMimeType();

    // 1. If Native MP4 is supported (Chrome/Edge), use it! (Most stable A/V sync)
    if (isNativeMP4 && !isFirefox) {
      try {
        setRecordingMode('NativeMP4');
        const recorder = new MediaRecorder(currentStream, { 
          mimeType,
          videoBitsPerSecond: 6_000_000 // High quality
        });
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
          recordedBlobRef.current = blob;
          setVideoUrl(URL.createObjectURL(blob));
          setHasRecording(true);
          downloadBlob(blob);
        };
        recorder.start(100);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        return;
      } catch (e) {
        console.warn('Native MP4 failed, falling back...', e);
      }
    }

    // 2. WebCodecs (Excalicord Style) - Best for canvas composites
    // We only use this if we want to record the CANVAS (e.g. for future drawing features)
    // but for simple camera, MediaRecorder is actually better. 
    // Let's keep the option open but default to MediaRecorder for stability.
    
    // 3. Fallback to MediaRecorder (WebM -> MP4)
    try {
      setRecordingMode('MediaRecorder');
      const recorder = new MediaRecorder(currentStream, { 
        mimeType,
        videoBitsPerSecond: 6_000_000
      });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const webmBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        setIsConverting(true);
        try {
          setConvertMessage('正在同步音频并转换为 MP4...');
          const mp4Blob = await convertWebMToMP4(webmBlob, (msg) => setConvertMessage(msg));
          recordedBlobRef.current = mp4Blob;
          setConvertMessage('同步完成');
          downloadBlob(mp4Blob);
        } catch (e) {
          console.error('Conversion failed:', e);
          setConvertMessage('转换失败，下载 WebM');
          downloadBlob(webmBlob);
          recordedBlobRef.current = webmBlob;
        } finally {
          setIsConverting(false);
          setVideoUrl(URL.createObjectURL(recordedBlobRef.current!));
          setHasRecording(true);
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      console.error('MediaRecorder error:', e);
      setError('无法启动录制');
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  useEffect(() => {
    startCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [startCamera]);

  return (
    <div className="easycord-container">
      <h3>📷 简单视频录制 · MP4 直出</h3>

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
        {videoUrl && !isRecording && <video src={videoUrl} controls className="playback-video" />}
        <div className="status-overlay">
          {isRecording && <div className="status-badge rec"><span className="blink-dot">●</span> REC</div>}
          {!isRecording && !videoUrl && cameraStatus === 'ready' && <div className="status-badge ready">READY</div>}
        </div>
      </div>

      <div className="controls-section">
        <div className="status-panel">
          <p>模式: {recordingMode === 'NativeMP4' ? '原生 MP4 (极速)' : (recordingMode === 'WebCodecs' ? 'WebCodecs (MP4)' : '兼容模式 (自动同步音轨)')}</p>
          <p>状态: <span className="action">{isConverting ? convertMessage : (isRecording ? '录制中' : '就绪')}</span></p>
        </div>

        <div className="manual-controls">
          {!isRecording ? (
            <button onClick={startRecording} disabled={isConverting} className="primary-btn">开始录制</button>
          ) : (
            <button onClick={stopRecording} className="stop-btn">停止并保存</button>
          )}
          {hasRecording && !isRecording && !isConverting && (
            <button onClick={() => downloadBlob(recordedBlobRef.current!)} className="save-btn">重新下载</button>
          )}
        </div>
      </div>
    </div>
  );
}
