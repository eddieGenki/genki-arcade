// Vercel Analytics event wrapper. Custom events require the Vercel Pro plan.
// On Hobby tier the calls below no-op silently — safe to ship either way.
//
// All event payloads are bucketed / truncated so we never send raw device
// labels (they include serial-number-ish suffixes like '(32ed:3701)') or
// long error strings. Values must be primitives; Vercel's schema rejects
// objects/arrays.

import { track } from '@vercel/analytics';

export type DeviceClass =
  | 'shadowcast-3'
  | 'shadowcast'
  | 'genki-other'
  | 'virtual'
  | 'other'
  | 'none';

const VIRTUAL_RE =
  /\b(camo|reincubate|virtual cam(era)?|obs.*virtual|snap camera|nvidia broadcast|manycam|xsplit|ndi)\b/i;

export function deviceClass(label: string | undefined | null): DeviceClass {
  if (!label) return 'none';
  const l = label.toLowerCase();
  if (/shadowcast\s*3/.test(l)) return 'shadowcast-3';
  if (/shadowcast|genki/.test(l) && !/shadowcast\s*3/.test(l)) {
    return /genki/.test(l) && !/shadowcast/.test(l) ? 'genki-other' : 'shadowcast';
  }
  if (VIRTUAL_RE.test(l)) return 'virtual';
  return 'other';
}

function osName(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/Mac|iPhone|iPad/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

const OS = osName();

// Truncate a string to a safe length for an analytics property.
function trim(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export const analytics = {
  sessionStarted(props: {
    device: string | undefined;
    resolution: string;
    fps: number;
    format: 'uncompressed' | 'mjpg';
  }) {
    track('session_started', {
      device_class: deviceClass(props.device),
      resolution: props.resolution,
      fps: props.fps,
      format: props.format,
      os: OS,
    });
  },

  sessionEnded(props: {
    device: string | undefined;
    duration_s: number;
    recordings: number;
    screenshots: number;
  }) {
    track('session_ended', {
      device_class: deviceClass(props.device),
      duration_s: Math.round(props.duration_s),
      recordings: props.recordings,
      screenshots: props.screenshots,
      os: OS,
    });
  },

  streamConfig(props: {
    device: string | undefined;
    resolution: string;
    fps: number;
    format: 'uncompressed' | 'mjpg';
  }) {
    track('stream_config', {
      device_class: deviceClass(props.device),
      resolution: props.resolution,
      fps: props.fps,
      format: props.format,
      os: OS,
    });
  },

  formatDetected(props: {
    device: string | undefined;
    decoded: string;
    bucket: 'uncompressed' | 'mjpg';
  }) {
    track('format_detected', {
      device_class: deviceClass(props.device),
      decoded: props.decoded,
      bucket: props.bucket,
      os: OS,
    });
  },

  recordingCompleted(props: { duration_s: number }) {
    track('recording_completed', { duration_s: Math.round(props.duration_s) });
  },

  screenshotTaken() {
    track('screenshot_taken');
  },

  toggle(name: 'pip' | 'upscale' | 'crt' | 'chromacast' | 'mic', on: boolean) {
    track('toggle', { feature: name, on });
  },

  errorOccurred(msg: string) {
    track('error_occurred', { message: trim(msg) });
  },

  permissionDenied(reason: string) {
    track('permission_denied', { reason: trim(reason) });
  },

  upsellClicked() {
    track('upsell_clicked');
  },

  upsellDismissed() {
    track('upsell_dismissed');
  },
};
