// Genki Arcade — translation strings.
//
// Supported languages: English (source), Japanese, Simplified Chinese,
// Traditional Chinese, Spanish, French, German, Korean.
//
// English is the canonical set — new strings should be added there first,
// then translated. If a language is missing a key TypeScript will yell at
// compile time (all translations must implement `Translation`), so nothing
// silently falls through untranslated.
//
// Product names (ShadowCast, Genki, Nintendo, etc.) stay in Latin script
// across all locales. Console names use the local convention where one
// exists ("Switch 2" is the same worldwide) but action verbs, hero copy,
// tooltips, and CTAs are localized. Register: casual and friendly,
// matching the English voice. In JA/KO we lean informal (です・ます
// dropped where it reads more natural for a gaming context).

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

  heroEyebrow: 'Turn every screen into a playground.',
  heroTitle: 'Equip your journey.',
  heroSub:
    'Plug in your capture card and play any console, anywhere,\nno install, no account, no nonsense.',
  qs1Title: 'Plug in',
  qs1Body:
    "Connect your capture card to your console's HDMI out, then USB-C into this device.",
  qs2Title: 'Press start',
  qs2Body: 'Click the Start button in the upper-right.',
  qs3Title: 'Allow access',
  qs3Body: 'Grant camera and microphone permission when prompted.',
  start: 'Start',
  resume: 'Resume',

  upsellEyebrow: 'Power up',
  upsellTitle: 'Equip the ShadowCast 3.',
  upsellBody:
    "Lower latency, 4K passthrough, and the smallest capture card you'll ever own.",
  upsellCta: 'Equip',

  settings: 'Settings',
  videoDevice: 'Video device',
  audioInput: 'Audio input',
  audioOutput: 'Audio output',
  resolution: 'Resolution',
  frameRate: 'Frame rate',
  mirror: 'Mirror',
  audioPassthrough: 'Audio passthrough',
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

const ja: Translation = {
  label: '日本語',
  flag: 'JA',
  arcade: 'アーケード',
  idle: 'アイドル',
  live: 'ライブ',
  rec: '録画',

  heroEyebrow: 'どんな画面もプレイグラウンドに。',
  heroTitle: '装備を整えよう。',
  heroSub:
    'キャプチャーカードを挿すだけで、どこでもどのコンソールも遊べる。\nインストール不要、アカウント不要、無駄なし。',
  qs1Title: '接続する',
  qs1Body:
    'キャプチャーカードをコンソールの HDMI 出力に接続し、USB-C でこのデバイスに繋ぐ。',
  qs2Title: 'スタートを押す',
  qs2Body: '右上のスタートボタンをクリック。',
  qs3Title: 'アクセスを許可',
  qs3Body: 'プロンプトが出たらカメラとマイクの許可を。',
  start: 'スタート',
  resume: '再開',

  upsellEyebrow: 'パワーアップ',
  upsellTitle: 'ShadowCast 3 を装備しよう。',
  upsellBody:
    'より低遅延、4K パススルー、世界最小クラスのキャプチャーカード。',
  upsellCta: '装備する',

  settings: '設定',
  videoDevice: 'ビデオデバイス',
  audioInput: 'オーディオ入力',
  audioOutput: 'オーディオ出力',
  resolution: '解像度',
  frameRate: 'フレームレート',
  mirror: '左右反転',
  audioPassthrough: 'オーディオパススルー',
  recordMic: 'マイクを録音',
  webcamPip: 'ウェブカメラ PiP',
  micSource: 'マイクソース',
  snapshot: 'スナップショット',
  record: '録画',
  stop: '停止',
  fullscreen: 'フルスクリーン',
  end: '終了',
  shadowcastConnected: 'ShadowCast 接続済み',

  shopLink: 'genkithings.com',
};

const zhCN: Translation = {
  label: '简体中文',
  flag: 'CN',
  arcade: '街机',
  idle: '待机',
  live: '直播',
  rec: '录制',

  heroEyebrow: '让每一块屏幕都变成游乐场。',
  heroTitle: '整装出发。',
  heroSub:
    '插上采集卡,在任何地方玩任何主机。\n无需安装,无需账号,毫无废话。',
  qs1Title: '连接',
  qs1Body: '将采集卡连接到主机的 HDMI 输出,再用 USB-C 接到本设备。',
  qs2Title: '按下开始',
  qs2Body: '点击右上角的开始按钮。',
  qs3Title: '授权访问',
  qs3Body: '出现提示时授权摄像头和麦克风。',
  start: '开始',
  resume: '继续',

  upsellEyebrow: '升级',
  upsellTitle: '装备 ShadowCast 3。',
  upsellBody: '更低延迟、4K 直通、史上最小的采集卡。',
  upsellCta: '装备',

  settings: '设置',
  videoDevice: '视频设备',
  audioInput: '音频输入',
  audioOutput: '音频输出',
  resolution: '分辨率',
  frameRate: '帧率',
  mirror: '镜像',
  audioPassthrough: '音频直通',
  recordMic: '录制麦克风',
  webcamPip: '摄像头画中画',
  micSource: '麦克风源',
  snapshot: '截图',
  record: '录制',
  stop: '停止',
  fullscreen: '全屏',
  end: '结束',
  shadowcastConnected: 'ShadowCast 已连接',

  shopLink: 'genkithings.com',
};

const zhTW: Translation = {
  label: '繁體中文',
  flag: 'TW',
  arcade: '街機',
  idle: '待機',
  live: '直播',
  rec: '錄製',

  heroEyebrow: '讓每一塊螢幕都變成遊樂場。',
  heroTitle: '整裝出發。',
  heroSub:
    '插上擷取卡,在任何地方玩任何主機。\n無需安裝,無需帳號,毫無廢話。',
  qs1Title: '連接',
  qs1Body: '將擷取卡連接到主機的 HDMI 輸出,再用 USB-C 接到本裝置。',
  qs2Title: '按下開始',
  qs2Body: '點擊右上角的開始按鈕。',
  qs3Title: '授權存取',
  qs3Body: '出現提示時授權攝影機和麥克風。',
  start: '開始',
  resume: '繼續',

  upsellEyebrow: '升級',
  upsellTitle: '裝備 ShadowCast 3。',
  upsellBody: '更低延遲、4K 直通、史上最小的擷取卡。',
  upsellCta: '裝備',

  settings: '設定',
  videoDevice: '視訊裝置',
  audioInput: '音訊輸入',
  audioOutput: '音訊輸出',
  resolution: '解析度',
  frameRate: '幀率',
  mirror: '鏡像',
  audioPassthrough: '音訊直通',
  recordMic: '錄製麥克風',
  webcamPip: '攝影機子母畫面',
  micSource: '麥克風來源',
  snapshot: '截圖',
  record: '錄製',
  stop: '停止',
  fullscreen: '全螢幕',
  end: '結束',
  shadowcastConnected: 'ShadowCast 已連接',

  shopLink: 'genkithings.com',
};

const es: Translation = {
  label: 'Español',
  flag: 'ES',
  arcade: 'Arcade',
  idle: 'Inactivo',
  live: 'En vivo',
  rec: 'REC',

  heroEyebrow: 'Convierte cualquier pantalla en un patio de juegos.',
  heroTitle: 'Equipa tu viaje.',
  heroSub:
    'Conecta tu tarjeta de captura y juega en cualquier consola, en cualquier lugar,\nsin instalación, sin cuenta, sin tonterías.',
  qs1Title: 'Conecta',
  qs1Body:
    'Conecta tu tarjeta de captura a la salida HDMI de tu consola y por USB-C a este dispositivo.',
  qs2Title: 'Pulsa Empezar',
  qs2Body: 'Haz clic en el botón Empezar en la esquina superior derecha.',
  qs3Title: 'Da acceso',
  qs3Body: 'Concede permiso a la cámara y al micrófono cuando se te pida.',
  start: 'Empezar',
  resume: 'Reanudar',

  upsellEyebrow: 'Nivel superior',
  upsellTitle: 'Equipa la ShadowCast 3.',
  upsellBody:
    'Menor latencia, paso 4K y la tarjeta de captura más pequeña que tendrás.',
  upsellCta: 'Equipar',

  settings: 'Ajustes',
  videoDevice: 'Dispositivo de vídeo',
  audioInput: 'Entrada de audio',
  audioOutput: 'Salida de audio',
  resolution: 'Resolución',
  frameRate: 'Cuadros por segundo',
  mirror: 'Espejo',
  audioPassthrough: 'Paso de audio',
  recordMic: 'Grabar micrófono',
  webcamPip: 'Cámara en imagen sobre imagen',
  micSource: 'Fuente del micrófono',
  snapshot: 'Captura',
  record: 'Grabar',
  stop: 'Detener',
  fullscreen: 'Pantalla completa',
  end: 'Terminar',
  shadowcastConnected: 'ShadowCast conectado',

  shopLink: 'genkithings.com',
};

const fr: Translation = {
  label: 'Français',
  flag: 'FR',
  arcade: 'Arcade',
  idle: 'Inactif',
  live: 'En direct',
  rec: 'REC',

  heroEyebrow: 'Transforme chaque écran en terrain de jeu.',
  heroTitle: "Équipe-toi pour l'aventure.",
  heroSub:
    "Branche ta carte d'acquisition et joue sur n'importe quelle console, n'importe où,\npas d'installation, pas de compte, pas de blabla.",
  qs1Title: 'Branche',
  qs1Body:
    "Connecte ta carte d'acquisition à la sortie HDMI de ta console, puis en USB-C à cet appareil.",
  qs2Title: 'Appuie sur Démarrer',
  qs2Body: 'Clique sur le bouton Démarrer en haut à droite.',
  qs3Title: "Autorise l'accès",
  qs3Body: "Accorde l'accès à la caméra et au micro quand on te le demande.",
  start: 'Démarrer',
  resume: 'Reprendre',

  upsellEyebrow: 'Passe au niveau supérieur',
  upsellTitle: 'Équipe la ShadowCast 3.',
  upsellBody:
    "Latence réduite, passthrough 4K, et la plus petite carte d'acquisition que tu posséderas.",
  upsellCta: 'Équiper',

  settings: 'Paramètres',
  videoDevice: 'Périphérique vidéo',
  audioInput: 'Entrée audio',
  audioOutput: 'Sortie audio',
  resolution: 'Résolution',
  frameRate: 'Fréquence',
  mirror: 'Miroir',
  audioPassthrough: 'Passthrough audio',
  recordMic: 'Enregistrer le micro',
  webcamPip: 'Webcam en incrustation',
  micSource: 'Source du micro',
  snapshot: 'Capture',
  record: 'Enregistrer',
  stop: 'Arrêter',
  fullscreen: 'Plein écran',
  end: 'Terminer',
  shadowcastConnected: 'ShadowCast connectée',

  shopLink: 'genkithings.com',
};

const de: Translation = {
  label: 'Deutsch',
  flag: 'DE',
  arcade: 'Arcade',
  idle: 'Inaktiv',
  live: 'Live',
  rec: 'REC',

  heroEyebrow: 'Verwandle jeden Bildschirm in einen Spielplatz.',
  heroTitle: 'Rüste dich für die Reise.',
  heroSub:
    'Schließ deine Capture Card an und spiel jede Konsole, überall –\nkeine Installation, kein Konto, kein Schnickschnack.',
  qs1Title: 'Anschließen',
  qs1Body:
    'Verbinde deine Capture Card mit dem HDMI-Ausgang der Konsole und per USB-C mit diesem Gerät.',
  qs2Title: 'Start drücken',
  qs2Body: 'Klick oben rechts auf den Start-Button.',
  qs3Title: 'Zugriff erlauben',
  qs3Body: 'Erlaube Kamera und Mikrofon, wenn du gefragt wirst.',
  start: 'Start',
  resume: 'Fortsetzen',

  upsellEyebrow: 'Aufrüsten',
  upsellTitle: 'Rüste die ShadowCast 3 aus.',
  upsellBody:
    'Weniger Latenz, 4K-Passthrough und die kleinste Capture Card, die du je besitzt.',
  upsellCta: 'Ausrüsten',

  settings: 'Einstellungen',
  videoDevice: 'Videogerät',
  audioInput: 'Audioeingang',
  audioOutput: 'Audioausgang',
  resolution: 'Auflösung',
  frameRate: 'Bildrate',
  mirror: 'Spiegeln',
  audioPassthrough: 'Audio-Passthrough',
  recordMic: 'Mikro aufnehmen',
  webcamPip: 'Webcam-Bild-in-Bild',
  micSource: 'Mikroquelle',
  snapshot: 'Schnappschuss',
  record: 'Aufnehmen',
  stop: 'Stopp',
  fullscreen: 'Vollbild',
  end: 'Beenden',
  shadowcastConnected: 'ShadowCast verbunden',

  shopLink: 'genkithings.com',
};

const ko: Translation = {
  label: '한국어',
  flag: 'KR',
  arcade: '아케이드',
  idle: '대기',
  live: '라이브',
  rec: '녹화',

  heroEyebrow: '모든 화면을 놀이터로.',
  heroTitle: '장비를 갖추자.',
  heroSub:
    '캡처 카드를 꽂고 어떤 콘솔이든 어디서든 플레이.\n설치 없이, 계정 없이, 잡음 없이.',
  qs1Title: '연결',
  qs1Body: '캡처 카드를 콘솔의 HDMI 출력에 연결하고, USB-C로 이 기기에 꽂자.',
  qs2Title: '시작 누르기',
  qs2Body: '오른쪽 위의 시작 버튼을 클릭.',
  qs3Title: '접근 허용',
  qs3Body: '프롬프트가 뜨면 카메라와 마이크를 허용.',
  start: '시작',
  resume: '이어하기',

  upsellEyebrow: '레벨업',
  upsellTitle: 'ShadowCast 3를 장착하자.',
  upsellBody: '더 낮은 지연, 4K 패스스루, 그리고 세상에서 가장 작은 캡처 카드.',
  upsellCta: '장착',

  settings: '설정',
  videoDevice: '비디오 장치',
  audioInput: '오디오 입력',
  audioOutput: '오디오 출력',
  resolution: '해상도',
  frameRate: '프레임레이트',
  mirror: '좌우 반전',
  audioPassthrough: '오디오 패스스루',
  recordMic: '마이크 녹음',
  webcamPip: '웹캠 PiP',
  micSource: '마이크 소스',
  snapshot: '스냅샷',
  record: '녹화',
  stop: '중지',
  fullscreen: '전체 화면',
  end: '종료',
  shadowcastConnected: 'ShadowCast 연결됨',

  shopLink: 'genkithings.com',
};

export type LanguageCode = 'en' | 'ja' | 'zh-CN' | 'zh-TW' | 'es' | 'fr' | 'de' | 'ko';

export const translations: Record<LanguageCode, Translation> = {
  en,
  ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  es,
  fr,
  de,
  ko,
};

// Language order for pickers — English first (default), then major
// gaming markets by rough audience size for Genki.
export const LANGUAGE_ORDER: LanguageCode[] = [
  'en',
  'ja',
  'zh-CN',
  'zh-TW',
  'ko',
  'es',
  'fr',
  'de',
];

const LS_KEY = 'genki-arcade:lang';

/**
 * Pick the initial language.
 *
 * Priority:
 *   1. localStorage override (user's explicit choice from the picker)
 *   2. Browser locale from navigator.language / navigator.languages
 *   3. English fallback
 *
 * navigator.languages is preferred over navigator.language because it
 * carries the user's ordered preference list (from OS settings), which
 * handles "user speaks EN but device is set to ES" gracefully.
 */
export function pickLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en';

  // 1. User's explicit override wins.
  try {
    const saved = window.localStorage?.getItem(LS_KEY);
    if (saved && isLanguageCode(saved)) return saved;
  } catch {
    /* localStorage unavailable — proceed to browser locale */
  }

  // 2. Browser locale — walk the ordered list, first match wins.
  const candidates: string[] = [];
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      candidates.push(...navigator.languages);
    } else if (navigator.language) {
      candidates.push(navigator.language);
    }
  }
  for (const raw of candidates) {
    const code = matchBrowserLocale(raw);
    if (code) return code;
  }

  // 3. Fallback.
  return 'en';
}

/**
 * Map a browser locale string ("ja-JP", "zh-Hant-HK", "en-US", …) onto
 * one of our supported codes. Chinese is the tricky one — we distinguish
 * Simplified (mainland + Singapore) from Traditional (Taiwan + Hong Kong)
 * via the script subtag / region. Everything else is prefix matching.
 */
function matchBrowserLocale(locale: string): LanguageCode | null {
  const l = locale.toLowerCase();
  // Chinese: prefer script/region signals over the base 'zh' code.
  if (l.startsWith('zh')) {
    if (l.includes('hant') || l.includes('tw') || l.includes('hk') || l.includes('mo')) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('ko')) return 'ko';
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('fr')) return 'fr';
  if (l.startsWith('de')) return 'de';
  if (l.startsWith('en')) return 'en';
  return null;
}

function isLanguageCode(v: string): v is LanguageCode {
  return v in translations;
}

export function useTranslation(lang: LanguageCode = 'en'): Translation {
  return translations[lang] || translations.en;
}

/**
 * Persist the user's chosen language so it survives reloads and
 * subsequent sessions. Silently no-ops if localStorage is unavailable
 * (private-mode Safari, sandboxed iframes, etc.) — the choice still
 * applies for the current session.
 */
export function setLanguage(lang: LanguageCode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(LS_KEY, lang);
  } catch {
    /* ignore */
  }
}
