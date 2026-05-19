import { useCallback, useEffect, useRef, useState } from 'react';
import logoUrl from './assets/genki-logo.png';
import sc3CableUrl from './assets/sc3-cable.jpg';
import { Icon } from './icons';
import { pickLanguage, useTranslation } from './i18n';
import { NEWS_ITEMS, shuffled } from './news';
import { UpscaleCanvas } from './upscaler';
import { CRTCanvas } from './crt';
import { analytics } from './analytics';

type DeviceInfo = { deviceId: string; label: string };

const SHADOWCAST_HINTS = ['shadowcast', 'shadow cast', 'genki'];
const SHADOWCAST3_HINT = /shadowcast\s*3/i;

// Three upsell URLs — picked at render time by detected capture device.
// All UTM-tagged so Shopify attributes orders back to the arcade app
// (Admin → Analytics → "Top traffic sources" / "Sales attributed to
// marketing"). utm_medium=upsell distinguishes this surface from the
// news-ticker links (utm_medium=ticker).
//
// Generic SC3 pitch — shown to unknown / non-Genki / non-competitor users
// (FaceTime, hidden file:// labels, etc).
const SHOPIFY_SHADOWCAST3_URL =
  'https://www.genkithings.com/products/shadowcast-3-pro?utm_source=arcade&utm_medium=upsell&utm_campaign=arcade-app';
// $15 off for existing ShadowCast 1 / 2 owners. Shopify discount-code URL
// auto-applies and redirects to the product page (users don't enter a code).
const SHADOWCAST3_UPGRADE_URL =
  'https://www.genkithings.com/discount/CX58Z8RDC8ZK?redirect=%2Fproducts%2Fshadowcast-3-pro&utm_source=arcade&utm_medium=upsell&utm_campaign=arcade-app';
// $10 off for users on a competing capture card (Elgato, AVerMedia, etc.)
// — "switch and see what ShadowCast can do" angle.
const SHADOWCAST3_SWITCHER_URL =
  'https://www.genkithings.com/discount/489SG87P5B3B?redirect=%2Fproducts%2Fshadowcast-3-pro&utm_source=arcade&utm_medium=upsell&utm_campaign=arcade-app';

// Both promo codes expire on the same date. Surfaced in the UI on the
// discounted variants so they read as time-limited, not evergreen.
const UPSELL_EXPIRES_LABEL = 'Offer ends June 15';

// Common competing capture-card brands. Detected by label keyword — add
// other brands here as you encounter them.
const COMPETITOR_CAPTURE_RE = /\b(elgato|avermedia|mirabox|hyperdeck)\b/i;
function isCompetitorCaptureDevice(label: string | undefined): boolean {
  return !!label && COMPETITOR_CAPTURE_RE.test(label);
}

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

// Initial fps default per detected ShadowCast model. Tested most-specific
// first so SC2 Pro doesn't get matched as plain SC2. Returns null for
// non-Genki / unknown labels so the caller can leave the user's existing
// default in place.
function defaultFpsForLabel(label: string | undefined): number | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (/shadowcast\s*3/.test(l)) return 120;
  if (/shadowcast\s*2\s*pro/.test(l)) return 120;
  if (/shadowcast\s*2/.test(l)) return 60;
  if (/shadowcast/.test(l)) return 30;
  return null;
}

// Predict whether a given resolution + framerate combo will be delivered
// uncompressed (YUY2/NV12) or compressed in MJPG.
//
// Browsers force this decision; we don't get to choose like a native capture
// app does. Empirically Chrome / Safari on macOS aggressively prefer MJPG
// even when uncompressed *would* fit USB 3.0 — they only pick uncompressed
// for genuinely low-bandwidth combos (~1.8 Gbps and below in our hands-on
// SC3 testing). Windows browsers are more permissive and roughly track the
// actual USB ceiling (~3.6 Gbps practical for one card on isochronous USB
// 3.0; the quoted 4 Gbps theoretical never materializes once OS overhead is
// in the picture).
//
// So the threshold is platform-dependent. Will be replaced with per-device
// lookup tables once we validate the full SC3 matrix on each OS.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  (/mac|iphone|ipad/i.test(navigator.platform || '') ||
    /macintosh|mac os x|iphone|ipad/i.test(navigator.userAgent || ''));
const USB3_PRACTICAL_BPS = IS_MAC ? 1_800_000_000 : 3_600_000_000;
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

// (ChromaCast preset constant removed — three manual sliders replace it.
// See the Color section in the settings popover.)

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
  // Hidden HTMLAudioElement that plays the game audio directly. Bypasses
  // Web Audio for the monitoring path, saving ~10 ms vs. routing through
  // AudioContext.destination. Web Audio is still used for the recording
  // mix (game audio + mic), but that path doesn't gate live latency.
  const audioMonitorRef = useRef<HTMLAudioElement>(null);
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
  const [upscaleOn, setUpscaleOn] = useState<boolean>(false);
  const [crtOn, setCrtOn] = useState<boolean>(false);
  const [audioOn, setAudioOn] = useState<boolean>(true);
  // Monitoring volume — only affects what comes out of the speakers, not the
  // recorded mix (so a quiet headphone setting doesn't tank recording levels).
  const [volume, setVolume] = useState<number>(1);
  // (ChromaCast preset removed — replaced with manual brightness / contrast /
  // saturation sliders below. A single preset value couldn't fit content as
  // varied as cartoon games + dark cinematics + black-and-white horror, so
  // tuning is now in user hands. CSS filter pipeline stays GPU-composited,
  // zero added latency.)

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
  // Same pattern for the CRT canvas — drawComposite reads from it when
  // crtOn so recordings/screenshots include the CRT effect.
  const crtCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // One-shot guard so we set fps from the detected ShadowCast model exactly
  // once per session. After the first auto-pick, subsequent refreshDevices
  // calls (devicechange events, swap inputs, etc.) leave the user's choice
  // alone.
  const fpsAutoConfiguredRef = useRef<boolean>(false);

  // Session-level analytics counters. Reset at session_started, summed up
  // and reported at session_ended. Refs (not state) since they don't drive
  // any UI and we want zero-cost increments inside hot paths.
  const sessionStartMsRef = useRef<number | null>(null);
  const sessionScreenshotsRef = useRef<number>(0);
  const sessionRecordingsRef = useRef<number>(0);
  const recordingStartMsRef = useRef<number | null>(null);
  const lastReportedConfigRef = useRef<string>('');
  const recordingRafRef = useRef<number>(0);
  const [recording, setRecording] = useState<boolean>(false);
  const [recElapsed, setRecElapsed] = useState<number>(0);

  // ---- Other UI -----------------------------------------------------------
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [faqOpen, setFaqOpen] = useState<boolean>(false);
  const [tooltip, setTooltip] = useState<{ label: string; cx: number; ty: number } | null>(null);

  // ShadowCast 3 upsell — session-only dismissal. Every reload brings it
  // back so returning users can't permanently lose visibility on hardware
  // upgrades; if they don't want it, they can just close it for now.
  const [upsellDismissed, setUpsellDismissed] = useState<boolean>(false);
  const dismissUpsell = useCallback(() => {
    setUpsellDismissed(true);
    analytics.upsellDismissed();
  }, []);

  // News ticker — session-only dismissal too. The rotating chatter is part
  // of the vibe and we want fresh visitors to discover it; if it's noisy
  // mid-session you can close it, but it'll be back next reload.
  const [tickerDismissed, setTickerDismissed] = useState<boolean>(false);
  const dismissTicker = useCallback(() => {
    setTickerDismissed(true);
  }, []);

  // ---- Image adjustments (state only — UI hidden in this design pass) -----
  // Preserved so the canvas pipeline still receives them. We can re-introduce
  // the popover later as a settings entry.
  // Color adjustments — three CSS-filter sliders, persisted per-user.
  // Defaults at 1.0 (no effect). Presets stuff predefined values in.
  const readNum = (key: string, fallback: number): number => {
    try {
      const v = localStorage.getItem(key);
      const n = v === null ? NaN : Number(v);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  };
  const writeNum = (key: string, n: number) => {
    try {
      localStorage.setItem(key, String(n));
    } catch {
      /* ignore */
    }
  };
  const [brightness, setBrightnessState] = useState<number>(() =>
    readNum('arcadeBrightness', 1),
  );
  const [contrast, setContrastState] = useState<number>(() =>
    readNum('arcadeContrast', 1),
  );
  const [saturation, setSaturationState] = useState<number>(() =>
    readNum('arcadeSaturation', 1),
  );
  const setBrightness = useCallback((v: number) => {
    setBrightnessState(v);
    writeNum('arcadeBrightness', v);
  }, []);
  const setContrast = useCallback((v: number) => {
    setContrastState(v);
    writeNum('arcadeContrast', v);
  }, []);
  const setSaturation = useCallback((v: number) => {
    setSaturationState(v);
    writeNum('arcadeSaturation', v);
  }, []);
  const applyColorPreset = useCallback(
    (preset: 'reset' | 'vivid' | 'cinematic') => {
      const values =
        preset === 'vivid'
          ? { b: 1, c: 1.2, s: 1 }
          : preset === 'cinematic'
            ? { b: 0.95, c: 1.15, s: 0.85 }
            : { b: 1, c: 1, s: 1 };
      setBrightness(values.b);
      setContrast(values.c);
      setSaturation(values.s);
    },
    [setBrightness, setContrast, setSaturation],
  );
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
  // PiP capture resolution / fps. Most webcams cap at 720p30; the start
  // path falls back gracefully if the chosen combo isn't supported by the
  // selected device.
  const [pipResolution, setPipResolution] = useState<string>('1280x720');
  const [pipFps, setPipFps] = useState<number>(30);

  // Live snapshot of visual settings, read by the recording RAF loop so
  // mid-recording toggles take effect without restarting the recorder.
  const captureSettingsRef = useRef({
    mirrored: false,
    pipOn: false,
    pipMirrored: true,
    composedFilterActive: false,
    composedFilter: 'none',
    upscaleOn: false,
    crtOn: false,
  });

  // -------------------------------------------------------------------------
  // Device enumeration
  // -------------------------------------------------------------------------
  const refreshDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();

    // Disambiguate same-named devices (e.g. two ShadowCast 3 units plugged
    // in) by appending #1 / #2 etc. Numbers are assigned per groupId so the
    // same physical device gets the same number across video and audio
    // dropdowns — picking "ShadowCast 3 #1" video reliably pairs with
    // "ShadowCast 3 #1" audio. groupId is stable within a session.
    const groupIdsByLabel = new Map<string, string[]>();
    for (const d of all) {
      if (!d.label || !d.groupId) continue;
      const list = groupIdsByLabel.get(d.label) ?? [];
      if (!list.includes(d.groupId)) list.push(d.groupId);
      groupIdsByLabel.set(d.label, list);
    }
    const labelFor = (d: MediaDeviceInfo, fallback: string): string => {
      const base = d.label || fallback;
      if (!d.label) return base;
      const groups = groupIdsByLabel.get(d.label);
      if (!groups || groups.length <= 1) return base;
      const idx = groups.indexOf(d.groupId);
      return idx >= 0 ? `${base} #${idx + 1}` : base;
    };

    const vids: DeviceInfo[] = all
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({ deviceId: d.deviceId, label: labelFor(d, 'Camera') }));
    const mics: DeviceInfo[] = all
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ deviceId: d.deviceId, label: labelFor(d, 'Microphone') }));
    const outs: DeviceInfo[] = all
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: labelFor(d, 'Speaker') }));

    setVideoDevices(vids);
    setAudioDevices(mics);
    setOutputDevices(outs);

    // Auto-select ShadowCast when possible.
    setVideoDeviceId((cur) => cur || pickShadowcast(vids)?.deviceId || vids[0]?.deviceId || '');
    setAudioDeviceId((cur) => cur || pickShadowcast(mics)?.deviceId || mics[0]?.deviceId || '');

    // Set the framerate to a model-appropriate default the first time we
    // see a ShadowCast — SC3 / SC2 Pro can do 120, SC2 caps at 60, the
    // original SC tops out at 30. Only fires once so manual changes stick.
    if (!fpsAutoConfiguredRef.current) {
      const sc = pickShadowcast(vids);
      const target = defaultFpsForLabel(sc?.label);
      if (target !== null) {
        setFps(target);
        fpsAutoConfiguredRef.current = true;
      }
    }
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
    micNodeRef.current?.disconnect();
    micNodeRef.current = null;
    mixDestRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    if (audioMonitorRef.current) {
      audioMonitorRef.current.pause();
      audioMonitorRef.current.srcObject = null;
    }
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
      probeDecodedFormat(vTrack).then((format) => {
        setDecodedFormat(format);
        const bucket = formatFromDecoded(format);
        if (format && bucket) {
          analytics.formatDetected({
            device: vTrack.label,
            decoded: format,
            bucket,
          });
        }
      });

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

        // Monitoring path: HTMLAudioElement plays the audio track directly
        // through the browser's native audio pipeline. ~5-15 ms output buffer
        // vs. Web Audio's 10-25 ms — saves ~10 ms of perceived audio lag.
        // Mic isn't routed to monitoring (recording-only), so this is safe
        // whether mic is on or off.
        const audioEl = audioMonitorRef.current;
        if (audioEl) {
          audioEl.srcObject = audioStream;
          audioEl.volume = volumeRef.current;
          if (
            outputDeviceId &&
            outputDeviceId !== 'default' &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typeof (audioEl as any).setSinkId === 'function'
          ) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (audioEl as any).setSinkId(outputDeviceId);
            } catch (e) {
              console.warn('audio setSinkId failed:', e);
            }
          }
          audioEl.play().catch(() => {});
        }

        // Recording path: still goes through Web Audio so we can mix game
        // audio with the mic stream into one track for MediaRecorder. The
        // recording stream is *not* gain-attenuated — the volume slider
        // only affects monitoring (the <audio> element), so a quiet
        // headphone setting doesn't tank recording levels.
        const src = ctx.createMediaStreamSource(audioStream);
        audioNodeRef.current = src;
        src.connect(mixDest);
      }

      setRunning(true);

      // Analytics: session_started fires once per session (until session_ended).
      // stream_config fires every time we successfully (re-)acquire a stream,
      // so device / resolution / fps changes show up as separate events.
      const formatGuess = expectedFormat(w, h, fps);
      if (sessionStartMsRef.current === null) {
        sessionStartMsRef.current = Date.now();
        sessionRecordingsRef.current = 0;
        sessionScreenshotsRef.current = 0;
        analytics.sessionStarted({
          device: vTrack.label,
          resolution,
          fps,
          format: formatGuess,
        });
      }
      // De-dupe stream_config across the rapid re-renders that can fire
      // back-to-back when multiple state values change in one user action.
      const cfgKey = `${vTrack.label}|${resolution}|${fps}|${formatGuess}`;
      if (lastReportedConfigRef.current !== cfgKey) {
        lastReportedConfigRef.current = cfgKey;
        analytics.streamConfig({
          device: vTrack.label,
          resolution,
          fps,
          format: formatGuess,
        });
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(`Start failed: ${msg}`);
      analytics.errorOccurred(`start_failed: ${msg}`);
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

  // Live volume control — drives HTMLAudioElement.volume directly. The ref
  // mirror lets `start()` initialize the audio element at the current slider
  // value even though `volume` isn't in its dep list (avoiding restarts on
  // drag).
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
    const audioEl = audioMonitorRef.current;
    if (audioEl) audioEl.volume = volume;
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

  // Konami-style chord that opens the shared analytics URL in a new tab.
  // Sequence: ↑ ↑ ↓ ↓ ← → ← → g e n k i. Resets on any wrong key. Skipped
  // entirely while focus is on a form input so we don't steal their typing.
  useEffect(() => {
    const SEQUENCE = [
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
      'g', 'e', 'n', 'k', 'i',
    ];
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const expected = SEQUENCE[pos];
      const got = expected.length === 1 ? e.key.toLowerCase() : e.key;
      const want = expected.length === 1 ? expected.toLowerCase() : expected;
      if (got === want) {
        pos += 1;
        if (pos === SEQUENCE.length) {
          pos = 0;
          const url = import.meta.env.VITE_ANALYTICS_URL as string | undefined;
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
          else
            console.info(
              'Konami unlocked, but VITE_ANALYTICS_URL is not set. Configure it in your Vercel project env to enable.',
            );
        }
      } else {
        // Allow the wrong key to also be the start of a fresh attempt
        pos = got === SEQUENCE[0].toLowerCase() ? 1 : 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Explicit session end — wraps stopStreams with a session_ended event so
  // device-change restarts (which also call stopStreams) don't pollute the
  // analytics with bogus session boundaries. The End button + pagehide
  // listener are the only places that should fire this.
  const reportAndClearSession = useCallback(() => {
    const startMs = sessionStartMsRef.current;
    if (startMs === null) return;
    const label =
      videoStreamRef.current?.getVideoTracks()[0]?.label ||
      videoDevices.find((d) => d.deviceId === videoDeviceId)?.label;
    analytics.sessionEnded({
      device: label,
      duration_s: (Date.now() - startMs) / 1000,
      recordings: sessionRecordingsRef.current,
      screenshots: sessionScreenshotsRef.current,
    });
    sessionStartMsRef.current = null;
    sessionRecordingsRef.current = 0;
    sessionScreenshotsRef.current = 0;
    lastReportedConfigRef.current = '';
  }, [videoDevices, videoDeviceId]);

  const endSession = useCallback(() => {
    reportAndClearSession();
    stopStreams();
  }, [reportAndClearSession, stopStreams]);

  // Tab close / navigation: fire session_ended once. Analytics uses
  // sendBeacon under the hood so this survives page teardown.
  useEffect(() => {
    const onHide = () => reportAndClearSession();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [reportAndClearSession]);

  // Live re-route audio output when the user picks a different sink mid-stream
  // (previously this only applied at start time). HTMLAudioElement.setSinkId
  // is supported across modern Chrome / Edge / Firefox 116+ / Safari 17+.
  useEffect(() => {
    if (!running) return;
    const audioEl = audioMonitorRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!audioEl || typeof (audioEl as any).setSinkId !== 'function') return;
    const target = outputDeviceId === 'default' ? '' : outputDeviceId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (audioEl as any).setSinkId(target).catch((e: unknown) => {
      console.warn('audio setSinkId failed:', e);
    });
  }, [outputDeviceId, running]);

  // Sync capture settings ref for recording loop.
  useEffect(() => {
    captureSettingsRef.current = {
      mirrored,
      pipOn,
      pipMirrored,
      composedFilterActive,
      composedFilter,
      upscaleOn,
      crtOn,
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
      const [pw, ph] = pipResolution.split('x').map(Number);
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: pw },
        height: { ideal: ph },
        frameRate: { ideal: pipFps },
      };
      if (pipDeviceId) videoConstraints.deviceId = { exact: pipDeviceId };
      const constraints: MediaStreamConstraints = {
        video: videoConstraints,
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
  }, [pipOn, pipDeviceId, pipResolution, pipFps]);

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
    const video = videoRef.current;
    const pip = e.currentTarget;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const offsetX = e.clientX - pipRect.left;
    const offsetY = e.clientY - pipRect.top;
    // Clamp to the displayed video rect (not the stage) so the user can't
    // drag PiP into the letterbox bars when source aspect ≠ stage aspect.
    // Falls back to the full stage if video isn't ready yet — that just
    // gives the previous (over-permissive) behavior pre-stream rather than
    // freezing the drag.
    const disp = video?.videoWidth
      ? getDisplayedVideoRect(
          video.videoWidth,
          video.videoHeight,
          stage.clientWidth,
          stage.clientHeight,
        )
      : { x: 0, y: 0, w: stage.clientWidth, h: stage.clientHeight };
    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX - stageRect.left - offsetX;
      const y = ev.clientY - stageRect.top - offsetY;
      const minX = disp.x;
      const minY = disp.y;
      const maxX = disp.x + disp.w - pipRect.width;
      const maxY = disp.y + disp.h - pipRect.height;
      setPipPos({
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y)),
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
  const drawComposite = useCallback(
    (canvas: HTMLCanvasElement, opts?: { preserveSize?: boolean }) => {
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
      crtOn: cFlag,
    } = captureSettingsRef.current;

    // Source priority for capture: CRT canvas > upscale canvas > raw video.
    // CRT and upscale are mutually exclusive in the UI but if both somehow
    // ended up true, CRT wins (it's the more visually transformative one).
    const crtCanvas = crtCanvasRef.current;
    const upscaleCanvas = upscaleCanvasRef.current;
    const useCrt = cFlag && crtCanvas && crtCanvas.width > 0;
    const useUpscale = !useCrt && uFlag && upscaleCanvas && upscaleCanvas.width > 0;
    const sourceCanvas: HTMLCanvasElement | HTMLVideoElement = useCrt
      ? crtCanvas
      : useUpscale
        ? upscaleCanvas
        : video;
    const srcW = useCrt
      ? crtCanvas.width
      : useUpscale
        ? upscaleCanvas.width
        : video.videoWidth;
    const srcH = useCrt
      ? crtCanvas.height
      : useUpscale
        ? upscaleCanvas.height
        : video.videoHeight;

    // preserveSize keeps the output canvas at its existing dimensions,
    // scaling the source into it. Recording uses this so a mid-recording
    // resolution change doesn't resize (and clear) the canvas — which was
    // showing up as a blue gap in the captured stream when users swapped
    // resolutions while recording. Screenshots leave the option off so
    // they render at native source resolution.
    if (!opts?.preserveSize) {
      if (canvas.width !== srcW) canvas.width = srcW;
      if (canvas.height !== srcH) canvas.height = srcH;
    }

    ctx.save();
    // ctx.filter is only used for the raw-video case. When the source is a
    // WebGL canvas (CRT or upscale), BCS is already baked into its pixels
    // by the shader — re-applying ctx.filter here would double-apply on
    // browsers where it works, and silently no-op on browsers where it
    // doesn't apply to canvas sources (which is what was breaking
    // recordings before this change).
    const isWebglSource = useCrt || useUpscale;
    ctx.filter = aFlag && !isWebglSource ? fCss : 'none';
    if (mFlag) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
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
    sessionScreenshotsRef.current += 1;
    analytics.screenshotTaken();
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

    // Lock the recording canvas to whatever resolution the source has at
    // start. We then keep it locked via preserveSize: true in the render
    // loop, so a mid-recording resolution change scales the new source
    // into the same canvas instead of resizing (and visually clearing) it.
    // Prevents the "blue screen after resolution swap" bug.
    const startW = upscaleCanvasRef.current?.width || video.videoWidth;
    const startH = upscaleCanvasRef.current?.height || video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = startW;
    canvas.height = startH;
    recordingCanvasRef.current = canvas;

    const renderLoop = () => {
      drawComposite(canvas, { preserveSize: true });
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
    recordingStartMsRef.current = Date.now();
    sessionRecordingsRef.current += 1;
  }, [fps, drawComposite]);

  const stopRecording = useCallback(() => {
    cancelAnimationFrame(recordingRafRef.current);
    recordingRafRef.current = 0;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    setRecElapsed(0);
    if (recordingStartMsRef.current !== null) {
      analytics.recordingCompleted({
        duration_s: (Date.now() - recordingStartMsRef.current) / 1000,
      });
      recordingStartMsRef.current = null;
    }
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

  // Single-key shortcuts for the dock buttons. Fires only when the app is
  // running (except for `,` which works idle so users can pre-configure),
  // no input is focused, and no modifier key is held — so Cmd+S still
  // saves the page, etc. Tooltips show the assigned letter via ToolBtn's
  // `shortcut` prop. Conflicts with the Konami chord on individual letters
  // (e.g. typing "genki" toggles Enhance + Mic en route) are accepted —
  // the chord is rare enough that the cosmetic side effect doesn't matter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      )
        return;
      const k = e.key.toLowerCase();

      if (k === ',') {
        e.preventDefault();
        setSettingsOpen((o) => !o);
        return;
      }

      if (!running) return;

      switch (k) {
        case 's':
          e.preventDefault();
          takeScreenshot();
          break;
        case 'r':
        case ' ':
          // Space is the natural "play/pause"-flavored toggle; R is also
          // available for keyboards where Space is mapped elsewhere.
          e.preventDefault();
          if (recording) stopRecording();
          else startRecording();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          setMirrored((v) => !v);
          break;
        case 'a':
          e.preventDefault();
          setAudioOn((v) => !v);
          break;
        case 'u':
          if (isShadowcastActive) {
            e.preventDefault();
            setUpscaleOn((v) => {
              const next = !v;
              analytics.toggle('upscale', next);
              if (next && crtOn) {
                setCrtOn(false);
                analytics.toggle('crt', false);
              }
              return next;
            });
          }
          break;
        case 'c':
          e.preventDefault();
          setCrtOn((v) => {
            const next = !v;
            analytics.toggle('crt', next);
            if (next && upscaleOn) {
              setUpscaleOn(false);
              analytics.toggle('upscale', false);
            }
            return next;
          });
          break;
        case 'p':
          e.preventDefault();
          setPipOn((v) => {
            analytics.toggle('pip', !v);
            return !v;
          });
          break;
        case 'v':
          e.preventDefault();
          setMicOn((v) => {
            analytics.toggle('mic', !v);
            return !v;
          });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    running,
    recording,
    isShadowcastActive,
    upscaleOn,
    crtOn,
    takeScreenshot,
    startRecording,
    stopRecording,
    toggleFullscreen,
  ]);

  const isShadowcast3 =
    SHADOWCAST3_HINT.test(activeVideoLabel) || SHADOWCAST3_HINT.test(activeAudioLabel);
  // Legacy ShadowCast owner (SC1 / SC2 / SC2 Pro) — Genki match minus SC3.
  // Triggers the loyalty "thank-you" upsell with $15 off instead of the
  // generic SC3 pitch.
  const isShadowcastLegacy = labelsKnown && isShadowcastActive && !isShadowcast3;
  // Competing capture card (Elgato, AVerMedia, etc.) — different upsell:
  // "switch and see what ShadowCast can do" with its own $10 off code.
  const isCompetitorActive =
    labelsKnown &&
    (isCompetitorCaptureDevice(activeVideoLabel) ||
      isCompetitorCaptureDevice(activeAudioLabel));
  // Pick the upsell variant from detected device:
  //   legacy   → SC1 / SC2 owner, loyalty thank-you ($15 off)
  //   switcher → competitor capture card, $10 off to try ShadowCast
  //   default  → fallback (FaceTime, unknown labels, file://), generic pitch
  const upsellVariant: UpsellVariant = isShadowcastLegacy
    ? 'legacy'
    : isCompetitorActive
      ? 'switcher'
      : 'default';
  const showUpsell = !upsellDismissed && (!labelsKnown || !isShadowcast3);

  // Real (negotiated) resolution + fps from the live track. Fall back to the
  // requested values until the track reports settings.
  const actualW = actualSettings?.width ?? Number(resolution.split('x')[0]);
  const actualH = actualSettings?.height ?? Number(resolution.split('x')[1]);
  const actualFps = actualSettings?.frameRate
    ? Math.round(actualSettings.frameRate)
    : fps;
  const shortRes = (w: number, h: number): string => {
    if (w >= 7680 || h >= 4320) return '8K';
    if (w >= 3840 || h >= 2160) return '4K';
    if (h >= 1440) return '1440p';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    return `${w}×${h}`;
  };
  const resolutionShort = shortRes(actualW, actualH);
  // Upscaler runs at up to 2× source, capped at 4K target (anything more
  // is wasted GPU). When the cap kicks in (4K source → no resolution
  // change, just sharpen) we hide the arrow — saying "4K → 4K" is silly.
  const upscaleTargetW = Math.min(actualW * 2, 3840);
  const upscaleTargetH = Math.min(actualH * 2, 2160);
  const upscaledShort =
    upscaleOn && (upscaleTargetW > actualW || upscaleTargetH > actualH)
      ? shortRes(upscaleTargetW, upscaleTargetH)
      : null;

  // (Source-format detection has been removed from the UI — neither the
  // bandwidth-prediction nor the post-decode probe is authoritative on
  // macOS, and a wrong indicator is worse than no indicator. The probe
  // still runs once per stream-start to populate analytics, but the
  // value isn't surfaced anywhere user-facing. If browsers ever expose
  // a real pixelFormat constraint we can flip on, we can bring back a
  // toggle then — for now, no UI noise.)
  const [reqW, reqH] = resolution.split('x').map(Number);

  // Composed filter chain — only the manual color sliders contribute now.
  // Kept the composedFilter / composedFilterActive variable names so the
  // capture pipeline (drawComposite, video element, upscaler canvas) can
  // keep using them as the unified "should we apply a CSS filter?" signal.
  const composedFilter = adjustmentsActive ? filterCss : 'none';
  const composedFilterActive = adjustmentsActive;

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
                  · {activeVideoLabel} · {resolutionShort}
                  {upscaledShort && (
                    <span className="arc-pill-upscale"> → {upscaledShort}</span>
                  )} · {actualFps} fps
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
                  · {activeVideoLabel} · {resolutionShort}
                  {upscaledShort && (
                    <span className="arc-pill-upscale"> → {upscaledShort}</span>
                  )} · {actualFps} fps
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
          <button className="arc-session is-end" onClick={endSession} type="button">
            <Icon name="close" size={14} />
            <span>{t.end}</span>
          </button>
        )}
      </header>

      {/* STAGE */}
      <main
        className="arc-stage"
        ref={stageRef as React.RefObject<HTMLElement>}
        onDoubleClick={(e) => {
          // Toggle fullscreen when the user double-clicks the stage,
          // matching YouTube / native player conventions. Skip when the
          // double-click landed inside an interactive overlay (PiP, ticker
          // close button, idle-screen CTAs) so it doesn't fire when the
          // user actually meant to interact.
          const target = e.target as HTMLElement;
          if (
            target.closest('.arc-pip') ||
            target.closest('.arc-ticker-slot') ||
            target.closest('.arc-corner-actions') ||
            target.closest('.arc-faq-trigger') ||
            target.closest('.arc-upsell')
          )
            return;
          if (running) toggleFullscreen();
        }}
      >
        {!running && (
          <IdleHero
            t={t}
            showUpsell={showUpsell}
            upsellVariant={upsellVariant}
            onDismissUpsell={dismissUpsell}
          />
        )}
        {!running && (
          <div className="arc-corner-actions">
            <InstallButton />
            <button
              className="arc-faq-trigger"
              onClick={() => setFaqOpen(true)}
              type="button"
            >
              Tips & FAQ
            </button>
            <BuildStamp />
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`arc-video ${mirrored ? 'is-mirrored' : ''}`}
          style={{
            // Hide the raw <video> when a WebGL pass is active — the canvas
            // (upscaler or CRT) renders on top. Element stays mounted so its
            // srcObject keeps producing frames the shader can read.
            display: running && !upscaleOn && !crtOn ? 'block' : 'none',
            filter: composedFilterActive ? composedFilter : undefined,
          }}
        />

        {running && crtOn && (
          <CRTCanvas
            videoRef={videoRef}
            canvasRef={crtCanvasRef}
            brightness={brightness}
            contrast={contrast}
            saturation={saturation}
            className={`arc-video ${mirrored ? 'is-mirrored' : ''}`}
            style={{ display: 'block' }}
          />
        )}

        {running && upscaleOn && !crtOn && (
          <UpscaleCanvas
            videoRef={videoRef}
            canvasRef={upscaleCanvasRef}
            brightness={brightness}
            contrast={contrast}
            saturation={saturation}
            className={`arc-video ${mirrored ? 'is-mirrored' : ''}`}
            style={{ display: 'block' }}
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
              shortcut=","
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

                {/* Main input — primary capture device */}
                <div className="arc-settings-section">
                  <div className="arc-settings-section-title">Main Input</div>
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
                  </div>
                </div>

                {/* Color — manual brightness / contrast / saturation sliders.
                    All CSS filters, GPU-composited, zero added latency. The
                    three preset buttons stuff predefined values into the
                    sliders; from there the user can fine-tune. */}
                <div className="arc-settings-section">
                  <div className="arc-settings-section-title">
                    Color
                    <span className="arc-color-presets">
                      <button
                        type="button"
                        className="arc-color-preset"
                        onClick={() => applyColorPreset('reset')}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="arc-color-preset"
                        onClick={() => applyColorPreset('vivid')}
                      >
                        Vivid
                      </button>
                      <button
                        type="button"
                        className="arc-color-preset"
                        onClick={() => applyColorPreset('cinematic')}
                      >
                        Cinematic
                      </button>
                    </span>
                  </div>
                  <div className="arc-color-grid">
                    <ColorSlider
                      label="Brightness"
                      value={brightness}
                      onChange={setBrightness}
                      min={0.5}
                      max={1.5}
                    />
                    <ColorSlider
                      label="Contrast"
                      value={contrast}
                      onChange={setContrast}
                      min={0.5}
                      max={1.5}
                    />
                    <ColorSlider
                      label="Saturation"
                      value={saturation}
                      onChange={setSaturation}
                      min={0.5}
                      max={1.5}
                    />
                  </div>
                </div>

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
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="arc-tools-divider" />

          {/* Live-feed modifiers — affect what you see/hear right now */}
          <div className="arc-tool-popover-wrap">
            <ToolBtn
              icon="audio"
              label={t.audioPassthrough}
              shortcut="A"
              active={audioOn}
              onClick={() => setAudioOn((v) => !v)}
              onTooltipEnter={onIconEnter}
              onTooltipLeave={onIconLeave}
            />
            <div
              className="arc-tool-popover"
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
            shortcut="M"
            active={mirrored}
            onClick={() => setMirrored((v) => !v)}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />

          {/* 4K upscaling — locked behind ShadowCast detection. When the
              active device isn't a ShadowCast we keep the button mounted
              (so the tooltip can explain why) but render it as soft-disabled
              with a no-op click. Mutually exclusive with CRT. */}
          {(() => {
            const upscaleAvailable = isShadowcastActive;
            const upscaleLabel = upscaleAvailable
              ? '4K upscaling · U'
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
                  if (running && upscaleAvailable) {
                    setUpscaleOn((v) => {
                      const next = !v;
                      analytics.toggle('upscale', next);
                      // Mutually exclusive with CRT — turning Enhance on
                      // turns CRT off so the two WebGL passes don't fight.
                      if (next && crtOn) {
                        setCrtOn(false);
                        analytics.toggle('crt', false);
                      }
                      return next;
                    });
                  }
                }}
                disabled={!running}
                aria-label={upscaleLabel}
                type="button"
              >
                <Icon name="sparkles" size={18} />
              </button>
            );
          })()}

          {/* CRT mode — WebGL shader that lays scanlines + RGB slot mask +
              vignette + slight curvature on top of the source. Universal
              (no SC gating — it's an aesthetic choice, not a hardware
              feature). Mutually exclusive with Enhance. */}
          <button
            className={`arc-tool ${crtOn ? 'is-active' : ''}`}
            onMouseEnter={onIconEnter('CRT mode · C')}
            onMouseLeave={onIconLeave}
            onFocus={onIconEnter('CRT mode · C')}
            onBlur={onIconLeave}
            onClick={() => {
              onIconLeave();
              if (!running) return;
              setCrtOn((v) => {
                const next = !v;
                analytics.toggle('crt', next);
                if (next && upscaleOn) {
                  setUpscaleOn(false);
                  analytics.toggle('upscale', false);
                }
                return next;
              });
            }}
            disabled={!running}
            aria-label="CRT mode"
            type="button"
          >
            <Icon name="tv" size={18} />
          </button>

          <div className="arc-tools-divider" />

          {/* Capture group — produces output files */}
          <ToolBtn
            icon="snapshot"
            label={t.snapshot}
            shortcut="S"
            onClick={takeScreenshot}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
          <ToolBtn
            icon={recording ? 'stop' : 'record'}
            label={recording ? t.stop : t.record}
            shortcut="R / Space"
            active={recording}
            onClick={() => (recording ? stopRecording() : startRecording())}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
          <ToolBtn
            icon="mic"
            label={t.recordMic}
            shortcut="V"
            active={micOn}
            onClick={() => {
              setMicOn((v) => {
                analytics.toggle('mic', !v);
                return !v;
              });
            }}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />

          <div className="arc-tools-divider" />

          {/* PiP — separate group: webcam adds an entirely new stream / overlay.
              The popover is the full PiP control surface (Input 2 home): video
              source, mic source, resolution, framerate, swap. Settings popover
              only handles main / Input 1. */}
          <div className="arc-tool-popover-wrap arc-pip-wrap">
            <ToolBtn
              icon="webcam"
              label={t.webcamPip}
              shortcut="P"
              active={pipOn}
              onClick={() => {
                setPipOn((v) => {
                  analytics.toggle('pip', !v);
                  return !v;
                });
              }}
              disabled={!running}
              onTooltipEnter={onIconEnter}
              onTooltipLeave={onIconLeave}
            />
            {pipOn && (
            <div
              className="arc-tool-popover arc-pip-popover"
              role="group"
              aria-label="PiP settings"
            >
              <div className="arc-pip-popover-head">
                <span className="arc-pip-meta-label">PiP Input</span>
              </div>
              <div className="arc-pip-popover-grid">
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
                <SettingRow label={t.resolution}>
                  <select
                    value={pipResolution}
                    onChange={(e) => setPipResolution(e.target.value)}
                  >
                    {RESOLUTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label={t.frameRate}>
                  <select
                    value={pipFps}
                    onChange={(e) => setPipFps(Number(e.target.value))}
                  >
                    {FPS_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f} fps
                      </option>
                    ))}
                  </select>
                </SettingRow>
              </div>
              <button
                className="arc-swap"
                onClick={swapInputs}
                type="button"
              >
                <Icon name="swap" size={14} />
                <span>Swap inputs</span>
              </button>
            </div>
            )}
          </div>

          <div className="arc-ticker-slot">
            {!tickerDismissed && (
              <>
                <NewsTicker />
                <button
                  className="arc-ticker-close"
                  onClick={dismissTicker}
                  aria-label="Hide news ticker"
                  title="Hide news ticker"
                  type="button"
                >
                  <Icon name="close" size={11} />
                </button>
              </>
            )}
          </div>

          <ToolBtn
            icon="fullscreen"
            label={isFullscreen ? `Exit ${t.fullscreen.toLowerCase()}` : t.fullscreen}
            shortcut="F"
            onClick={toggleFullscreen}
            disabled={!running}
            onTooltipEnter={onIconEnter}
            onTooltipLeave={onIconLeave}
          />
        </div>
      </footer>

      {/* Hidden monitoring sink — game audio plays here directly for the
          lowest browser-side latency. Web Audio is reserved for the
          recording mix, where latency doesn't matter. */}
      <audio ref={audioMonitorRef} autoPlay playsInline style={{ display: 'none' }} />

      {faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}

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

// Tips & FAQ — accessible from the idle screen via "Help & tips" link.
// Collapsible sections via native <details>. Content kept in one place so
// it's easy to update.
const FAQ_SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Image looks blurry or has a depth-of-field effect',
    body: (
      <>
        <p>
          On <strong>macOS</strong>, system video effects apply to all camera input —
          including capture cards. Click the <strong>green camera dot</strong> in
          your menu bar (or open Control Center → Video Effects) and turn{' '}
          <strong>Portrait, Center Stage, and Studio Light all OFF</strong>.
        </p>
        <p>
          On <strong>Windows</strong>, check that no other app (Microsoft Teams,
          Snap Camera, NVIDIA Broadcast) is applying effects to your capture card.
        </p>
      </>
    ),
  },
  {
    title: 'How to reduce latency',
    body: (
      <ul>
        <li>
          <strong>Use uncompressed modes.</strong> Look for{' '}
          <em>● Uncompressed</em> in Settings → Resolution / Frame rate. 1080p@60
          is the sweet spot.
        </li>
        <li>
          <strong>Plug your laptop in.</strong> Battery saver throttles CPU/GPU
          and can add 20+ ms.
        </li>
        <li>
          <strong>Use wired headphones or laptop speakers.</strong> Bluetooth
          adds 80–200 ms of audio latency.
        </li>
        <li>
          <strong>Close other browser tabs and audio apps.</strong> They share
          GPU and audio buffers.
        </li>
        <li>
          <strong>Use Chrome, Edge, or Arc.</strong> Best WebRTC + capture
          performance.
        </li>
      </ul>
    ),
  },
  {
    title: 'Capture card not detected',
    body: (
      <ul>
        <li>
          Plug into a <strong>USB 3.0 or higher</strong> port (often blue inside
          on PCs; any USB-C on modern Macs works).
        </li>
        <li>
          Try a different port — laptop ports can route through different USB
          controllers.
        </li>
        <li>
          After plugging in, <strong>reload the page</strong>.
        </li>
        <li>Grant camera and microphone permission when prompted.</li>
        <li>
          On Mac: System Settings → Privacy & Security → Camera/Microphone →
          confirm your browser is allowed.
        </li>
      </ul>
    ),
  },
  {
    title: 'Audio is delayed or echoey',
    body: (
      <ul>
        <li>Disable system video effects (see top section above).</li>
        <li>
          Switch from Bluetooth to wired audio — Bluetooth adds 80+ ms.
        </li>
        <li>
          If recording with the mic on, use headphones to keep game audio out
          of your voice track.
        </li>
        <li>
          Close other audio apps (Discord, Music, Zoom) — they share OS audio
          buffers.
        </li>
      </ul>
    ),
  },
  {
    title: 'Recording — where do files go, what format?',
    body: (
      <ul>
        <li>
          Recordings save to your browser's default downloads folder as{' '}
          <strong>MP4</strong> (Chrome / Edge / Arc) or <strong>WebM</strong>{' '}
          (Firefox).
        </li>
        <li>
          What you see is what you record: mirror, image adjustments, and the
          PiP webcam are all baked into the saved file.
        </li>
        <li>Bitrate is 20 Mbps — high quality 1080p60 takes ~150 MB/min.</li>
      </ul>
    ),
  },
  {
    title: 'Browser support',
    body: (
      <ul>
        <li>
          <strong>Best:</strong> Chrome 100+, Edge, Arc, Opera
        </li>
        <li>
          <strong>Good:</strong> Safari 16+, Firefox 108+ (a few features are
          limited)
        </li>
        <li>
          <strong>iPad (USB-C):</strong> works in Safari — M-series and recent
          A-series iPads mount UVC capture cards natively.
        </li>
        <li>
          <strong>iPhone:</strong> not supported. iPhone's USB-C port is
          power + DisplayPort-out only and doesn't expose UVC devices.
        </li>
      </ul>
    ),
  },
  {
    title: 'Installing as an app (offline use)',
    body: (
      <>
        <p>
          Genki Arcade can be installed as a standalone desktop / tablet app —
          dock icon, no browser chrome, works offline after the first visit.
          Game audio + capture work exactly like in the browser tab.
        </p>
        <ul>
          <li>
            <strong>Chrome / Edge / Brave (Mac, Windows, Android):</strong>{' '}
            click the small <em>• Install app</em> link in the bottom-right of
            the idle screen, or use the browser's address-bar install icon.
          </li>
          <li>
            <strong>Safari on macOS Sonoma+ (Safari 17+):</strong> Safari menu
            bar → <strong>File</strong> → <strong>Add to Dock…</strong>. Apple
            doesn't expose an install API to websites, so the menu is the only
            path.
          </li>
          <li>
            <strong>iPad Safari (USB-C iPads):</strong> tap{' '}
            <strong>Share</strong> (square with up-arrow) → scroll down →{' '}
            <strong>Add to Home Screen</strong>. Capture inside an installed
            iPadOS PWA requires <strong>iPadOS 16.4 or later</strong>.
          </li>
          <li>
            <strong>iPhone:</strong> not supported. iPhone's USB-C port doesn't
            expose UVC capture devices like iPad's does (it's power +
            DisplayPort only), so installing the app on iPhone wouldn't get
            you a working capture pipeline. iPad with USB-C is the iOS device
            that can actually capture.
          </li>
        </ul>
        <p>
          To uninstall: on macOS / Windows, right-click the app icon → Uninstall.
          On iPad, long-press the icon → Remove App.
        </p>
      </>
    ),
  },
  {
    title: 'Streaming to Twitch / YouTube / X',
    body: (
      <p>
        For streaming we recommend <strong>Camo Studio</strong> — our partner
        for fast, friendly streaming. It picks up Genki Arcade as a source and
        gets you on stream in seconds, with reliable performance across
        Twitch, YouTube, and X.{' '}
        <a
          href="https://reincubate.com/camo/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get Camo Studio →
        </a>
      </p>
    ),
  },
  {
    title: 'Privacy',
    body: (
      <p>
        Genki Arcade runs entirely in your browser. No video, audio, or session
        data is ever sent to a server. Settings persist locally only.
      </p>
    ),
  },
];

function FaqModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="arc-faq-backdrop" onClick={onClose}>
      <div className="arc-faq-modal" onClick={(e) => e.stopPropagation()}>
        <div className="arc-faq-head">
          <span className="arc-eyebrow">Tips & FAQ</span>
          <button className="arc-faq-close" onClick={onClose} aria-label="Close" type="button">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="arc-faq-body">
          {FAQ_SECTIONS.map((section, i) => (
            <details key={i} className="arc-faq-section" open={i === 0}>
              <summary>{section.title}</summary>
              <div className="arc-faq-content">{section.body}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

// `beforeinstallprompt` event shape — TS lib doesn't have it yet because
// it's still a Chromium-specific extension to the web spec.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The inline script in index.html stashes the event on window under this
// key, dispatching 'pwa-install-ready' when it fires. We mirror the same
// global here so the hook can read it on mount without a race against the
// async event.
declare global {
  interface Window {
    __pwaInstallEvent?: BeforeInstallPromptEvent | null;
  }
}

// Hook: tracks whether the browser can install this app as a PWA.
// Returns `install()` that fires the OS-level install dialog. Only fires
// on Chromium-family browsers (Chrome, Edge, Brave) on desktop + Android.
// Safari users get nothing here — we surface a static FAQ entry for the
// iOS / Mac Safari "Add to Home Screen" path instead.
//
// Race-safety: Chrome fires beforeinstallprompt exactly once per page load,
// asynchronously. On first visits with cold caches, the event sometimes
// fires before React has mounted — the inline bootstrap in index.html
// catches it on window.__pwaInstallEvent so this hook can pick it up
// regardless of mount timing.
function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.__pwaInstallEvent ?? null;
  });
  const [installed, setInstalled] = useState<boolean>(() => {
    // display-mode: standalone is true when the app was launched from an
    // installed PWA icon (vs. a normal browser tab). Hides the button for
    // users who've already installed it.
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  });

  useEffect(() => {
    // Re-check the stash in case the event fired between the useState
    // initializer and the effect attaching.
    if (window.__pwaInstallEvent && !event) {
      setEvent(window.__pwaInstallEvent);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome from showing its own mini-infobar
      setEvent(e as BeforeInstallPromptEvent);
    };
    // The bootstrap script in index.html dispatches this when it stashes
    // a late-arriving event — covers the same-tick race where the event
    // fires *between* our useState initializer and this listener attach.
    const onReady = () => {
      if (window.__pwaInstallEvent) setEvent(window.__pwaInstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
      window.__pwaInstallEvent = null;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('pwa-install-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('pwa-install-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
    // Intentionally empty deps: we want a stable subscription. `event`
    // re-reads happen via the listeners, not by re-running the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // Single-use event — once prompted, Chrome won't refire it for this
    // session. Clear our reference (and the window stash) so the button
    // hides until next page load.
    setEvent(null);
    window.__pwaInstallEvent = null;
    if (outcome === 'accepted') setInstalled(true);
  }, [event]);

  return { canInstall: !!event && !installed, installed, install };
}

// Apple's WebKit browsers don't implement beforeinstallprompt — install is
// a user-initiated menu action only. Detect them so we can offer a
// "show me how" button + modal instead of just hiding the install CTA.
//
// Returns:
//   'macos-safari' — macOS Safari 17+, install via File → Add to Dock…
//   'ipad'         — iPadOS, install via Share → Add to Home Screen
//   null           — anything else (including iPhone, see below)
//
// iPhone is intentionally excluded even though it can technically install
// PWAs. Reason: iPhone's USB-C port doesn't expose UVC like iPad's does
// (it's power + DisplayPort only). The app's whole purpose is capture, so
// offering install on iPhone would land users with a non-functional shell.
// iPad with USB-C does mount UVC capture cards and is a legitimate target.
//
// Excludes Chrome/Firefox/Edge running on iOS (CriOS/FxiOS/EdgiOS — they're
// WebKit-backed but skinned differently). iPadOS 13+ identifies itself as
// Mac, so we sniff touch support to disambiguate.
function detectSafariInstallContext(): 'macos-safari' | 'ipad' | null {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return null;
  const ua = navigator.userAgent;
  const isAlreadyInstalled =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS legacy flag
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (isAlreadyInstalled) return null;

  // iPad detection: either explicit /iPad/ in UA (older iPadOS), or
  // iPadOS 13+ trick where Safari claims MacIntel + multi-touch.
  const isIPad =
    /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' &&
      ((navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints || 0) > 1);
  if (isIPad) return 'ipad';

  // iPhone / iPod: deliberately return null. The capture story doesn't work.
  if (/iPhone|iPod/i.test(ua)) return null;

  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg\//i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua);
  if (isSafari && isMac) return 'macos-safari';
  return null;
}

function InstallButton() {
  const { canInstall, install } = useInstallPrompt();
  const [safariCtx] = useState<'macos-safari' | 'ipad' | null>(() =>
    detectSafariInstallContext(),
  );
  const [safariModalOpen, setSafariModalOpen] = useState(false);

  if (canInstall) {
    // Chromium path — prompt() opens the OS install dialog directly.
    return (
      <button
        className="arc-faq-trigger arc-install-trigger"
        onClick={install}
        type="button"
        title="Install Genki Arcade as a standalone app"
      >
        Install app
      </button>
    );
  }
  if (safariCtx) {
    // Safari / iOS path — open a modal that walks the user through the
    // manual menu steps (Apple doesn't expose a programmatic install API).
    return (
      <>
        <button
          className="arc-faq-trigger arc-install-trigger"
          onClick={() => setSafariModalOpen(true)}
          type="button"
          title="Install Genki Arcade as a standalone app"
        >
          Install app
        </button>
        {safariModalOpen && (
          <SafariInstallModal
            platform={safariCtx}
            onClose={() => setSafariModalOpen(false)}
          />
        )}
      </>
    );
  }
  return null;
}

function SafariInstallModal({
  platform,
  onClose,
}: {
  platform: 'macos-safari' | 'ipad';
  onClose: () => void;
}) {
  // Reuses the FaqModal class structure (.arc-faq-backdrop /
  // .arc-faq-modal / .arc-faq-head / .arc-faq-body /
  // .arc-faq-section[details]) so the existing styles cover us — no new
  // CSS needed. Content is purely instructional.
  const isIPad = platform === 'ipad';
  return (
    <div className="arc-faq-backdrop" onClick={onClose}>
      <div
        className="arc-faq-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Install Genki Arcade"
      >
        <div className="arc-faq-head">
          <span className="arc-eyebrow">Install Genki Arcade</span>
          <button
            className="arc-faq-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="arc-faq-body">
          <details className="arc-faq-section" open>
            <summary>
              {isIPad
                ? 'Add to Home Screen (iPad)'
                : 'Add to Dock (macOS Safari)'}
            </summary>
            <div className="arc-faq-content">
              {isIPad ? (
                <ol>
                  <li>
                    Tap the <strong>Share</strong> button — the square with the
                    up arrow, at the top right of the screen.
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Confirm the name (default: <em>Arcade</em>) and tap{' '}
                    <strong>Add</strong>.
                  </li>
                  <li>
                    The cabinet icon appears on your Home Screen. Launching it
                    opens Genki Arcade as a standalone app with no Safari
                    chrome.
                  </li>
                </ol>
              ) : (
                <ol>
                  <li>
                    In Safari's menu bar, click <strong>File</strong>.
                  </li>
                  <li>
                    Choose <strong>Add to Dock…</strong> (Safari 17 or later on
                    macOS Sonoma+).
                  </li>
                  <li>
                    Confirm the name (default: <em>Genki Arcade</em>) and click{' '}
                    <strong>Add</strong>.
                  </li>
                  <li>
                    The cabinet icon appears in your Dock. Click it to launch
                    as a standalone window with no Safari chrome.
                  </li>
                </ol>
              )}
            </div>
          </details>
          {isIPad && (
            <details className="arc-faq-section" open>
              <summary>One note on capture</summary>
              <div className="arc-faq-content">
                <p>
                  Capture works on <strong>USB-C iPads</strong> (M-series and
                  recent A-series — they mount UVC capture cards natively).
                  Older Lightning-port iPads can't connect a ShadowCast at
                  all, so installing on those isn't useful.
                </p>
                <p>
                  Camera and microphone access inside an installed iPadOS PWA
                  requires <strong>iPadOS 16.4 or later</strong>. Older
                  versions install fine but can't capture video.
                </p>
              </div>
            </details>
          )}
          <details className="arc-faq-section">
            <summary>Looking for the one-click install?</summary>
            <div className="arc-faq-content">
              <p>
                Apple doesn't expose a programmatic install API to websites —
                only Safari's menu can do it. If you'd rather click a button,
                open Genki Arcade in{' '}
                <strong>Chrome, Edge, or Brave</strong> and use the{' '}
                <em>Install app</em> link there instead.
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function BuildStamp() {
  // Format the build-time ISO in the user's locale + timezone. Passing
  // `undefined` for the locale lets the browser pick (so international
  // visitors get their native date format), and timeZoneName: 'short'
  // tags the result with the zone abbreviation (PDT / EDT / GMT+8 etc)
  // so it's unambiguous that the time shown is local to the viewer, not
  // the server.
  let label = 'Build unknown';
  try {
    const d = new Date(__BUILD_TIME__);
    label = d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    /* ignore */
  }
  return <div className="arc-build-stamp">Build · {label}</div>;
}

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
      {item.headline &&
        (item.headline.href ? (
          <a
            className="arc-ticker-user"
            href={item.headline.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {item.headline.label}
          </a>
        ) : (
          <span className="arc-ticker-user">{item.headline.label}</span>
        ))}
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

// Single label + range slider + numeric readout for the Color section.
// Step is fixed at 0.05 — finer than that is below the perceptual JND for
// these filters, so it's just decoration. Numeric value gives precise
// feedback so users can land on a remembered tuning.
function ColorSlider({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="arc-color-row">
      <span className="arc-color-row-label">{label}</span>
      <input
        type="range"
        className="arc-color-slider"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="arc-color-row-value">{value.toFixed(2)}</span>
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
  /** Optional keyboard shortcut letter — appended to the tooltip label as
   * "Snapshot · S". Doesn't actually wire the shortcut here; the app-level
   * listener handles dispatch. This is purely the visible affordance. */
  shortcut?: string;
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
  shortcut,
}: ToolBtnProps) {
  const tipLabel = shortcut ? `${label} · ${shortcut}` : label;
  const enterHandler = onTooltipEnter ? onTooltipEnter(tipLabel) : undefined;
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

type UpsellVariant = 'default' | 'legacy' | 'switcher';

function UpsellCard({
  t,
  variant,
  onDismiss,
}: {
  t: ReturnType<typeof useTranslation>;
  variant: UpsellVariant;
  onDismiss: () => void;
}) {
  // Three variants, picked upstream from the detected capture device.
  // Both discounted variants share the same June 15 expiration line —
  // it reads as time-limited rather than evergreen "buy our thing."
  let eyebrow: string;
  let title: string;
  let body: string;
  let cta: string;
  let href: string;
  let showExpiry = false;
  if (variant === 'legacy') {
    eyebrow = 'Thank you';
    title = 'Trade up to ShadowCast 3.';
    body =
      '$15 off as a thanks for using ShadowCast over the years. Smaller, faster, 4K@60 passthrough.';
    cta = 'Claim $15 off';
    href = SHADOWCAST3_UPGRADE_URL;
    showExpiry = true;
  } else if (variant === 'switcher') {
    eyebrow = 'Make the switch';
    title = 'Why ShadowCast 3?';
    body =
      "Pocket-sized, 4K@60 passthrough, lower latency. $10 off to see why we're a bit obsessed with it.";
    cta = 'Claim $10 off';
    href = SHADOWCAST3_SWITCHER_URL;
    showExpiry = true;
  } else {
    eyebrow = t.upsellEyebrow;
    title = t.upsellTitle;
    body = t.upsellBody;
    cta = t.upsellCta;
    href = SHOPIFY_SHADOWCAST3_URL;
  }

  return (
    <div className={`arc-upsell arc-upsell-${variant}`}>
      <div className="arc-upsell-img">
        <img src={sc3CableUrl} alt="ShadowCast 3" />
        <div className="arc-upsell-glow" />
      </div>
      <div className="arc-upsell-body">
        <div className="arc-upsell-eyebrow">
          <span className="arc-upsell-glyph">◆</span>
          <span>{eyebrow}</span>
        </div>
        <div className="arc-upsell-title">{title}</div>
        <div className="arc-upsell-sub">{body}</div>
        {showExpiry && <div className="arc-upsell-expiry">{UPSELL_EXPIRES_LABEL}</div>}
      </div>
      <div className="arc-upsell-actions">
        <a
          className="arc-upsell-cta"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => analytics.upsellClicked()}
        >
          <span>{cta}</span>
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
  upsellVariant,
  onDismissUpsell,
}: {
  t: ReturnType<typeof useTranslation>;
  showUpsell: boolean;
  upsellVariant: UpsellVariant;
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
        {showUpsell && (
          <UpsellCard t={t} variant={upsellVariant} onDismiss={onDismissUpsell} />
        )}
      </div>
    </div>
  );
}
