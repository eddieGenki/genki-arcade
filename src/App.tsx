import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import logoUrl from './assets/genki-logo.png';

type DeviceInfo = { deviceId: string; label: string };

const SHADOWCAST_HINTS = ['shadowcast', 'shadow cast', 'genki'];

// Heuristic: is this device label likely a Genki capture card?
function isGenkiDevice(label: string | undefined): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return SHADOWCAST_HINTS.some((h) => l.includes(h));
}

// Common resolutions/framerates we'll offer when the device's reported
// capabilities are too coarse to enumerate exactly. We always try, and the
// browser will clamp via applyConstraints.
const FALLBACK_RESOLUTIONS: Array<[number, number, string]> = [
  [3840, 2160, '4K UHD'],
  [2560, 1440, '1440p'],
  [1920, 1080, '1080p'],
  [1280, 720, '720p'],
  [854, 480, '480p'],
];

const FALLBACK_FPS = [120, 60, 50, 30, 24];

function pickShadowcast(devices: DeviceInfo[]): DeviceInfo | undefined {
  return devices.find((d) =>
    SHADOWCAST_HINTS.some((h) => d.label.toLowerCase().includes(h)),
  );
}

// Compute the area within a stage element that the main <video> actually
// occupies (object-fit: contain leaves letterbox bars). Used to translate
// PiP screen position into canvas (native video) coordinates.
function getDisplayedVideoRect(vw: number, vh: number, sw: number, sh: number) {
  if (!vw || !vh || !sw || !sh) return { x: 0, y: 0, w: sw, h: sh };
  const va = vw / vh;
  const sa = sw / sh;
  let dw: number, dh: number;
  if (va > sa) {
    dw = sw;
    dh = sw / va;
  } else {
    dh = sh;
    dw = sh * va;
  }
  return { x: (sw - dw) / 2, y: (sh - dh) / 2, w: dw, h: dh };
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const [videoDevices, setVideoDevices] = useState<DeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<DeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([]);

  const [videoDeviceId, setVideoDeviceId] = useState<string>('');
  const [audioDeviceId, setAudioDeviceId] = useState<string>('');
  const [outputDeviceId, setOutputDeviceId] = useState<string>('default');

  const [resolution, setResolution] = useState<string>('1920x1080');
  const [fps, setFps] = useState<number>(60);
  const [mirrored, setMirrored] = useState<boolean>(false);
  const [audioOn, setAudioOn] = useState<boolean>(true);
  const [micOn, setMicOn] = useState<boolean>(false);
  const [micDeviceId, setMicDeviceId] = useState<string>('');

  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [actualSettings, setActualSettings] = useState<MediaTrackSettings | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean>(false);

  const stageRef = useRef<HTMLElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Live snapshot of visual settings, read by the recording RAF loop so
  // mid-recording toggles take effect without restarting the recorder.
  const captureSettingsRef = useRef({
    mirrored: false,
    pipOn: false,
    pipMirrored: true,
    adjustmentsActive: false,
    filterCss: 'none',
  });

  // Image adjustments (compensates for washed-out MJPEG look on cheap cards) -
  const [brightness, setBrightness] = useState<number>(1);
  const [contrast, setContrast] = useState<number>(1);
  const [saturation, setSaturation] = useState<number>(1);
  const [imgPanelOpen, setImgPanelOpen] = useState<boolean>(false);
  const filterCss = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
  const adjustmentsActive = brightness !== 1 || contrast !== 1 || saturation !== 1;

  // PiP webcam overlay --------------------------------------------------------
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const pipStreamRef = useRef<MediaStream | null>(null);
  const [pipOn, setPipOn] = useState<boolean>(false);
  const [pipDeviceId, setPipDeviceId] = useState<string>('');
  const [pipMirrored, setPipMirrored] = useState<boolean>(true); // webcam = self-image, default mirrored
  const [pipPos, setPipPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 }); // -1 = use default corner
  const [pipSize, setPipSize] = useState<{ w: number; h: number }>({ w: 320, h: 180 });

  // ----- Device enumeration ---------------------------------------------------

  const refreshDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const vids: DeviceInfo[] = all
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));
    const mics: DeviceInfo[] = all
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }));
    const outs: DeviceInfo[] = all
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Speaker' }));

    setVideoDevices(vids);
    setAudioDevices(mics);
    setOutputDevices(outs);

    // Auto-select ShadowCast when possible.
    setVideoDeviceId((cur) => cur || pickShadowcast(vids)?.deviceId || vids[0]?.deviceId || '');
    setAudioDeviceId((cur) => cur || pickShadowcast(mics)?.deviceId || mics[0]?.deviceId || '');
  }, []);

  // First-run permission grant. Browsers hide labels until permission is given.
  // After this resolves, the auto-start effect will pick up `hasAccess` and
  // begin streaming.
  const requestInitialPermission = useCallback(async () => {
    setError('');
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      probe.getTracks().forEach((t) => t.stop());
      await refreshDevices();
      setHasAccess(true);
    } catch (e) {
      setError(`Permission error: ${(e as Error).message}`);
    }
  }, [refreshDevices]);

  useEffect(() => {
    // Try to populate the picker immediately. If permission was previously
    // granted on this origin, labels will be present; if not, the user clicks
    // "Start" once to grant.
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, [refreshDevices]);

  // If permission is already granted on this origin (HTTPS/Electron, not file://),
  // skip the manual Start button and go straight to streaming.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('permissions' in navigator)) return;
      try {
        const cam = await (navigator as any).permissions.query({ name: 'camera' });
        if (!cancelled && cam.state === 'granted') {
          requestInitialPermission();
        }
      } catch {
        // Firefox doesn't support the 'camera' permission name; that's fine —
        // the user will just see the Start button.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestInitialPermission]);

  // ----- Stream lifecycle -----------------------------------------------------

  const stopStreams = useCallback(() => {
    // Stop any in-progress recording first so we don't dangle a recorder.
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      cancelAnimationFrame(recordingRafRef.current);
      recordingRafRef.current = 0;
      recorderRef.current.stop();
      recorderRef.current = null;
      setRecording(false);
    }

    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    videoStreamRef.current = null;
    audioStreamRef.current = null;
    micStreamRef.current = null;

    audioNodeRef.current?.disconnect();
    audioNodeRef.current = null;
    micNodeRef.current?.disconnect();
    micNodeRef.current = null;
    mixDestRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    setActualSettings(null);
  }, []);

  const start = useCallback(async () => {
    setError('');
    stopStreams();

    const [w, h] = resolution.split('x').map(Number);

    try {
      // VIDEO ------------------------------------------------------------------
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: w },
        height: { ideal: h },
        frameRate: { ideal: fps },
      };
      if (videoDeviceId) videoConstraints.deviceId = { exact: videoDeviceId };

      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      videoStreamRef.current = videoStream;

      if (videoRef.current) {
        videoRef.current.srcObject = videoStream;
        // Lowest-latency render path: <video> srcObject. No canvas in the
        // hot path. autoplay+muted+playsinline ensures it actually plays.
        await videoRef.current.play().catch(() => {});
      }

      const vTrack = videoStream.getVideoTracks()[0];
      setActualSettings(vTrack.getSettings());

      // AUDIO ------------------------------------------------------------------
      // Always create the audio graph: it lets us mix game audio + mic into
      // one stream for recording, even when passthrough is off.
      const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
      audioCtxRef.current = ctx;
      const mixDest = ctx.createMediaStreamDestination();
      mixDestRef.current = mixDest;

      // Game audio: low-latency, all DSP disabled. Goes to BOTH speakers
      // (monitoring) and the mix (recording).
      if (audioOn) {
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...({
            googEchoCancellation: false,
            googAutoGainControl: false,
            googNoiseSuppression: false,
            googHighpassFilter: false,
            googTypingNoiseDetection: false,
          } as any),
        };
        if (audioDeviceId) audioConstraints.deviceId = { exact: audioDeviceId };

        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
        audioStreamRef.current = audioStream;

        const src = ctx.createMediaStreamSource(audioStream);
        audioNodeRef.current = src;
        src.connect(ctx.destination); // monitor through speakers
        src.connect(mixDest); // include in recording

        // Route monitoring to chosen output device if supported.
        if (outputDeviceId && outputDeviceId !== 'default' && (ctx as any).setSinkId) {
          try {
            await (ctx as any).setSinkId(outputDeviceId);
          } catch (e) {
            console.warn('setSinkId failed:', e);
          }
        }
      }

      setRunning(true);
    } catch (e) {
      setError(`Start failed: ${(e as Error).message}`);
      stopStreams();
    }
  }, [resolution, fps, videoDeviceId, audioDeviceId, outputDeviceId, audioOn, stopStreams]);

  // Auto-start as soon as we have permission. Restart whenever the user
  // picks a different device or toggles audio passthrough.
  useEffect(() => {
    if (!hasAccess) return;
    start();
    // We deliberately do NOT include `start` in deps — start is recreated
    // on every relevant state change already, and including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, videoDeviceId, audioDeviceId, audioOn]);

  // Mic capture (recorded into the mix, not monitored through speakers).
  // Voice DSP is intentionally enabled — voice benefits from echo cancel,
  // noise suppression, AGC. Game audio still bypasses all of that.
  useEffect(() => {
    let cancelled = false;

    const teardown = () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      micNodeRef.current?.disconnect();
      micNodeRef.current = null;
    };

    if (!micOn || !running || !audioCtxRef.current || !mixDestRef.current) {
      teardown();
      return;
    }

    (async () => {
      try {
        const constraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
        if (micDeviceId) constraints.deviceId = { exact: micDeviceId };

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: constraints,
          video: false,
        });
        if (cancelled || !audioCtxRef.current || !mixDestRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        teardown();
        micStreamRef.current = stream;
        const src = audioCtxRef.current.createMediaStreamSource(stream);
        micNodeRef.current = src;
        src.connect(mixDestRef.current); // recording only — never connected to ctx.destination
      } catch (e) {
        setError(`Mic failed: ${(e as Error).message}`);
        setMicOn(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [micOn, micDeviceId, running]);

  // Re-apply video constraints on the fly (no full restart) when the user
  // changes resolution or fps while running.
  useEffect(() => {
    if (!running) return;
    const track = videoStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const [w, h] = resolution.split('x').map(Number);
    track
      .applyConstraints({
        width: { ideal: w },
        height: { ideal: h },
        frameRate: { ideal: fps },
      })
      .then(() => setActualSettings(track.getSettings()))
      .catch((e) => setError(`Apply constraints failed: ${e.message}`));
  }, [resolution, fps, running]);

  useEffect(() => () => stopStreams(), [stopStreams]);

  // Keep capture settings ref in sync with live state for the recording RAF.
  useEffect(() => {
    captureSettingsRef.current = {
      mirrored,
      pipOn,
      pipMirrored,
      adjustmentsActive,
      filterCss,
    };
  });

  // ----- Composite drawing (shared by screenshot and recording) ---------------
  // Draws main video + optional PiP overlay onto a canvas, honoring mirror
  // and image adjustments. The canvas is sized to the main video's native
  // resolution so output is full quality.
  const drawComposite = useCallback((canvas: HTMLCanvasElement) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const ctx = canvas.getContext('2d')!;
    const {
      mirrored: mFlag,
      pipOn: pFlag,
      pipMirrored: pmFlag,
      adjustmentsActive: aFlag,
      filterCss: fCss,
    } = captureSettingsRef.current;

    // Match canvas to native video resolution.
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

    // Main pass: mirror + filter applied.
    ctx.save();
    ctx.filter = aFlag ? fCss : 'none';
    if (mFlag) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // PiP overlay pass.
    const pipVid = pipVideoRef.current;
    const stage = stageRef.current;
    if (pFlag && pipVid && pipVid.videoWidth && stage) {
      const stageRect = stage.getBoundingClientRect();
      const pipEl = pipVid.parentElement;
      if (pipEl) {
        const pipRect = pipEl.getBoundingClientRect();
        const disp = getDisplayedVideoRect(
          video.videoWidth,
          video.videoHeight,
          stage.clientWidth,
          stage.clientHeight,
        );
        const sx = canvas.width / disp.w;
        const sy = canvas.height / disp.h;
        const cx = (pipRect.left - stageRect.left - disp.x) * sx;
        const cy = (pipRect.top - stageRect.top - disp.y) * sy;
        const cw = pipRect.width * sx;
        const ch = pipRect.height * sy;

        ctx.save();
        ctx.filter = 'none';
        if (pmFlag) {
          ctx.translate(cx + cw, cy);
          ctx.scale(-1, 1);
          ctx.drawImage(pipVid, 0, 0, cw, ch);
        } else {
          ctx.drawImage(pipVid, cx, cy, cw, ch);
        }
        ctx.restore();
      }
    }
  }, []);

  // ----- Screenshot -----------------------------------------------------------

  const takeScreenshot = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    drawComposite(canvas);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `genki-arcade-${ts}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }, [drawComposite]);

  // ----- Recording ------------------------------------------------------------
  // MediaRecorder doesn't support MJPEG. We pick the best codec the browser
  // *does* support, in order of preference. VP9 is the closest analogue to
  // "low-latency game capture" without going full WebCodecs.
  const pickMimeType = (): string | undefined => {
    const candidates = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2', // H.264 high + AAC (Chrome ≥ 126)
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
    }
    return undefined;
  };

  // Recording uses a canvas pipeline so the encoded video matches what the
  // user sees: PiP overlay, mirror, and image adjustments are all baked in.
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingRafRef = useRef<number>(0);

  const startRecording = useCallback(() => {
    if (!videoStreamRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setError('');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    recordingCanvasRef.current = canvas;

    const renderLoop = () => {
      drawComposite(canvas);
      recordingRafRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const canvasStream = (canvas as any).captureStream(fps) as MediaStream;
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    // Pull audio from the mix destination so game audio + mic are combined.
    const mixStream = mixDestRef.current?.stream;
    if (mixStream) tracks.push(...mixStream.getAudioTracks());
    const combined = new MediaStream(tracks);

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: 20_000_000, // 20 Mbps — high quality 1080p60
      });
    } catch (e) {
      cancelAnimationFrame(recordingRafRef.current);
      setError(`Recorder failed: ${(e as Error).message}`);
      return;
    }

    recordedChunksRef.current = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || 'video/webm';
      const blob = new Blob(recordedChunksRef.current, { type });
      recordedChunksRef.current = [];
      const url = URL.createObjectURL(blob);
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `genki-arcade-${ts}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      canvasStream.getTracks().forEach((t) => t.stop());
      recordingCanvasRef.current = null;
    };

    recorder.start(1000); // emit a chunk per second so memory doesn't pile up
    recorderRef.current = recorder;
    setRecording(true);
  }, [fps, drawComposite]);

  const stopRecording = useCallback(() => {
    cancelAnimationFrame(recordingRafRef.current);
    recordingRafRef.current = 0;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  // ----- PiP webcam -----------------------------------------------------------

  // Acquire / release the webcam stream when the toggle or device changes.
  useEffect(() => {
    let cancelled = false;
    if (!pipOn) {
      pipStreamRef.current?.getTracks().forEach((t) => t.stop());
      pipStreamRef.current = null;
      if (pipVideoRef.current) pipVideoRef.current.srcObject = null;
      return;
    }
    (async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: pipDeviceId
            ? { deviceId: { exact: pipDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Stop any prior PiP stream.
        pipStreamRef.current?.getTracks().forEach((t) => t.stop());
        pipStreamRef.current = stream;
        if (pipVideoRef.current) {
          pipVideoRef.current.srcObject = stream;
          pipVideoRef.current.play().catch(() => {});
        }
      } catch (e) {
        setError(`Webcam failed: ${(e as Error).message}`);
        setPipOn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipOn, pipDeviceId]);

  // Drag the PiP overlay around inside the stage.
  const onPipMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const stage = stageRef.current;
      const pip = e.currentTarget;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      const pipRect = pip.getBoundingClientRect();
      const offsetX = e.clientX - pipRect.left;
      const offsetY = e.clientY - pipRect.top;

      const onMove = (ev: MouseEvent) => {
        const x = ev.clientX - stageRect.left - offsetX;
        const y = ev.clientY - stageRect.top - offsetY;
        const maxX = stageRect.width - pipRect.width;
        const maxY = stageRect.height - pipRect.height;
        setPipPos({
          x: Math.max(0, Math.min(maxX, x)),
          y: Math.max(0, Math.min(maxY, y)),
        });
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [],
  );

  // ----- Fullscreen -----------------------------------------------------------

  const toggleFullscreen = useCallback(async () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await stageRef.current.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ----- UI -------------------------------------------------------------------

  const resolutionOptions = useMemo(() => FALLBACK_RESOLUTIONS, []);
  const fpsOptions = useMemo(() => FALLBACK_FPS, []);

  const settingsLabel = actualSettings
    ? `${actualSettings.width ?? '?'}×${actualSettings.height ?? '?'} @ ${
        actualSettings.frameRate ? Math.round(actualSettings.frameRate) : '?'
      }fps`
    : '—';

  // Active main video device label, if known. On file:// labels are stripped
  // and we can't tell — so we render a neutral fallback.
  const activeVideoLabel =
    videoDevices.find((d) => d.deviceId === videoDeviceId)?.label || '';
  const activeAudioLabel =
    audioDevices.find((d) => d.deviceId === audioDeviceId)?.label || '';
  const labelsKnown = videoDevices.some((d) => d.deviceId && d.label);
  const isShadowcastActive =
    isGenkiDevice(activeVideoLabel) || isGenkiDevice(activeAudioLabel);

  return (
    <div className="app">
      <header className="topbar">
        <img src={logoUrl} alt="Genki" className="logo" />
        <span className="brand-divider" aria-hidden />
        <h1>Arcade</h1>
        <span className="status">
          {running ? `Live · ${settingsLabel}` : 'Idle'}
          {recording && <span className="rec-dot" title="Recording" />}
        </span>
        <span className="grow" />
        {error && <span className="status error">{error}</span>}
        {!error && labelsKnown && isShadowcastActive && (
          <span className="promo good" title={activeVideoLabel}>
            <span className="dot" /> ShadowCast connected
          </span>
        )}
        {!error && labelsKnown && !isShadowcastActive && running && (
          <a
            className="promo upsell"
            href="https://www.genkithings.com/products/shadowcast-3-pro"
            target="_blank"
            rel="noopener noreferrer"
          >
            Want 4K@60? Get ShadowCast 3 →
          </a>
        )}
        {!error && !labelsKnown && (
          <a
            className="promo neutral"
            href="https://www.genkithings.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            genkithings.com →
          </a>
        )}
      </header>

      <main className="stage" ref={stageRef as any}>
        {!hasAccess && (
          <div className="placeholder">
            <div>Connect your ShadowCast and grant camera + microphone access.</div>
            <button className="primary" onClick={requestInitialPermission}>
              Start
            </button>
          </div>
        )}
        {hasAccess && !running && (
          <div className="placeholder">
            <div>Stream paused.</div>
            <button className="primary" onClick={start}>
              Resume
            </button>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={mirrored ? 'mirrored' : ''}
          style={{
            display: running ? 'block' : 'none',
            filter: adjustmentsActive ? filterCss : undefined,
          }}
        />

        {pipOn && (
          <div
            className="pip"
            onMouseDown={onPipMouseDown}
            style={{
              width: pipSize.w,
              height: pipSize.h,
              ...(pipPos.x < 0
                ? { right: 16, bottom: 16 } // default: bottom-right
                : { left: pipPos.x, top: pipPos.y }),
            }}
          >
            <video
              ref={pipVideoRef}
              autoPlay
              muted
              playsInline
              className={pipMirrored ? 'mirrored' : ''}
            />
            <div className="pip-toolbar">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPipMirrored((m) => !m);
                }}
                title="Mirror webcam"
              >
                ⇋
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPipOn(false);
                }}
                title="Close webcam"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="controls">
        <label className="field">
          Video device
          <select value={videoDeviceId} onChange={(e) => setVideoDeviceId(e.target.value)}>
            <option value="">Default (browser picks)</option>
            {videoDevices
              .filter((d) => d.deviceId)
              .map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
          </select>
        </label>

        <label className="field">
          Audio input
          <select value={audioDeviceId} onChange={(e) => setAudioDeviceId(e.target.value)}>
            <option value="">Default (browser picks)</option>
            {audioDevices
              .filter((d) => d.deviceId)
              .map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
          </select>
        </label>

        <label className="field">
          Audio output
          <select value={outputDeviceId} onChange={(e) => setOutputDeviceId(e.target.value)}>
            <option value="default">System default</option>
            {outputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Resolution
          <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
            {resolutionOptions.map(([w, h, label]) => (
              <option key={`${w}x${h}`} value={`${w}x${h}`}>
                {label} ({w}×{h})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Frame rate
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            {fpsOptions.map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>

        <label className="toggle">
          <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} />
          Mirror
        </label>

        <label className="toggle">
          <input type="checkbox" checked={audioOn} onChange={(e) => setAudioOn(e.target.checked)} />
          Audio passthrough
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={micOn}
            onChange={(e) => setMicOn(e.target.checked)}
            disabled={!running}
          />
          Record mic
        </label>

        {micOn && (
          <label className="field">
            Mic source
            <select value={micDeviceId} onChange={(e) => setMicDeviceId(e.target.value)}>
              <option value="">Default (built-in mic)</option>
              {audioDevices
                .filter((d) => d.deviceId && d.deviceId !== audioDeviceId)
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
            </select>
          </label>
        )}

        <label className="toggle">
          <input
            type="checkbox"
            checked={pipOn}
            onChange={(e) => setPipOn(e.target.checked)}
            disabled={!running}
          />
          Webcam (PiP)
        </label>

        {pipOn && (
          <label className="field">
            Webcam source
            <select value={pipDeviceId} onChange={(e) => setPipDeviceId(e.target.value)}>
              <option value="">Default (built-in webcam)</option>
              {videoDevices
                .filter((d) => d.deviceId && d.deviceId !== videoDeviceId)
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
            </select>
          </label>
        )}

        <div className="popover-wrap">
          <button
            className={adjustmentsActive ? 'has-adjust' : ''}
            onClick={() => setImgPanelOpen((o) => !o)}
            disabled={!running}
          >
            Image{adjustmentsActive ? ' •' : ''}
          </button>
          {imgPanelOpen && (
            <div className="popover">
              <div className="popover-row">
                <label>
                  Brightness <span>{brightness.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                />
              </div>
              <div className="popover-row">
                <label>
                  Contrast <span>{contrast.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                />
              </div>
              <div className="popover-row">
                <label>
                  Saturation <span>{saturation.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={saturation}
                  onChange={(e) => setSaturation(Number(e.target.value))}
                />
              </div>
              <div className="popover-actions">
                <button
                  onClick={() => {
                    // Common compensation for washed-out MJPEG capture cards.
                    setBrightness(0.95);
                    setContrast(1.18);
                    setSaturation(1.25);
                  }}
                >
                  MJPEG fix
                </button>
                <button
                  onClick={() => {
                    setBrightness(1);
                    setContrast(1);
                    setSaturation(1);
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        <span className="grow" />

        <button onClick={takeScreenshot} disabled={!running}>
          Screenshot
        </button>
        {!recording ? (
          <button onClick={startRecording} disabled={!running}>
            ● Record
          </button>
        ) : (
          <button className="recording" onClick={stopRecording}>
            ■ Stop recording
          </button>
        )}
        <button onClick={toggleFullscreen} disabled={!running}>
          {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        {hasAccess && (
          running ? (
            <button onClick={stopStreams} title="Release camera and microphone">
              Stop
            </button>
          ) : (
            <button className="primary" onClick={start} title="Resume streaming">
              Resume
            </button>
          )
        )}
      </footer>
    </div>
  );
}
