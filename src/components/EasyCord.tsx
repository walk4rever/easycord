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
  
  // Gesture & AI States
  const [isGestureLoading, setIsGestureLoading] = useState(true);
  const [lastDetectedGesture, setLastDetectedGesture] = useState('None');
  const [handDetected, setHandDetected] = useState(false);
  const [debugState, setDebugState] = useState<{frame: number, rs: number}>({frame: 0, rs: 0});

  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);

  const isRecordingRef = useRef(isRecording);
  const isConvertingRef = useRef(isConverting);
  const videoUrlRef = useRef(videoUrl);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    isConvertingRef.current = isConverting;
    videoUrlRef.current = videoUrl;
  }, [isRecording, isConverting, videoUrl]);

  // Handle Recording Logic
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isConvertingRef.current) return;
    setVideoUrl(null);
    recordedBlobRef.current = null;
    const currentStream = streamRef.current;
    if (!currentStream) return;
    const { type: mimeType, isNativeMP4 } = getBestMimeType();
    if (isNativeMP4 && !isFirefox) {
      try {
        setRecordingMode('NativeMP4');
        const recorder = new MediaRecorder(currentStream, { mimeType, videoBitsPerSecond: 6_000_000 });
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
      } catch (e) { console.warn('Native MP4 fallback', e); }
    }
    try {
      setRecordingMode('MediaRecorder');
      const recorder = new MediaRecorder(currentStream, { mimeType, videoBitsPerSecond: 6_000_000 });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const webmBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        setIsConverting(true);
        try {
          const mp4Blob = await convertWebMToMP4(webmBlob, (msg) => setConvertMessage(msg));
          recordedBlobRef.current = mp4Blob;
          downloadBlob(mp4Blob);
        } catch {
          console.error('Conv failed');
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
    } catch { setError('无法启动录制'); }
  }, [isFirefox]);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    setIsRecording(false);
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
  }, []);

  const resetRecording = useCallback(() => {
    setVideoUrl(null);
    setRecordingMode(null);
    recordedBlobRef.current = null;
    recordedChunksRef.current = [];
  }, []);

  const startRecRef = useRef(startRecording);
  const stopRecRef = useRef(stopRecording);
  const resetRecRef = useRef(resetRecording);

  useEffect(() => {
    startRecRef.current = startRecording;
    stopRecRef.current = stopRecording;
    resetRecRef.current = resetRecording;
  }, [startRecording, stopRecording, resetRecording]);

  const animate = useCallback(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      const readyState = video.readyState;
      
      setDebugState(prev => ({ frame: prev.frame + 1, rs: readyState }));

      if (readyState >= 2) {
        if (!isGestureLoading) {
          const timestamp = video.currentTime * 1000;
          const { gesture, isTriggered, handDetected: hasHand } = GestureManager.getInstance().processFrame(video, timestamp);
          
          setHandDetected(hasHand);
          if (gesture !== 'None') {
            setLastDetectedGesture(gesture);
          } else if (!hasHand) {
            setLastDetectedGesture('None');
          }

          if (isTriggered) {
            if (gesture === 'Thumb_Up' && !isRecordingRef.current && !videoUrlRef.current) {
              startRecRef.current();
            } else if (gesture === 'Closed_Fist' && isRecordingRef.current) {
              stopRecRef.current();
            } else if (gesture === 'Open_Palm' && !isRecordingRef.current && videoUrlRef.current) {
              resetRecRef.current();
            }
          }
        }
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [isGestureLoading]);

  // AI Init Effect
  useEffect(() => {
    console.log("[EasyCord] AI effect mount");
    const initAI = async () => {
      try {
        console.log("[EasyCord] Calling GestureManager.init()");
        await GestureManager.getInstance().init();
        console.log("[EasyCord] GestureManager.init() success");
        setIsGestureLoading(false);
      } catch (err) {
        console.error("[EasyCord] AI init failed", err);
        setError("AI 模块异常");
      }
    };
    initAI();
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      console.log("[EasyCord] AI effect cleanup");
      cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  // Video Stream Sync Effect
  useEffect(() => {
    if (stream && videoRef.current) {
      console.log("[EasyCord] Syncing stream to video element, readyState:", videoRef.current.readyState);
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        console.log("[EasyCord] Video metadata loaded");
        videoRef.current?.play().catch(e => console.error("[EasyCord] Video play failed", e));
      };
    }
  }, [stream]);

  const getBestMimeType = () => {
    const mp4Types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
    for (const type of mp4Types) if (MediaRecorder.isTypeSupported(type)) return { type, isNativeMP4: true };
    return { type: 'video/webm', isNativeMP4: false };
  };

  const startCamera = useCallback(async () => {
    console.log("[EasyCord] startCamera requested");
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      console.log("[EasyCord] getUserMedia success, tracks:", mediaStream.getTracks().length);
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setError(null);
      setCameraStatus('ready');
    } catch (e) { 
      console.error("[EasyCord] getUserMedia failed", e);
      setError('摄像头权限未开启'); 
      setCameraStatus('not-ready'); 
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
    console.log("[EasyCord] Mount Effect");
    startCamera(); 
  }, [startCamera]);

  return (
    <div className="easycord-container">
      {error && <div className="error-message">{error}</div>}
      <div className={`camera-viewport ${isRecording ? 'recording-active' : ''} ${videoUrl && !isRecording ? 'playback-active' : ''}`}>
        <video ref={videoRef} autoPlay muted playsInline className="live-video" />
        {videoUrl && !isRecording && <video src={videoUrl} controls autoPlay className="playback-video" />}
        <div className="status-overlay">
          {isRecording && <div className="status-badge rec"><span className="blink-dot">●</span> REC</div>}
          {!isRecording && !videoUrl && cameraStatus === 'ready' && <div className="status-badge ready">READY</div>}
          <div className="debug-dashboard" style={{
            fontSize: '0.6rem', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '8px', marginTop: '6px', color: 'white',
            display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'monospace'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span>HAND: {handDetected ? '👁️' : '🚫'}</span>
              <span>STATE: {debugState.rs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>GEST: {lastDetectedGesture}</span>
              <span>FPS: {debugState.frame}</span>
            </div>
            <div style={{ color: isGestureLoading ? 'var(--warning)' : 'var(--success)', textAlign: 'right', fontSize: '0.5rem' }}>
              {isGestureLoading ? 'AI LOADING...' : 'AI ACTIVE'}
            </div>
          </div>
        </div>
        {!isRecording && !videoUrl && !isGestureLoading && <div className="gesture-hint">👍 比赞开始录制</div>}
        {isRecording && <div className="gesture-hint">✊ 握拳停止录制</div>}
        {!isRecording && videoUrl && <div className="gesture-hint secondary">🖐️ 伸手掌重置</div>}
      </div>
      <div className="controls-section">
        <div className="status-panel">
          <p>模式: {recordingMode === 'NativeMP4' ? '原生 MP4' : '兼容模式'}</p>
          <p>状态: <span className="action">{isConverting ? convertMessage : (isRecording ? '录制中' : (videoUrl ? '回放中' : '就绪'))}</span></p>
        </div>
        <div className="manual-controls"><span className="gesture-only-tag">PURE GESTURE MODE</span></div>
      </div>
    </div>
  );
}
