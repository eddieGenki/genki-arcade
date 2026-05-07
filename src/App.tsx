import { useCallback, useEffect, useRef, useState } from 'react';
import logoUrl from './assets/genki-logo.png';
import sc3CableUrl from './assets/sc3-cable.jpg';
import { Icon } from './icons';
import { pickLanguage, useTranslation } from './i18n';

type DeviceInfo = { deviceId: string; label: string };

const SHADOWCAST_HINTS = ['shadowcast', 'shadow cast', 'genki'];
const SHADOWCAST3_HINT = /shadowcast\s*3/i;
const SHOPIFY_SHADOWCAST3_URL = 'https://www.genkithings.com/products/shadowcast-3-pro';

function isGenkiDevice(label: string | undefined): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return SHADOWCAST_HINTS.some((h) => l.includes(h));
}

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

const RESOLUTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '3840x2160', label: '4K UHD (3840×2160)' },
  { value: '2560x1440', label: '1440p (2560×1440)' },
  { value: '1920x1080', label: '1080p (1920×1080)' },
  { value: '1280x720', label: '720p (1280×720)' },
];

const FPS_OPTIONS = [120, 60, 30];

export default function App() {
  const t = useTranslation(pickLanguage());

  // ---- DOM refs ------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // ---- Devices -------------------------------------------------------------
  const [videoDevices, setVideoDevices] = useState<DeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<DeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([]);

  const [videoDeviceId, setVideoDeviceId] = useState<string>('');
  const [audioDeviceId, setAudioDeviceId] = useState<string>('');
  const [outputDeviceId, setOutputDeviceId] = useState<string>('default');

  // ---- Capture settings ----------------------------------------------------
  const [resolution, setResolution] = useState<string>('1920x1080');
  const [fps, setFps] = useState<number>(60);
  const [mirrored, setMirrored] = useState<boolean>(false);
  const [audioOn, setAudioOn] = useState<boolean>(true);

  // ---- Mic ---------------------------------------------------------------
  const [micOn, setMicOn] = useState<boolean>(false);
  const [micDeviceId, setMicDeviceId] = useState<string>('');
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // ---- Session state ------------------------------------------------------
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [actualSettings, setActualSettings] = useState<MediaTrackSettings | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean>(false);

  // ---- Recording ----------------------------------------------------------
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingRafRef = useRef<number>(0);
  const [recording, setRecording] = useState<boolean>(false);
  const [recElapsed, setRecElapsed] = useState<number>(0);

  // ---- Other UI -----------------------------------------------------------
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [tooltip, setTooltip] = useState<{ label: string; cx: number; ty: number } | null>(null);

  // ShadowCast 3 upsell — dismiss persists in localStorage.
  const [upsellDismissed, setUpsellDismissedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('arcadeUpsellDismissed') === 'true';
    } catch {
      return false;
    }
  });
  const dismissUpsell = useCallback(() => {
    setUpsellDismissedState(true);
    try {
      localStorage.setItem('arcadeUpsellDismissed', 'true');
    } catch {
      /* ignore */
    }
  }, []);

  // ---- Image adjustments (state only — UI hidden in this design pass) -----
  // Preserved so the canvas pipeline still receives them. We can re-introduce
  // the popover later as a settings entry.
  const [brightness] = useState<number>(1);
  const [contrast] = useState<number>(1);
  const [saturation] = useState<number>(1);
  const filterCss = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
  const adjustmentsActive = brightness !== 1 || contrast !== 1 || saturation !== 1;

  // ---- PiP ----------------------------------------------------------------
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const pipStreamRef = useRef<MediaStream | null>(null);
  const [pipOn, setPipOn] = useState<boolean>(false);
  const [pipDeviceId] = useState<string>(''); // default: built-in webcam
  const [pipMirrored, setPipMirrored] = useState<boolean>(true);
  const [pipPos, setPipPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const [pipSize] = useState<{ w: number; h: number }>({ w: 200, h: 150 });

  // Live snapshot of visual settings, read by the recording RAF loop so
  // mid-recording toggles take effect without restarting the recorder.
  const captureSettingsRef = useRef({
    mirrored: false,
    pipOn: false,
    pipMirrored: true,
    adjustmentsActive: false,
    filterCss: 'none',
  });

  // -------------------------------------------------------------------------
  // Device enumeration
  // -------------------------------------------------------------------------
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
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, [refreshDevices]);

  // Skip the manual Start button if permission was already granted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('permissions' in navigator)) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cam = await (navigator as any).permissions.query({ name: 'camera' });
        if (!cancelled && cam.state === 'granted') {
          requestInitialPermission();
        }
      } catch {
        /* Firefox doesn't support 'camera' — fine, user clicks Start. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestInitialPermission]);

  // -------------------------------------------------------------------------
  // Stream lifecycle
  // -------------------------------------------------------------------------
  const stopStreams = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      cancelAnimationFrame(recordingRafRef.current);
      recordingRafRef.current = 0;
      recorderRef.current.stop();
      recorderRef.current = null;
      setRecording(false);
      setRecElapsed(0);
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
        await videoRef.current.play().catch(() => {});
      }

      const vTrack = videoStream.getVideoTracks()[0];
      setActualSettings(vTrack.getSettings());

      // Audio graph: always-on so mic + game audio can mix into one stream.
      const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
      audioCtxRef.current = ctx;
      const mixDest = ctx.createMediaStreamDestination();
      mixDestRef.current = mixDest;

      if (audioOn) {
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        src.connect(ctx.destination);
        src.connect(mixDest);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (outputDeviceId && outputDeviceId !== 'default' && (ctx as any).setSinkId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Auto-start when access available; restart on source changes.
  useEffect(() => {
    if (!hasAccess) return;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, videoDeviceId, audioDeviceId, audioOn]);

  // Mic capture (recorded into the mix, not monitored through speakers).
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
        src.connect(mixDestRef.current);
      } catch (e) {
        setError(`Mic failed: ${(e as Error).message}`);
        setMicOn(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [micOn, micDeviceId, running]);

  // Re-apply video constraints on the fly when resolution / fps change.
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

  // Sync capture settings ref for recording loop.
  useEffect(() => {
    captureSettingsRef.current = {
      mirrored,
      pipOn,
      pipMirrored,
      adjustmentsActive,
      filterCss,
    };
  });

  // -------------------------------------------------------------------------
  // PiP webcam stream
  // -------------------------------------------------------------------------
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
            ? {
                deviceId: { exact: pipDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
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

  const onPipMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
  }, []);

  // -------------------------------------------------------------------------
  // Composite drawing (screenshot + recording)
  // -------------------------------------------------------------------------
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

    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

    ctx.save();
    ctx.filter = aFlag ? fCss : 'none';
    if (mFlag) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

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

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------
  const pickMimeType = (): string | undefined => {
    const candidates = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
    }
    return undefined;
  };

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canvasStream = (canvas as any).captureStream(fps) as MediaStream;
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    const mixStream = mixDestRef.current?.stream;
    if (mixStream) tracks.push(...mixStream.getAudioTracks());
    const combined = new MediaStream(tracks);

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: 20_000_000,
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

    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    setRecElapsed(0);
  }, [fps, drawComposite]);

  const stopRecording = useCallback(() => {
    cancelAnimationFrame(recordingRafRef.current);
    recordingRafRef.current = 0;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    setRecElapsed(0);
  }, []);

  // Recording timer
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecElapsed((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // -------------------------------------------------------------------------
  // Fullscreen
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Settings popover — close on outside click
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!settingsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [settingsOpen]);

  // -------------------------------------------------------------------------
  // Tooltip on icon hover
  // -------------------------------------------------------------------------
  const onIconEnter = useCallback(
    (label: string) => (e: React.MouseEvent | React.FocusEvent) => {
      const target = e.currentTarget as HTMLElement;
      const r = target.getBoundingClientRect();
      const containerRect = target.closest('.arc-app')?.getBoundingClientRect();
      if (!containerRect) return;
      setTooltip({
        label,
        cx: r.left + r.width / 2 - containerRect.left,
        ty: r.top - containerRect.top,
      });
    },
    [],
  );
  const onIconLeave = useCallback(() => setTooltip(null), []);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  const settingsLabel = actualSettings
    ? `${actualSettings.width ?? '?'}×${actualSettings.height ?? '?'} @ ${
        actualSettings.frameRate ? Math.round(actualSettings.frameRate) : '?'
      }fps`
    : '—';

  const activeVideoLabel =
    videoDevices.find((d) => d.deviceId === videoDeviceId)?.label || '';
  const activeAudioLabel =
    audioDevices.find((d) => d.deviceId === audioDeviceId)?.label || '';
  const labelsKnown = videoDevices.some((d) => d.deviceId && d.label);
  const isShadowcastActive =
    isGenkiDevice(activeVideoLabel) || isGenkiDevice(activeAudioLabel);
  const isShadowcast3 =
    SHADOWCAST3_HINT.test(activeVideoLabel) || SHADOWCAST3_HINT.test(activeAudioLabel);
  const showUpsell = !upsellDismissed && (!labelsKnown || !isShadowcast3);

  const resolutionLabel =
    RESOLUTION_OPTIONS.find((o) => o.value === resolution)?.label || resolution;
  const resolutionShort = resolutionLabel.split(' ')[0];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="arc-app arc-theme-standard">
      {/* TOPBAR */}
      <header className="arc-topbar">
        <div className="arc-brand">
          <img className="arc-brand-logo" src={logoUrl} alt="Genki" />
          <div className="arc-brand-divider" aria-hidden />
          <span className="arc-brand-title">{t.arcade}</span>
        </div>

        <div className="arc-status">
          {!running && (
            <span className="arc-pill arc-pill-muted">
              <span className="arc-dot arc-dot-muted" />
              {t.idle}
            </span>
          )}
          {running && !recording && (
            <span className="arc-pill arc-pill-live">
              <span className="arc-dot arc-dot-live" />
              {t.live}
              <span className="arc-pill-meta">· {settingsLabel}</span>
            </span>
          )}
          {running && recording && (
            <span className="arc-pill arc-pill-rec">
              <span className="arc-rec-blip" />
              {t.rec}
              <span className="arc-rec-time">{fmtTime(recElapsed)}</span>
            </span>
          )}
        </div>

        <div className="arc-spacer" />

        {error && <span className="arc-error">{error}</span>}

        {!error && labelsKnown && isShadowcastActive && (
          <span className="arc-promo arc-promo-good" title={activeVideoLabel}>
            <Icon name="check" size={12} />
            {t.shadowcastConnected}
          </span>
        )}

        {running && (
          <button className="arc-end" onClick={stopStreams} type="button">
            <Icon name="close" size={14} />
            <span>{t.end}</span>
          </button>
        )}

        <a
          className="arc-shoplink"
          href="https://www.genkithings.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{t.shopLink}</span>
          <Icon name="arrow" size={12} />
        </a>
      </header>

      {/* STAGE */}
      <main className="arc-stage" ref={stageRef as React.RefObject<HTMLElement>}>
        {!hasAccess && (
          <IdleHero
            t={t}
            onStart={requestInitialPermission}
            showUpsell={showUpsell}
            onDismissUpsell={dismissUpsell}
            label={t.start}
          />
        )}
        {hasAccess && !running && (
          <IdleHero
            t={t}
            onStart={start}
            showUpsell={showUpsell}
            onDismissUpsell={dismissUpsell}
            label={t.resume}
          />
        )}

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`arc-video ${mirrored ? 'is-mirrored' : ''}`}
          style={{
            display: running ? 'block' : 'none',
            filter: adjustmentsActive ? filterCss : undefined,
          }}
        />

        {/* Live overlay pill */}
        {running && (
          <div className="arc-stage-overlay">
            <div className="arc-overlay-pill">
              {activeVideoLabel || 'Capture device'}
              <span className="arc-overlay-sep">·</span>
              {resolutionShort}
              <span className="arc-overlay-sep">·</span>
              {fps} fps
            </div>
          </div>
        )}

        {/* PiP webcam overlay */}
        {pipOn && running && (
          <div
            className="arc-pip"
            onMouseDown={onPipMouseDown}
            style={{
              width: pipSize.w,
              height: pipSize.h,
              ...(pipPos.x < 0
                ? { right: 24, bottom: 24 }
                : { left: pipPos.x, top: pipPos.y }),
            }}
          >
            <video
              ref={pipVideoRef}
              autoPlay
              muted
              playsInline
              className={`arc-pip-cam ${pipMirrored ? 'is-mirrored' : ''}`}
            />
            <div className="arc-pip-toolbar">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPipMirrored((m) => !m);
                }}
                title="Mirror webcam"
                type="button"
              >
                <Icon name="mirror" size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPipOn(false);
                }}
                title="Close webcam"
                type="button"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* DOCK */}
      <footer className="arc-dock">
        <div className="arc-tools">
          {/* Settings popover trigger */}
          <div className="arc-settings-wrap" ref={settingsRef}>
            <ToolBtn
              icon="settings"
              label={t.settings}
              active={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}
              onTooltipEnter={onIconEnter}
              onTooltipLeave={onIconLeave}
            />
            {settingsOpen && (
              <div className="arc-settings-popover">
                <div className="arc-settings-head">
                  <span className="arc-eyebrow">{t.settings}</span>
                </div>
                <div className="arc-settings-grid">
                  <SettingRow label={t.videoDevice}>
                    <select
                      value={videoDeviceId}
                      onChange={(e) => setVideoDeviceId(e.target.value)}
                    >
                      <option value="">Default (browser picks)</option>
                      {videoDevices
                        .filter((d) => d.deviceId)
                        .map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label}
                          </option>
                        ))}
                    </select>
                  </SettingRow>
                  <SettingRow label={t.audioInput}>
                    <select
                      value={audioDeviceId}
                      onChange={(e) => setAudioDeviceId(e.target.value)}
                    >
                      <option value="">Default (browser picks)</option>
                      {audioDevices
                        .filter((d) => d.deviceId)
                        .map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label}
                          </option>
                        ))}
                    </select>
                  </SettingRow>
                  <SettingRow label={t.audioOutput}>
                    <select
                      value={outputDeviceId}
                      onChange={(e) => setOutputDeviceId(e.target.value)}
                    >
                      <option value="default">System default</option>
                      {outputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label={t.resolution}>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                    >
                      {RESOLUTION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label={t.frameRate}>
                    <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                      {FPS_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f} fps
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  {micOn && (
                    <SettingRow label={t.micSource}>
                      <select
                        value={micDeviceId}
                        onChange={(e) => setMicDeviceId(e.target.value)}
                      >
                        <option value="">Default (built-in mic)</option>
                        {audioDevices
                          .filter((d) => d.deviceId && d.deviceId !== audioDeviceId)
                          .map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label}
                            </option>
                          ))}
                      </select>
                    </SettingRow>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="arc-tools-divider" />

          {/* Modifiers */}
          <ToolBtn
            icon="audio"
            label={t.audioPassthrough}
            active={audioOn}
            onClick={() => setAudioOn((v) => !v)}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
          <ToolBtn
            icon="mic"
            label={t.recordMic}
            active={micOn}
            onClick={() => setMicOn((v) => !v)}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
          <ToolBtn
            icon="webcam"
            label={t.webcamPip}
            active={pipOn}
            onClick={() => setPipOn((v) => !v)}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
          <ToolBtn
            icon="mirror"
            label={t.mirror}
            active={mirrored}
            onClick={() => setMirrored((v) => !v)}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />

          <div className="arc-tools-divider" />

          {/* Actions */}
          <ToolBtn
            icon="snapshot"
            label={t.snapshot}
            onClick={takeScreenshot}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
          <button
            className={`arc-rec-btn ${recording ? 'is-recording' : ''}`}
            onMouseEnter={onIconEnter(recording ? t.stop : t.record)}
            onMouseLeave={onIconLeave}
            onFocus={onIconEnter(recording ? t.stop : t.record)}
            onBlur={onIconLeave}
            onClick={() => {
              onIconLeave();
              if (recording) stopRecording();
              else startRecording();
            }}
            disabled={!running}
            aria-label={recording ? t.stop : t.record}
            type="button"
          >
            {recording ? <Icon name="stop" size={14} /> : <Icon name="record" size={16} />}
            <span>{recording ? fmtTime(recElapsed) : t.rec}</span>
          </button>
          <ToolBtn
            icon="fullscreen"
            label={isFullscreen ? `Exit ${t.fullscreen.toLowerCase()}` : t.fullscreen}
            onClick={toggleFullscreen}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
        </div>
      </footer>

      {/* Tooltip layer */}
      {tooltip && (
        <div
          className="arc-tooltip"
          style={{ left: tooltip.cx, top: tooltip.ty - 8 }}
          role="tooltip"
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Subcomponents
// =============================================================================

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="arc-setting-row">
      <span className="arc-setting-label">{label}</span>
      {children}
    </label>
  );
}

type ToolBtnProps = {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  active?: boolean;
  onClick?: () => void;
  onTooltipEnter?: (label: string) => (e: React.MouseEvent | React.FocusEvent) => void;
  onTooltipLeave?: () => void;
  disabled?: boolean;
};

// Top-level so React doesn't re-create the component type on every parent
// render. Defining it inside <App> caused the dock buttons to be unmounted
// and remounted on every state change, which could drop click events under
// certain hover/click race conditions.
function ToolBtn({
  icon,
  label,
  active,
  onClick,
  onTooltipEnter,
  onTooltipLeave,
  disabled,
}: ToolBtnProps) {
  const enterHandler = onTooltipEnter ? onTooltipEnter(label) : undefined;
  return (
    <button
      className={`arc-tool ${active ? 'is-active' : ''}`}
      onMouseEnter={enterHandler}
      onMouseLeave={onTooltipLeave}
      onFocus={enterHandler}
      onBlur={onTooltipLeave}
      onClick={() => {
        onTooltipLeave?.();
        onClick?.();
      }}
      disabled={disabled}
      aria-label={label}
      type="button"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function QuickStep({
  n,
  title,
  body,
  icon,
}: {
  n: string;
  title: string;
  body: string;
  icon: Parameters<typeof Icon>[0]['name'];
}) {
  return (
    <div className="arc-qs">
      <div className="arc-qs-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="arc-qs-num">{n}</div>
      <div className="arc-qs-title">{title}</div>
      <div className="arc-qs-body">{body}</div>
    </div>
  );
}

function UpsellCard({ t, onDismiss }: { t: ReturnType<typeof useTranslation>; onDismiss: () => void }) {
  return (
    <div className="arc-upsell">
      <div className="arc-upsell-img">
        <img src={sc3CableUrl} alt="ShadowCast 3" />
        <div className="arc-upsell-glow" />
      </div>
      <div className="arc-upsell-body">
        <div className="arc-upsell-eyebrow">
          <span className="arc-upsell-glyph">◆</span>
          <span>{t.upsellEyebrow}</span>
        </div>
        <div className="arc-upsell-title">{t.upsellTitle}</div>
        <div className="arc-upsell-sub">{t.upsellBody}</div>
      </div>
      <div className="arc-upsell-actions">
        <a
          className="arc-upsell-cta"
          href={SHOPIFY_SHADOWCAST3_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{t.upsellCta}</span>
          <Icon name="arrow" size={13} />
        </a>
      </div>
      <button
        className="arc-upsell-x"
        onClick={onDismiss}
        aria-label="Dismiss"
        type="button"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}

function IdleHero({
  t,
  onStart,
  showUpsell,
  onDismissUpsell,
  label,
}: {
  t: ReturnType<typeof useTranslation>;
  onStart: () => void;
  showUpsell: boolean;
  onDismissUpsell: () => void;
  label: string;
}) {
  return (
    <div className="arc-idle">
      <div className="arc-idle-inner">
        <div className="arc-eyebrow arc-idle-eyebrow">{t.heroEyebrow}</div>
        <h1 className="arc-idle-title">{t.heroTitle}</h1>
        <p className="arc-idle-sub">{t.heroSub}</p>
        <div className="arc-quickstart">
          <QuickStep n="01" title={t.qs1Title} body={t.qs1Body} icon="plug" />
          <QuickStep n="02" title={t.qs2Title} body={t.qs2Body} icon="shield" />
          <QuickStep n="03" title={t.qs3Title} body={t.qs3Body} icon="play" />
        </div>
        {showUpsell && <UpsellCard t={t} onDismiss={onDismissUpsell} />}
        <button className="arc-start" onClick={onStart} type="button">
          <Icon name="play" size={16} />
          <span>{label}</span>
        </button>
      </div>
    </div>
  );
}
