// Genki Arcade — translation strings.
// Phase 1 ships English only. The structure mirrors the design handoff's
// i18n.js so we can drop in zh-TW / ja / ko / es / de / fr later.

export interface Translation {
  label: string;
  flag: string;
  arcade: string;
  idle: string;
  live: string;
  rec: string;

  // Idle hero
  heroEyebrow: string;
  heroTitle: string;
  heroSub: string;
  qs1Title: string;
  qs1Body: string;
  qs2Title: string;
  qs2Body: string;
  qs3Title: string;
  qs3Body: string;
  start: string;
  resume: string;

  // Upsell
  upsellEyebrow: string;
  upsellTitle: string;
  upsellBody: string;
  upsellCta: string;

  // Toolbar tooltips / labels
  settings: string;
  videoDevice: string;
  audioInput: string;
  audioOutput: string;
  resolution: string;
  frameRate: string;
  mirror: string;
  audioPassthrough: string;
  recordMic: string;
  webcamPip: string;
  micSource: string;
  snapshot: string;
  record: string;
  stop: string;
  fullscreen: string;
  end: string;
  shadowcastConnected: string;

  // Status
  shopLink: string;
}

const en: Translation = {
  label: 'English',
  flag: 'EN',
  arcade: 'Arcade',
  idle: 'Idle',
  live: 'Live',
  rec: 'REC',

  heroEyebrow: 'Browser-based capture',
  heroTitle: 'Equip your journey.',
  heroSub:
    "Plug in your capture card and play any console, anywhere — no install, no account, no nonsense.",
  qs1Title: 'Plug in',
  qs1Body:
    "Connect your capture card to your console's HDMI out, then USB-C into this device.",
  qs2Title: 'Press start',
  qs2Body: 'Click the Start button in the upper-right.',
  qs3Title: 'Allow access',
  qs3Body:
    "Grant camera and microphone permission when prompted. We'll route audio passthrough automatically.",
  start: 'Start',
  resume: 'Resume',

  upsellEyebrow: 'Power up',
  upsellTitle: 'Equip the ShadowCast 3.',
  upsellBody:
    "Lower latency, 4K passthrough, and the smallest capture card you'll ever own.",
  upsellCta: 'Shop ShadowCast 3',

  settings: 'Settings',
  videoDevice: 'Video device',
  audioInput: 'Audio input',
  audioOutput: 'Audio output',
  resolution: 'Resolution',
  frameRate: 'Frame rate',
  mirror: 'Mirror',
  audioPassthrough: 'Audio passthrough — hear game audio through speakers',
  recordMic: 'Record mic',
  webcamPip: 'Webcam picture-in-picture',
  micSource: 'Mic source',
  snapshot: 'Snapshot',
  record: 'Record',
  stop: 'Stop',
  fullscreen: 'Fullscreen',
  end: 'End',
  shadowcastConnected: 'ShadowCast connected',

  shopLink: 'genkithings.com',
};

// Future: zh-TW, ja, ko, es, de, fr — strings from the handoff's i18n.js.
export const translations: Record<string, Translation> = {
  en,
};

export function pickLanguage(): keyof typeof translations {
  if (typeof navigator === 'undefined') return 'en';
  const lang = (navigator.language || 'en').toLowerCase();
  if (lang.startsWith('zh')) return 'en'; // placeholder until zh-TW lands
  if (lang.startsWith('ja')) return 'en';
  if (lang.startsWith('ko')) return 'en';
  if (lang.startsWith('es')) return 'en';
  if (lang.startsWith('de')) return 'en';
  if (lang.startsWith('fr')) return 'en';
  return 'en';
}

export function useTranslation(lang: keyof typeof translations = 'en'): Translation {
  return translations[lang] || translations.en;
}
