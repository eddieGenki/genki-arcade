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

// Stable anonymous visitor ID. Random UUID, persisted in localStorage,
// no PII — just lets us answer "how many sessions does the same browser
// kick off over time" via property breakdown on session_started. Vercel
// doesn't have native cohort analytics, but grouping any event by
// visitor_id gives a usable approximation (top visitors by event count).
function getVisitorId(): string {
  try {
    let id = localStorage.getItem('arcadeVisitorId');
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('arcadeVisitorId', id);
    }
    return id;
  } catch {
    return 'anon';
  }
}
const VISITOR_ID = getVisitorId();

// Resolution + fps as one combined string ("1080p60", "4K30", etc) so
// the dashboard can group by single-property combo instead of having
// to cross-tabulate two properties.
function comboLabel(resolution: string, fps: number): string {
  const [w, h] = resolution.split('x').map(Number);
  let res: string;
  if (w >= 7680 || h >= 4320) res = '8K';
  else if (w >= 3840 || h >= 2160) res = '4K';
  else if (h >= 1440) res = '1440p';
  else if (h >= 1080) res = '1080p';
  else if (h >= 720) res = '720p';
  else if (h >= 480) res = '480p';
  else res = `${w}x${h}`;
  return `${res}${fps}`;
}

// Bucket a duration in seconds into a small fixed set of human-readable
// buckets. Vercel groups numeric properties as histograms but doesn't
// always show clean averages — this lets the dashboard surface "what
// percentage of sessions are short / long" at a glance.
function durationBucket(s: number): string {
  if (s < 60) return '0-1min';
  if (s < 120) return '1-2min';
  if (s < 600) return '2-10min';
  if (s < 1800) return '10-30min';
  if (s < 3600) return '30-60min';
  if (s < 7200) return '1-2hr';
  return '2hr+';
}

// Truncate a string to a safe length for an analytics property.
function trim(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// All events get `visitor_id` and `os` attached so any per-event
// drilldown can be sliced by who (anonymous) and where.
const baseProps = () => ({ visitor_id: VISITOR_ID, os: OS });

export const analytics = {
  sessionStarted(props: {
    device: string | undefined;
    resolution: string;
    fps: number;
    format: 'uncompressed' | 'mjpg';
  }) {
    track('session_started', {
      ...baseProps(),
      device_class: deviceClass(props.device),
      resolution: props.resolution,
      fps: props.fps,
      combo: comboLabel(props.resolution, props.fps),
      format: props.format,
    });
  },

  sessionEnded(props: {
    device: string | undefined;
    duration_s: number;
    recordings: number;
    screenshots: number;
  }) {
    const seconds = Math.round(props.duration_s);
    track('session_ended', {
      ...baseProps(),
      device_class: deviceClass(props.device),
      duration_s: seconds,
      duration_bucket: durationBucket(seconds),
      recordings: props.recordings,
      screenshots: props.screenshots,
    });
  },

  streamConfig(props: {
    device: string | undefined;
    resolution: string;
    fps: number;
    format: 'uncompressed' | 'mjpg';
  }) {
    track('stream_config', {
      ...baseProps(),
      device_class: deviceClass(props.device),
      resolution: props.resolution,
      fps: props.fps,
      combo: comboLabel(props.resolution, props.fps),
      format: props.format,
    });
  },

  formatDetected(props: {
    device: string | undefined;
    decoded: string;
    bucket: 'uncompressed' | 'mjpg';
  }) {
    track('format_detected', {
      ...baseProps(),
      device_class: deviceClass(props.device),
      decoded: props.decoded,
      bucket: props.bucket,
    });
  },

  recordingCompleted(props: { duration_s: number }) {
    track('recording_completed', {
      ...baseProps(),
      duration_s: Math.round(props.duration_s),
    });
  },

  screenshotTaken() {
    track('screenshot_taken', baseProps());
  },

  toggle(name: 'pip' | 'upscale' | 'crt' | 'chromacast' | 'mic', on: boolean) {
    track('toggle', { ...baseProps(), feature: name, on });
  },

  errorOccurred(msg: string) {
    track('error_occurred', { ...baseProps(), message: trim(msg) });
  },

  permissionDenied(reason: string) {
    track('permission_denied', { ...baseProps(), reason: trim(reason) });
  },

  upsellClicked() {
    track('upsell_clicked', baseProps());
  },

  upsellDismissed() {
    track('upsell_dismissed', baseProps());
  },
};
