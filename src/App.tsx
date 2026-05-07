import { useCallback, useEffect, useRef, useState } from 'react';
import logoUrl from './assets/genki-logo.png';
import sc3CableUrl from './assets/sc3-cable.jpg';
import { Icon } from './icons';
import { pickLanguage, useTranslation } from './i18n';
import { NEWS_ITEMS, shuffled } from './news';
import { UpscaleCanvas } from './upscaler';

type DeviceInfo = { deviceId: string; label: string };

const SHADOWCAST_HINTS = ['shadowcast', 'shadow cast', 'genki'];
const SHADOWCAST3_HINT = /shadowcast\s*3/i;
const SHOPIFY_SHADOWCAST3_URL = 'https://www.genkithings.com/products/shadowcast-3-pro';

function isGenkiDevice(label: string | undefined): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return SHADOWCAST_HINTS.some((h) => l.includes(h));
}

// Heuristic: known virtual camera apps. Auto-pick should avoid these as the
// default Input 2 because they often "exist" without actively producing
// frames (e.g., Camo when phone is unplugged). User can still pick them
// explicitly via the Input 2 dropdown.
const VIRTUAL_CAM_RE =
  /\b(camo|reincubate|virtual cam(era)?|obs.*virtual|snap camera|nvidia broadcast|manycam|xsplit|ndi)\b/i;
function isVirtualCam(label: string | undefined): boolean {
  return !!label && VIRTUAL_CAM_RE.test(label);
}

function pickShadowcast(devices: DeviceInfo[]): DeviceInfo | undefined {
  return devices.find((d) =>
    SHADOWCAST_HINTS.some((h) => d.label.toLowerCase().includes(h)),
  );
}

// Predict whether a given resolution + framerate combo will be delivered
// uncompressed (YUY2/NV12, ~16 bits per pixel) or compressed in MJPG.
// Heuristic: if uncompressed bandwidth exceeds ~4 Gbps (the practical USB 3.0
// isochronous ceiling for a single capture card), the device almost always
// falls back to MJPG. Generic — works for any UVC capture card. Will be
// replaced with per-device lookup tables for known Genki devices once we
// validate against real ShadowCast hardware.
const USB3_PRACTICAL_BPS = 4_000_000_000;
function expectedFormat(w: number, h: number, fps: number): 'uncompressed' | 'mjpg' {
  const bps = w * h * fps * 16; // YUY2 = 16 bits/pixel
  return bps <= USB3_PRACTICAL_BPS ? 'uncompressed' : 'mjpg';
}

// Probe the actual decoded format of the live track via
// MediaStreamTrackProcessor (Chrome 94+). The browser doesn't expose the
// SOURCE format (YUY2 vs MJPG) directly — only the decoded VideoFrame
// format — but on macOS/Chrome the mapping is reliable enough to be
// useful: YUY2 source passes through as NV12, MJPG source decodes to
// I420. Returns null if the API isn't available or the probe fails, so
// callers fall back to the bandwidth prediction.
async function probeDecodedFormat(track: MediaStreamTrack): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Processor = (globalThis as any).MediaStreamTrackProcessor;
  if (!Processor) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reader: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processor: any = new Processor({ track });
    reader = processor.readable.getReader();
    const timeout = new Promise<{ value: undefined }>((resolve) =>
      setTimeout(() => resolve({ value: undefined }), 2000),
    );
    const result = await Promise.race([reader.read(), timeout]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frame: any = result.value;
    const format: string | null = frame?.format ?? null;
    frame?.close?.();
    return format;
  } catch {
    return null;
  } finally {
    try {
      reader?.cancel();
    } catch {
      /* ignore */
    }
  }
}

// Map a decoded-frame format string to our high-level 'uncompressed' /
// 'mjpg' bucket. Conservative — only maps the cases we're confident about.
function formatFromDecoded(decoded: string | null): 'uncompressed' | 'mjpg' | null {
  if (!decoded) return null;
  const f = decoded.toUpperCase();
  if (f.includes('NV12') || f.includes('YUY2') || f.includes('UYVY')) return 'uncompressed';
  if (f.includes('I420') || f.includes('YV12') || f.includes('YUV420')) return 'mjpg';
  return null;
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

// ChromaCast™ — Genki MJPG color correction. Compensates for the
// limited-range / desaturated look of MJPG-compressed capture. Applied as
// a CSS filter so it composes cleanly with the user's image adjustments.
// Tuned subtly here (about half the strength of the original 4K-upscaling
// branch's contrast(1.12) saturate(1.20)) — it's a gentle nudge, not a
// vivid-mode preset, since over-saturation has been a reported issue.
const CHROMACAST_FILTER = 'contrast(1.06) saturate(1.08)';

// Per-resolution upper bound on framerate that capture cards in 2026
// commonly deliver. 4K@120 needs HDMI 2.1 capture (rare); 1440p@120 is also
// edge-case. Conservative defaults — refine with per-device tables once we
// validate against real ShadowCast 3 hardware.
const MAX_FPS_BY_RESOLUTION: Record<string, number> = {
  '3840x2160': 60,
  '2560x1440': 120,
  '1920x1080': 120,
  '1280x720': 120,
};

export default function App() {
  const t = useTranslation(pickLanguage());

  // ---- DOM refs ------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
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
  const [upscaleOn, setUpscaleOn] = useState<boolean>(false);
  const [audioOn, setAudioOn] = useState<boolean>(true);
  // Monitoring volume — only affects what comes out of the speakers, not the
  // recorded mix (so a quiet headphone setting doesn't tank recording levels).
  const [volume, setVolume] = useState<number>(1);
  // ChromaCast preference is persistent across sessions. Default OFF —
  // users opt in if they want the MJPG-color-restore filter; this avoids
  // double-saturating displays that already render the raw output vivid.
  const [chromaCastEnabled, setChromaCastEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('arcadeChromaCast') === 'true';
    } catch {
      return false;
    }
  });
  const setChromaCastEnabled = useCallback((on: boolean) => {
    setChromaCastEnabledState(on);
    try {
      localStorage.setItem('arcadeChromaCast', String(on));
    } catch {
      /* ignore */
    }
  }, []);

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
  const [mainCapabilities, setMainCapabilities] = useState<MediaTrackCapabilities | null>(null);
  // Decoded VideoFrame format from MediaStreamTrackProcessor probe (e.g.
  // 'NV12', 'I420'). null when the API is unavailable or the probe hasn't
  // returned yet — in those cases we fall back to bandwidth prediction.
  const [decodedFormat, setDecodedFormat] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean>(false);

  // ---- Recording ----------------------------------------------------------
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // The upscaler exposes its WebGL canvas through this ref. drawComposite
  // reads from it instead of the raw <video> when upscaleOn is true so
  // recordings and screenshots capture the sharpened output.
  const upscaleCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const [pipDeviceId, setPipDeviceId] = useState<string>('');
  const [pipMirrored, setPipMirrored] = useState<boolean>(true);
  const [pipPos, setPipPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  // 16:9 default — matches the typical webcam stream (1280×720) so the PiP
  // box doesn't crop sides on screen or stretch in screenshots.
  const [pipSize, setPipSize] = useState<{ w: number; h: number }>({ w: 256, h: 144 });
  const [pipActualSettings, setPipActualSettings] =
    useState<MediaTrackSettings | null>(null);

  // Live snapshot of visual settings, read by the recording RAF loop so
  // mid-recording toggles take effect without restarting the recorder.
  const captureSettingsRef = useRef({
    mirrored: false,
    pipOn: false,
    pipMirrored: true,
    composedFilterActive: false,
    composedFilter: 'none',
    upscaleOn: false,
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

  // (Auto-start on page load was removed: even when permission is already
  // granted, the user must click Start/Resume each time. This avoids
  // grabbing camera/mic the moment the page loads.)

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
    monitorGainRef.current?.disconnect();
    monitorGainRef.current = null;
    micNodeRef.current?.disconnect();
    micNodeRef.current = null;
    mixDestRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    setActualSettings(null);
    setMainCapabilities(null);
    setDecodedFormat(null);
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
      // Probe what this device can actually deliver. We use this to filter
      // the resolution / fps dropdowns so users can't pick combos the
      // device doesn't support.
      setMainCapabilities(
        typeof vTrack.getCapabilities === 'function' ? vTrack.getCapabilities() : null,
      );
      // Async probe of decoded frame format. Non-blocking — the indicator
      // shows the bandwidth prediction until this resolves. No-op on browsers
      // that don't implement MediaStreamTrackProcessor.
      setDecodedFormat(null);
      probeDecodedFormat(vTrack).then(setDecodedFormat);

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
        // Monitor path goes through a gain node so the volume slider only
        // affects speaker output. Recording mix taps the source directly so
        // the recorded file stays at full level regardless of monitor volume.
        const monitorGain = ctx.createGain();
        monitorGain.gain.value = volumeRef.current;
        monitorGainRef.current = monitorGain;
        src.connect(monitorGain);
        monitorGain.connect(ctx.destination);
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

  // Live volume control — slide updates the gain node without restarting
  // the audio graph. Smooth ramp avoids a click on rapid drags. The ref
  // mirror lets `start()` initialize the gain at the current slider value
  // even though `volume` isn't in its dep list (avoiding restarts on drag).
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
    const gain = monitorGainRef.current;
    const ctx = audioCtxRef.current;
    if (!gain || !ctx) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.015);
  }, [volume]);

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
      composedFilterActive,
      composedFilter,
      upscaleOn,
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
      setPipActualSettings(null);
      if (pipVideoRef.current) pipVideoRef.current.srcObject = null;
      return;
    }
    (async () => {
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
      const acquire = async () => navigator.mediaDevices.getUserMedia(constraints);
      let stream: MediaStream;
      try {
        stream = await acquire();
      } catch (e1) {
        // Retry once after a short delay. Most failures during a Swap are a
        // transient race where the formerly-main camera is still releasing
        // while we try to grab it for PiP. A 500ms gap is plenty.
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 500));
        if (cancelled) return;
        try {
          stream = await acquire();
        } catch (e2) {
          setError(`Webcam failed: ${(e2 as Error).message}`);
          // Deliberately do NOT setPipOn(false) — keep the PiP toggle on so
          // the user can pick a different device or retry. Killing the
          // toggle makes Swap appear to "delete" PiP on transient failures.
          return;
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      pipStreamRef.current?.getTracks().forEach((t) => t.stop());
      pipStreamRef.current = stream;
      const pipTrack = stream.getVideoTracks()[0];
      setPipActualSettings(pipTrack ? pipTrack.getSettings() : null);
      if (pipVideoRef.current) {
        pipVideoRef.current.srcObject = stream;
        pipVideoRef.current.play().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipOn, pipDeviceId]);

  // Rebind the PiP stream when the <video> element is recreated. The PiP
  // markup lives behind `pipOn && running`, so when `start()` toggles
  // running false→true (every device swap goes through stopStreams), the
  // element unmounts and React clears `pipVideoRef.current`. The stream
  // itself survives in `pipStreamRef`, but its srcObject binding does not —
  // without this effect the PiP stays black after a Swap.
  useEffect(() => {
    if (!pipOn || !running) return;
    const vid = pipVideoRef.current;
    const stream = pipStreamRef.current;
    if (!vid || !stream) return;
    if (vid.srcObject !== stream) {
      vid.srcObject = stream;
      vid.play().catch(() => {});
    }
  }, [pipOn, running]);

  // When PiP turns on, prefer a *physical* camera that isn't the main input.
  // If none exists (only one camera, or only virtual alternatives) we leave
  // pipDeviceId empty so the browser picks its default — Chrome multiplexes
  // a single camera between two getUserMedia calls, so it still works.
  useEffect(() => {
    if (!pipOn) return;
    if (pipDeviceId) return; // user (or earlier auto-pick) already chose
    const physicalDifferent = videoDevices.find(
      (d) => d.deviceId && d.deviceId !== videoDeviceId && !isVirtualCam(d.label),
    );
    if (physicalDifferent) setPipDeviceId(physicalDifferent.deviceId);
  }, [pipOn, pipDeviceId, videoDeviceId, videoDevices]);

  // Swap the device IDs for Input 1 (main) and Input 2 (PiP). The existing
  // capture and PiP effects re-acquire each stream automatically when the
  // deviceIds change, so no separate stream remap is needed.
  //
  // pipDeviceId may be empty (browser-default), so we resolve the *actual*
  // device the PiP track is bound to at swap time — that way Swap works even
  // if the user never explicitly picked an Input 2 device.
  const swapInputs = useCallback(() => {
    if (!pipOn) return;
    const pipActualId =
      pipStreamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
    const targetForMain = pipDeviceId || pipActualId;
    if (!targetForMain) return;
    const targetForPip = videoDeviceId;
    setVideoDeviceId(targetForMain);
    setPipDeviceId(targetForPip);
  }, [pipOn, pipDeviceId, videoDeviceId]);

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

  // Resize from the bottom-right corner. Aspect ratio is preserved (matches
  // the source webcam, 16:9 by default) so we never reintroduce the canvas
  // stretch bug. Min/max constrained to keep the box usable.
  const onPipResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const stage = stageRef.current;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      const startX = e.clientX;
      const startW = pipSize.w;
      const startH = pipSize.h;
      const aspect = startW / startH;
      // If PiP is anchored to bottom-right (pipPos.x < 0), keep that anchor;
      // otherwise the user has dragged it and we resize from top-left.
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const minW = 120;
        const maxW = Math.min(stageRect.width - 24, 960);
        const newW = Math.max(minW, Math.min(maxW, startW + dx));
        const newH = newW / aspect;
        setPipSize({ w: newW, h: newH });
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [pipSize.w, pipSize.h],
  );

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
      composedFilterActive: aFlag,
      composedFilter: fCss,
      upscaleOn: uFlag,
    } = captureSettingsRef.current;

    // When upscaling is on, capture from the WebGL canvas the user is
    // actually watching (sharpened, 2× source). Falls back to the raw
    // <video> if the upscale canvas isn't ready yet.
    const upscaleCanvas = upscaleCanvasRef.current;
    const useUpscale = uFlag && upscaleCanvas && upscaleCanvas.width > 0;
    const srcW = useUpscale ? upscaleCanvas.width : video.videoWidth;
    const srcH = useUpscale ? upscaleCanvas.height : video.videoHeight;

    if (canvas.width !== srcW) canvas.width = srcW;
    if (canvas.height !== srcH) canvas.height = srcH;

    ctx.save();
    ctx.filter = aFlag ? fCss : 'none';
    if (mFlag) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(useUpscale ? upscaleCanvas : video, 0, 0, canvas.width, canvas.height);
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
        const scaleX = canvas.width / disp.w;
        const scaleY = canvas.height / disp.h;
        const cx = (pipRect.left - stageRect.left - disp.x) * scaleX;
        const cy = (pipRect.top - stageRect.top - disp.y) * scaleY;
        const cw = pipRect.width * scaleX;
        const ch = pipRect.height * scaleY;
        // Mimic CSS object-fit: cover — the on-screen <video> crops the
        // source to fill the box; the canvas needs the same source-rect crop
        // or the image gets stretched (e.g. 16:9 webcam into a 4:3 box).
        const srcAspect = pipVid.videoWidth / pipVid.videoHeight;
        const dstAspect = cw / ch;
        let srcX = 0, srcY = 0;
        let srcW = pipVid.videoWidth;
        let srcH = pipVid.videoHeight;
        if (srcAspect > dstAspect) {
          srcW = pipVid.videoHeight * dstAspect;
          srcX = (pipVid.videoWidth - srcW) / 2;
        } else if (srcAspect < dstAspect) {
          srcH = pipVid.videoWidth / dstAspect;
          srcY = (pipVid.videoHeight - srcH) / 2;
        }
        ctx.save();
        ctx.filter = 'none';
        if (pmFlag) {
          ctx.translate(cx + cw, cy);
          ctx.scale(-1, 1);
          ctx.drawImage(pipVid, srcX, srcY, srcW, srcH, 0, 0, cw, ch);
        } else {
          ctx.drawImage(pipVid, srcX, srcY, srcW, srcH, cx, cy, cw, ch);
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

  const activeVideoLabel =
    videoDevices.find((d) => d.deviceId === videoDeviceId)?.label || '';
  const activeAudioLabel =
    audioDevices.find((d) => d.deviceId === audioDeviceId)?.label || '';
  const labelsKnown = videoDevices.some((d) => d.deviceId && d.label);
  const isShadowcastActive =
    isGenkiDevice(activeVideoLabel) || isGenkiDevice(activeAudioLabel);

  // 4K upscaling is locked behind ShadowCast detection. If the active main
  // input changes to a non-Genki device while upscaling is on, turn it off.
  useEffect(() => {
    if (upscaleOn && !isShadowcastActive) setUpscaleOn(false);
  }, [upscaleOn, isShadowcastActive]);
  const isShadowcast3 =
    SHADOWCAST3_HINT.test(activeVideoLabel) || SHADOWCAST3_HINT.test(activeAudioLabel);
  const showUpsell = !upsellDismissed && (!labelsKnown || !isShadowcast3);

  // Real (negotiated) resolution + fps from the live track. Fall back to the
  // requested values until the track reports settings.
  const actualW = actualSettings?.width ?? Number(resolution.split('x')[0]);
  const actualH = actualSettings?.height ?? Number(resolution.split('x')[1]);
  const actualFps = actualSettings?.frameRate
    ? Math.round(actualSettings.frameRate)
    : fps;
  const resolutionShort = (() => {
    if (actualW >= 3840 || actualH >= 2160) return '4K';
    if (actualH >= 1440) return '1440p';
    if (actualH >= 1080) return '1080p';
    if (actualH >= 720) return '720p';
    if (actualH >= 480) return '480p';
    return `${actualW}×${actualH}`;
  })();

  // Format detection. Prefer the live VideoFrame probe (authoritative), else
  // fall back to bandwidth prediction. The probe is async and may take a
  // moment to land — until then the prediction is shown.
  const [reqW, reqH] = resolution.split('x').map(Number);
  const probedFormat = formatFromDecoded(decodedFormat);
  const currentFormat: 'uncompressed' | 'mjpg' =
    probedFormat ?? expectedFormat(actualW, actualH, actualFps);
  const formatIsProbed = probedFormat !== null;

  // ChromaCast™ — gated to ShadowCast 3 specifically AND only meaningful in
  // MJPG mode (the filter compensates for MJPG's color penalty; on
  // uncompressed pixels it just oversaturates). Preference is preserved
  // across device swaps and format changes; the filter just doesn't apply
  // unless both conditions are met.
  const chromaCastActive =
    chromaCastEnabled && isShadowcast3 && currentFormat === 'mjpg';
  // Composed filter chain — image adjustments (currently UI-hidden but the
  // state machine still feeds them in) plus ChromaCast when active.
  const composedFilter =
    [
      adjustmentsActive ? filterCss : '',
      chromaCastActive ? CHROMACAST_FILTER : '',
    ]
      .filter(Boolean)
      .join(' ') || 'none';
  const composedFilterActive = adjustmentsActive || chromaCastActive;

  // Helpers to filter dropdowns to what the *current* main device actually
  // supports. Devices report `width.max`, `height.max`, `frameRate.max` via
  // getCapabilities(). When capabilities are unknown (idle state, or browser
  // doesn't implement the API), we fall back to showing all options.
  const supportsResolution = (w: number, h: number) => {
    if (!mainCapabilities) return true;
    const maxW = mainCapabilities.width?.max ?? Infinity;
    const maxH = mainCapabilities.height?.max ?? Infinity;
    return w <= maxW && h <= maxH;
  };
  const supportsFps = (f: number) => {
    // Hard cap from the device itself (e.g., FaceTime camera reports 30 max)
    if (mainCapabilities) {
      const maxFps = mainCapabilities.frameRate?.max ?? Infinity;
      if (f > maxFps) return false;
    }
    // Resolution-specific cap — capture cards top out per resolution bucket
    // regardless of device max. e.g., 4K is generally 60fps max.
    const resCap = MAX_FPS_BY_RESOLUTION[resolution] ?? Infinity;
    if (f > resCap) return false;
    return true;
  };

  // If the user changes to a less-capable device, or bumps resolution into
  // a tier that disallows the current fps (e.g., went from 1080p@120 to 4K),
  // gracefully drop to a supported combo instead of letting the browser
  // silently negotiate down or letting the dropdown show a stale value.
  useEffect(() => {
    if (!supportsResolution(reqW, reqH)) {
      const fallback = RESOLUTION_OPTIONS.find((o) => {
        const [w, h] = o.value.split('x').map(Number);
        return supportsResolution(w, h);
      });
      if (fallback) {
        setResolution(fallback.value);
        return; // let the resolution change re-trigger this effect for fps
      }
    }
    if (!supportsFps(fps)) {
      const fallback = FPS_OPTIONS.find((f) => supportsFps(f));
      if (fallback) setFps(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainCapabilities, resolution]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="arc-app arc-theme-standard">
      {/* TOPBAR */}
      <header className="arc-topbar">
        <a
          className="arc-brand"
          href="https://www.genkithings.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Genki"
        >
          <img className="arc-brand-logo" src={logoUrl} alt="Genki" />
          <div className="arc-brand-divider" aria-hidden />
          <span className="arc-brand-title">{t.arcade}</span>
        </a>

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
              {activeVideoLabel && (
                <span className="arc-pill-meta">
                  · {activeVideoLabel} · {resolutionShort} · {actualFps} fps
                </span>
              )}
            </span>
          )}
          {running && recording && (
            <span className="arc-pill arc-pill-rec">
              <span className="arc-rec-blip" />
              {t.rec}
              <span className="arc-rec-time">{fmtTime(recElapsed)}</span>
              {activeVideoLabel && (
                <span className="arc-pill-meta">
                  · {activeVideoLabel} · {resolutionShort} · {actualFps} fps
                </span>
              )}
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

        {/* Session button: Start when no permission, Resume when paused, End when live. */}
        {!hasAccess && (
          <button className="arc-session" onClick={requestInitialPermission} type="button">
            <Icon name="play" size={14} />
            <span>{t.start}</span>
          </button>
        )}
        {hasAccess && !running && (
          <button className="arc-session" onClick={start} type="button">
            <Icon name="play" size={14} />
            <span>{t.resume}</span>
          </button>
        )}
        {running && (
          <button className="arc-session is-end" onClick={stopStreams} type="button">
            <Icon name="close" size={14} />
            <span>{t.end}</span>
          </button>
        )}
      </header>

      {/* STAGE */}
      <main className="arc-stage" ref={stageRef as React.RefObject<HTMLElement>}>
        {!running && (
          <IdleHero t={t} showUpsell={showUpsell} onDismissUpsell={dismissUpsell} />
        )}

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`arc-video ${mirrored ? 'is-mirrored' : ''}`}
          style={{
            // Hide the raw <video> when upscaling is on — the WebGL canvas
            // renders an enhanced version on top. The element stays mounted
            // so its srcObject keeps producing frames the upscaler can read.
            display: running && !upscaleOn ? 'block' : 'none',
            filter: composedFilterActive ? composedFilter : undefined,
          }}
        />

        {running && upscaleOn && (
          <UpscaleCanvas
            videoRef={videoRef}
            canvasRef={upscaleCanvasRef}
            className={`arc-video ${mirrored ? 'is-mirrored' : ''}`}
            style={{
              display: 'block',
              filter: composedFilterActive ? composedFilter : undefined,
            }}
          />
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
            <div
              className="arc-pip-resize"
              onMouseDown={onPipResizeMouseDown}
              title="Drag to resize"
              aria-label="Resize webcam"
            />
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

                {/* Input 1 — Main */}
                <div className="arc-settings-section">
                  <div className="arc-settings-section-title">Input 1 — Main</div>
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
                    <SettingRow label={t.resolution}>
                      <select
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                      >
                        {RESOLUTION_OPTIONS.filter((o) => {
                          const [w, h] = o.value.split('x').map(Number);
                          return supportsResolution(w, h);
                        }).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </SettingRow>
                    <SettingRow label={t.frameRate}>
                      <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                        {FPS_OPTIONS.filter(supportsFps).map((f) => (
                          <option key={f} value={f}>
                            {f} fps
                          </option>
                        ))}
                      </select>
                    </SettingRow>
                    <div
                      className={`arc-format-row arc-format-${currentFormat}`}
                      title={
                        formatIsProbed
                          ? `Detected from the live video frames: decoded format ${decodedFormat}. ${
                              currentFormat === 'mjpg'
                                ? 'I420-class decode strongly implies an MJPG source — the device compressed the feed before sending it.'
                                : 'NV12-class decode means the device sent raw YUY2 pixels with full color fidelity.'
                            }`
                          : currentFormat === 'mjpg'
                            ? 'Predicted (live probe unavailable). This combo exceeds USB 3.0 uncompressed bandwidth, so the capture card likely encodes to MJPG.'
                            : 'Predicted (live probe unavailable). Bandwidth fits USB 3.0 uncompressed, so the capture card likely sends raw YUY2/NV12.'
                      }
                    >
                      <span className="arc-format-mark">
                        {currentFormat === 'mjpg' ? '▲' : '●'}
                      </span>
                      <span>
                        {currentFormat === 'mjpg' ? 'Compressed (MJPG)' : 'Uncompressed'}
                        {!formatIsProbed && (
                          <span className="arc-format-sub"> — predicted</span>
                        )}
                      </span>
                    </div>

                    {/* ChromaCast™ — only shown when the current combo is
                        actually MJPG (the filter is a no-op on uncompressed
                        and would only oversaturate). Selectable only with a
                        ShadowCast 3 active; otherwise the row is dimmed and
                        the checkbox disabled, so non-Genki users can still
                        see the feature exists. Preference is persisted. */}
                    {currentFormat === 'mjpg' && (
                      <label
                        className={`arc-chromacast-row ${
                          !isShadowcast3 ? 'is-locked' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={chromaCastEnabled}
                          onChange={(e) => setChromaCastEnabled(e.target.checked)}
                          disabled={!isShadowcast3}
                        />
                        <span className="arc-chromacast-text">
                          <strong>ChromaCast™</strong>
                          <span className="arc-chromacast-sub">
                            {isShadowcast3
                              ? 'Restore vivid colors in MJPG capture'
                              : 'Restore vivid colors in MJPG capture — ShadowCast 3 required'}
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Swap inputs (only meaningful when both inputs are active) */}
                {pipOn && (
                  <button className="arc-swap" onClick={swapInputs} type="button">
                    <Icon name="swap" size={14} />
                    <span>Swap inputs</span>
                  </button>
                )}

                {/* Input 2 — PiP */}
                {pipOn && (
                  <div className="arc-settings-section">
                    <div className="arc-settings-section-title">
                      Input 2 — PiP
                      {pipActualSettings?.width && pipActualSettings?.height && (
                        <span className="arc-settings-section-meta">
                          {pipActualSettings.width}×{pipActualSettings.height}
                          {pipActualSettings.frameRate
                            ? ` · ${Math.round(pipActualSettings.frameRate)} fps`
                            : ''}
                        </span>
                      )}
                    </div>
                    <div className="arc-settings-grid">
                      <SettingRow label={t.videoDevice}>
                        <select
                          value={pipDeviceId}
                          onChange={(e) => setPipDeviceId(e.target.value)}
                        >
                          <option value="">Default (built-in webcam)</option>
                          {videoDevices
                            .filter((d) => d.deviceId)
                            .map((d) => (
                              <option key={d.deviceId} value={d.deviceId}>
                                {d.label}
                              </option>
                            ))}
                        </select>
                      </SettingRow>
                    </div>
                  </div>
                )}

                {/* Output / global audio routing */}
                <div className="arc-settings-section">
                  <div className="arc-settings-section-title">Output</div>
                  <div className="arc-settings-grid">
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
              </div>
            )}
          </div>

          <div className="arc-tools-divider" />

          {/* Live-feed modifiers — affect what you see/hear right now */}
          <div className="arc-audio-wrap">
            <ToolBtn
              icon="audio"
              label={t.audioPassthrough}
              active={audioOn}
              onClick={() => setAudioOn((v) => !v)}
              onTooltipEnter={onIconEnter}
              onTooltipLeave={onIconLeave}
            />
            <div
              className="arc-volume-popover"
              role="group"
              aria-label="Monitor volume"
            >
              <input
                className="arc-volume-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                disabled={!audioOn}
                aria-label="Monitor volume"
              />
              <div className="arc-volume-readout">{Math.round(volume * 100)}</div>
            </div>
          </div>
          <ToolBtn
            icon="mirror"
            label={t.mirror}
            active={mirrored}
            onClick={() => setMirrored((v) => !v)}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />

          {/* 4K upscaling — locked behind ShadowCast detection. When the
              active device isn't a ShadowCast we keep the button mounted
              (so the tooltip can explain why) but render it as soft-disabled
              with a no-op click. */}
          {(() => {
            const upscaleAvailable = isShadowcastActive;
            const upscaleLabel = upscaleAvailable
              ? '4K upscaling'
              : '4K upscaling — ShadowCast required';
            return (
              <button
                className={`arc-tool ${upscaleOn ? 'is-active' : ''} ${
                  !upscaleAvailable ? 'is-unavailable' : ''
                }`}
                onMouseEnter={onIconEnter(upscaleLabel)}
                onMouseLeave={onIconLeave}
                onFocus={onIconEnter(upscaleLabel)}
                onBlur={onIconLeave}
                onClick={() => {
                  onIconLeave();
                  if (running && upscaleAvailable) setUpscaleOn((v) => !v);
                }}
                disabled={!running}
                aria-label={upscaleLabel}
                type="button"
              >
                <Icon name="sparkles" size={18} />
              </button>
            );
          })()}

          <div className="arc-tools-divider" />

          {/* Capture group — produces output files */}
          <ToolBtn
            icon="snapshot"
            label={t.snapshot}
            onClick={takeScreenshot}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
          <ToolBtn
            icon={recording ? 'stop' : 'record'}
            label={recording ? t.stop : t.record}
            active={recording}
            onClick={() => (recording ? stopRecording() : startRecording())}
            disabled={!running}
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

          <div className="arc-tools-divider" />

          {/* PiP — separate group: webcam adds an entirely new stream / overlay */}
          <ToolBtn
            icon="webcam"
            label={t.webcamPip}
            active={pipOn}
            onClick={() => setPipOn((v) => !v)}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />

          <div className="arc-ticker-slot">{!running && <NewsTicker />}</div>

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

function NewsTicker() {
  // Random order per visit so visitors don't always see the same first item.
  const items = useState(() => shuffled(NEWS_ITEMS))[0];
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<'typing' | 'idle' | 'fading'>('typing');

  // Pacing
  const TYPE_INTERVAL_MS = 35; // per character
  const DWELL_MS = 8_000; // how long the fully-typed message stays before fading
  const FADE_MS = 400; // fade-out duration before advancing

  const item = items[index];

  // 1) Typewriter — types out the current message character by character
  useEffect(() => {
    setTyped('');
    setPhase('typing');
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(item.text.slice(0, i));
      if (i >= item.text.length) {
        window.clearInterval(id);
        setPhase('idle');
      }
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [item.id, item.text]);

  // 2) Dwell — once typing finishes, hold for DWELL_MS, then fade
  useEffect(() => {
    if (phase !== 'idle') return;
    const id = window.setTimeout(() => setPhase('fading'), DWELL_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  // 3) Fade — wait for the CSS transition, then advance to next message
  useEffect(() => {
    if (phase !== 'fading') return;
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % items.length);
    }, FADE_MS);
    return () => window.clearTimeout(id);
  }, [phase, items.length]);

  return (
    <div
      className={`arc-ticker ${phase === 'fading' ? 'is-fading' : ''}`}
      aria-live="polite"
    >
      {item.username && <span className="arc-ticker-user">@{item.username}</span>}
      <span className="arc-ticker-text">
        {typed}
        {phase === 'typing' && <span className="arc-ticker-cursor">▍</span>}
      </span>
      {item.link && phase !== 'typing' && (
        <a
          className="arc-ticker-link"
          href={item.link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.link.label} →
        </a>
      )}
    </div>
  );
}

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
  showUpsell,
  onDismissUpsell,
}: {
  t: ReturnType<typeof useTranslation>;
  showUpsell: boolean;
  onDismissUpsell: () => void;
}) {
  return (
    <div className="arc-idle">
      <div className="arc-idle-inner">
        <div className="arc-eyebrow arc-idle-eyebrow">{t.heroEyebrow}</div>
        <h1 className="arc-idle-title">{t.heroTitle}</h1>
        <p className="arc-idle-sub">{t.heroSub}</p>
        <div className="arc-quickstart">
          <QuickStep n="01" title={t.qs1Title} body={t.qs1Body} icon="plug" />
          <QuickStep n="02" title={t.qs2Title} body={t.qs2Body} icon="play" />
          <QuickStep n="03" title={t.qs3Title} body={t.qs3Body} icon="shield" />
        </div>
        {showUpsell && <UpsellCard t={t} onDismiss={onDismissUpsell} />}
      </div>
    </div>
  );
}
