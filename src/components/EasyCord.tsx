import { useState, useRef, useEffect, useCallback } from 'react';
import { convertWebMToMP4, primeVideoConverter } from '../utils/videoConverter';
import { GestureManager } from '../utils/gestureManager';

export default function EasyCord() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'ready' | 'not-ready' | 'loading'>('loading');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertMessage, setConvertMessage] = useState('就绪');
  const getBestMimeType = () => {
    const mp4Types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
    for (const type of mp4Types) if (MediaRecorder.isTypeSupported(type)) return { type, isNativeMP4: true };
    return { type: 'video/webm', isNativeMP4: false };
  };

  const [recordingMode, setRecordingMode] = useState<'NativeMP4' | 'WebCodecs' | 'MediaRecorder' | null>(() => {
    // Initial capability check
    const { isNativeMP4 } = getBestMimeType();
    return isNativeMP4 && !navigator.userAgent.toLowerCase().includes('firefox') ? 'NativeMP4' : null;
  });
  
  // Gesture & AI States
  const [isGestureLoading, setIsGestureLoading] = useState(true);
  const [lastDetectedGesture, setLastDetectedGesture] = useState('None');
  const [handDetected, setHandDetected] = useState(false);
  const [gestureProgress, setGestureProgress] = useState(0);
  const [debugState, setDebugState] = useState<{frame: number, rs: number}>({frame: 0, rs: 0});

  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('');
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [isDeviceListLoading, setIsDeviceListLoading] = useState(false);

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

  const stopStreamTracks = useCallback((mediaStream: MediaStream | null) => {
    if (!mediaStream) return;
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
  }, []);

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
      void primeVideoConverter();
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
          const timestamp = performance.now();
          const { gesture, isTriggered, handDetected: hasHand, progress } = GestureManager.getInstance().processFrame(video, timestamp);
          
          setHandDetected(hasHand);
          setGestureProgress(progress);

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
        setIsGestureLoading(false);
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

  const startCamera = useCallback(async (options?: { videoDeviceId?: string; audioDeviceId?: string }) => {
    console.log("[EasyCord] startCamera requested");
    setCameraStatus('loading');
    try {
      stopStreamTracks(streamRef.current);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          ...(options?.videoDeviceId ? { deviceId: { exact: options.videoDeviceId } } : {})
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(options?.audioDeviceId ? { deviceId: { exact: options.audioDeviceId } } : {})
        }
      });
      console.log("[EasyCord] getUserMedia success, tracks:", mediaStream.getTracks().length);
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setError(null);
      setCameraStatus('ready');
      const activeVideoDeviceId = mediaStream.getVideoTracks()[0]?.getSettings().deviceId;
      const activeAudioDeviceId = mediaStream.getAudioTracks()[0]?.getSettings().deviceId;
      if (activeVideoDeviceId) setSelectedVideoDeviceId(activeVideoDeviceId);
      if (activeAudioDeviceId) setSelectedAudioDeviceId(activeAudioDeviceId);
    } catch (e) { 
      console.error("[EasyCord] getUserMedia failed", e);
      setError('摄像头权限未开启'); 
      setCameraStatus('not-ready'); 
    }
  }, [stopStreamTracks]);

  const refreshDeviceList = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setIsDeviceListLoading(true);
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some(d => Boolean(d.label));
      if (!hasLabels) {
        const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() => null);
        if (temp) {
          stopStreamTracks(temp);
          devices = await navigator.mediaDevices.enumerateDevices();
        }
      }

      const videos = devices.filter(d => d.kind === 'videoinput');
      const audios = devices.filter(d => d.kind === 'audioinput');
      setVideoDevices(videos);
      setAudioDevices(audios);

      if (!selectedVideoDeviceId && videos[0]?.deviceId) setSelectedVideoDeviceId(videos[0].deviceId);
      if (!selectedAudioDeviceId && audios[0]?.deviceId) setSelectedAudioDeviceId(audios[0].deviceId);
    } finally {
      setIsDeviceListLoading(false);
    }
  }, [selectedAudioDeviceId, selectedVideoDeviceId, stopStreamTracks]);

  const openDeviceModal = useCallback(async () => {
    if (isRecordingRef.current || isConvertingRef.current) return;
    setIsDeviceModalOpen(true);
    await refreshDeviceList();
  }, [refreshDeviceList]);

  const applyDeviceSelection = useCallback(async () => {
    if (isRecordingRef.current || isConvertingRef.current) return;
    await startCamera({
      videoDeviceId: selectedVideoDeviceId || undefined,
      audioDeviceId: selectedAudioDeviceId || undefined
    });
    setIsDeviceModalOpen(false);
  }, [selectedAudioDeviceId, selectedVideoDeviceId, startCamera]);

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
          
          {/* Gesture Hold Progress Indicator */}
          {gestureProgress > 0 && lastDetectedGesture !== 'None' && (
            <div className="gesture-progress-indicator" style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              zIndex: 100, pointerEvents: 'none'
            }}>
              <svg width="80" height="80" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="8" />
                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--success)" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (1 - gestureProgress)}`}
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                />
                <text x="50" y="55" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">
                  {Math.ceil((1 - gestureProgress) * 3)}s
                </text>
              </svg>
            </div>
          )}

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
            <div style={{ color: isGestureLoading ? 'var(--warning)' : (error?.includes('AI') ? 'red' : 'var(--success)'), textAlign: 'right', fontSize: '0.5rem' }}>
              {isGestureLoading ? 'AI LOADING...' : (error?.includes('AI') ? 'AI ERROR' : 'AI ACTIVE')}
            </div>
          </div>
        </div>
        {!isRecording && !videoUrl && !isGestureLoading && <div className="gesture-hint">👍 比赞保持3秒开始录制</div>}
        {isRecording && <div className="gesture-hint">✊ 握拳保持3秒停止录制</div>}
        {!isRecording && videoUrl && <div className="gesture-hint secondary">🖐️ 伸手掌保持3秒重置</div>}
      </div>
      <div className="controls-section">
        <div className="status-panel">
          <p>模式: {recordingMode === 'NativeMP4' ? '原生 MP4' : '兼容模式'}</p>
          <p>状态: <span className="action">{isConverting ? convertMessage : (isRecording ? '录制中' : (videoUrl ? '回放中' : '就绪'))}</span></p>
        </div>
        <div className="manual-controls">
          <button
            type="button"
            className="device-settings-button"
            onClick={openDeviceModal}
            disabled={isRecording || isConverting || cameraStatus === 'loading'}
          >
            设备设置
          </button>
        </div>
      </div>

      {isDeviceModalOpen && (
        <div className="device-modal-backdrop" role="dialog" aria-modal="true">
          <div className="device-modal">
            <div className="device-modal-header">
              <div className="device-modal-title">选择输入设备</div>
              <button type="button" className="device-modal-close" onClick={() => setIsDeviceModalOpen(false)}>×</button>
            </div>
            <div className="device-modal-body">
              <label className="device-field">
                <div className="device-field-label">摄像头</div>
                <select
                  value={selectedVideoDeviceId}
                  onChange={(e) => setSelectedVideoDeviceId(e.target.value)}
                  disabled={isDeviceListLoading}
                >
                  {videoDevices.length === 0 && <option value="">未检测到摄像头</option>}
                  {videoDevices.map((d, idx) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `摄像头 ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="device-field">
                <div className="device-field-label">麦克风</div>
                <select
                  value={selectedAudioDeviceId}
                  onChange={(e) => setSelectedAudioDeviceId(e.target.value)}
                  disabled={isDeviceListLoading}
                >
                  {audioDevices.length === 0 && <option value="">未检测到麦克风</option>}
                  {audioDevices.map((d, idx) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `麦克风 ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="device-modal-footer">
              <button type="button" className="device-modal-secondary" onClick={refreshDeviceList} disabled={isDeviceListLoading}>
                刷新
              </button>
              <button type="button" className="device-modal-secondary" onClick={() => setIsDeviceModalOpen(false)}>
                取消
              </button>
              <button type="button" className="device-modal-primary" onClick={applyDeviceSelection} disabled={isDeviceListLoading}>
                应用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
