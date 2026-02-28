import { useState, useRef, useEffect, useCallback } from 'react';
import { convertWebMToMP4 } from '../utils/videoConverter';
import { GestureManager } from '../utils/gestureManager';

export default function EasyCord() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'ready' | 'not-ready' | 'loading'>('loading');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertMessage, setConvertMessage] = useState('就绪');
  const [recordingMode, setRecordingMode] = useState<'NativeMP4' | 'WebCodecs' | 'MediaRecorder' | null>(null);
  
  // Gesture States
  const [isGestureLoading, setIsGestureLoading] = useState(true);

  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);

  const isRecordingRef = useRef(isRecording);
  const isConvertingRef = useRef(isConverting);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    isConvertingRef.current = isConverting;
  }, [isRecording, isConverting]);

  // Handle Recording Logic
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isConvertingRef.current) return;
    
    setVideoUrl(null);
    recordedBlobRef.current = null;

    
    let currentStream = streamRef.current;
    if (!currentStream) return;

    const { type: mimeType, isNativeMP4 } = getBestMimeType();

    if (isNativeMP4 && !isFirefox) {
      try {
        setRecordingMode('NativeMP4');
        const recorder = new MediaRecorder(currentStream, { 
          mimeType,
          videoBitsPerSecond: 6_000_000
        });
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
          recordedBlobRef.current = blob;
          setVideoUrl(URL.createObjectURL(blob));

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

        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      console.error('MediaRecorder error:', e);
      setError('无法启动录制');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const resetRecording = useCallback(() => {
    setVideoUrl(null);

    setRecordingMode(null);
    recordedBlobRef.current = null;
    recordedChunksRef.current = [];
  }, []);

  // Gesture Recognition Loop
  const animate = useCallback((time: number) => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      const { gesture, isTriggered } = GestureManager.getInstance().processFrame(videoRef.current, time);
      
      if (isTriggered) {
        if (gesture === 'Thumb_Up' && !isRecordingRef.current && !videoUrl) {
          startRecording();
        } else if (gesture === 'Open_Palm' && isRecordingRef.current) {
          stopRecording();
        } else if (gesture === 'Victory' && !isRecordingRef.current && videoUrl) {
          resetRecording();
        }
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [startRecording, stopRecording]);

  useEffect(() => {
    const initAI = async () => {
      try {
        await GestureManager.getInstance().init();
        setIsGestureLoading(false);
        requestRef.current = requestAnimationFrame(animate);
      } catch (err) {
        console.error("Failed to init GestureManager:", err);
        setError("手势识别初始化失败");
      }
    };
    initAI();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  useEffect(() => {
    streamRef.current = stream;
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const getBestMimeType = () => {
    const mp4Types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
    for (const type of mp4Types) {
      if (MediaRecorder.isTypeSupported(type)) return { type, isNativeMP4: true };
    }
    return { type: 'video/webm', isNativeMP4: false };
  };

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      setStream(mediaStream);
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

  useEffect(() => {
    startCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [startCamera]);

  return (
    <div className="easycord-container">
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

        {/* Gesture Instruction Overlay */}
        {!isRecording && !videoUrl && !isGestureLoading && (
          <div className="gesture-hint">
            👍 比赞开始录制
          </div>
        )}
        {isRecording && (
          <div className="gesture-hint">
            🖐️ 伸手掌停止录制
          </div>
        )}
        {!isRecording && videoUrl && (
          <div className="gesture-hint secondary">
            ✌️ 剪刀手重置
          </div>
        )}
      </div>

      <div className="controls-section">
        <div className="status-panel">
          <p>模式: {recordingMode === 'NativeMP4' ? '原生 MP4' : '兼容模式'}</p>
          <p>状态: <span className="action">{isConverting ? convertMessage : (isRecording ? '录制中' : (videoUrl ? '回放中' : '就绪'))}</span></p>
        </div>

        <div className="manual-controls">
           <span className="gesture-only-tag">PURE GESTURE MODE</span>
        </div>
      </div>
    </div>
  );
}
