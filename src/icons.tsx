// Genki Arcade — Lucide-style line icons (1.6px stroke), shared across themes.
// All icons are 24×24 with stroke="currentColor" so they tint via parent color.
// Translated from the design handoff's icons.jsx (window.Icon export) into TS.

type IconName =
  | 'settings'
  | 'mirror'
  | 'audio'
  | 'mic'
  | 'webcam'
  | 'snapshot'
  | 'record'
  | 'stop'
  | 'fullscreen'
  | 'pin'
  | 'video'
  | 'play'
  | 'globe'
  | 'check'
  | 'arrow'
  | 'bolt'
  | 'plug'
  | 'shield'
  | 'controller'
  | 'close'
  | 'chevron'
  | 'image'
  | 'swap';

interface IconProps {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18 }: IconProps) {
  const s: React.CSSProperties = { width: size, height: size, display: 'block', flex: 'none' };
  const stroke = {
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="3" {...stroke} />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            {...stroke}
          />
        </svg>
      );
    case 'mirror':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M12 3v18" {...stroke} />
          <path d="M8 8 4 12l4 4" {...stroke} />
          <path d="m16 8 4 4-4 4" {...stroke} />
        </svg>
      );
    case 'audio':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M11 5 6 9H2v6h4l5 4V5z" {...stroke} />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" {...stroke} />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" {...stroke} />
        </svg>
      );
    case 'mic':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <rect x="9" y="2" width="6" height="13" rx="3" {...stroke} />
          <path d="M19 11a7 7 0 0 1-14 0" {...stroke} />
          <path d="M12 18v4" {...stroke} />
        </svg>
      );
    case 'webcam':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="11" r="6" {...stroke} />
          <circle cx="12" cy="11" r="2" {...stroke} />
          <path d="M5 21h14" {...stroke} />
          <path d="M12 17v4" {...stroke} />
        </svg>
      );
    case 'snapshot':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path
            d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"
            {...stroke}
          />
          <circle cx="12" cy="13" r="3.5" {...stroke} />
        </svg>
      );
    case 'record':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <circle cx="12" cy="12" r="4" fill="currentColor" />
        </svg>
      );
    case 'stop':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" />
        </svg>
      );
    case 'fullscreen':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M4 9V5a1 1 0 0 1 1-1h4" {...stroke} />
          <path d="M20 9V5a1 1 0 0 0-1-1h-4" {...stroke} />
          <path d="M4 15v4a1 1 0 0 0 1 1h4" {...stroke} />
          <path d="M20 15v4a1 1 0 0 1-1 1h-4" {...stroke} />
        </svg>
      );
    case 'pin':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M12 17v5" {...stroke} />
          <path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z" {...stroke} />
        </svg>
      );
    case 'video':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <rect x="2" y="4" width="20" height="13" rx="2" {...stroke} />
          <path d="M8 21h8M12 17v4" {...stroke} />
        </svg>
      );
    case 'play':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M6 4l14 8-14 8z" fill="currentColor" />
        </svg>
      );
    case 'globe':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M3 12h18" {...stroke} />
          <path d="M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18" {...stroke} />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="m4 12 5 5L20 6" {...stroke} />
        </svg>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M5 12h14M13 5l7 7-7 7" {...stroke} />
        </svg>
      );
    case 'bolt':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" {...stroke} />
        </svg>
      );
    case 'plug':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M12 22v-5" {...stroke} />
          <path d="M9 8V2M15 8V2" {...stroke} />
          <path d="M5 8h14v3a7 7 0 0 1-14 0z" {...stroke} />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z" {...stroke} />
          <path d="m9 12 2 2 4-4" {...stroke} />
        </svg>
      );
    case 'controller':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path
            d="M7 8h10a4 4 0 0 1 4 4v3a3 3 0 0 1-5.5 1.7L14 15h-4l-1.5 1.7A3 3 0 0 1 3 15v-3a4 4 0 0 1 4-4z"
            {...stroke}
          />
          <path d="M8 11v3M6.5 12.5h3" {...stroke} />
          <circle cx="15.5" cy="11.5" r=".7" fill="currentColor" />
          <circle cx="17" cy="13" r=".7" fill="currentColor" />
        </svg>
      );
    case 'close':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="m6 6 12 12M18 6 6 18" {...stroke} />
        </svg>
      );
    case 'chevron':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="m6 9 6 6 6-6" {...stroke} />
        </svg>
      );
    case 'image':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <rect x="3" y="3" width="18" height="18" rx="2" {...stroke} />
          <circle cx="9" cy="9" r="1.5" {...stroke} />
          <path d="m3 17 6-6 6 6 3-3 3 3" {...stroke} />
        </svg>
      );
    case 'swap':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M16 3l4 4-4 4" {...stroke} />
          <path d="M4 7h16" {...stroke} />
          <path d="M8 21l-4-4 4-4" {...stroke} />
          <path d="M20 17H4" {...stroke} />
        </svg>
      );
    default:
      return null;
  }
}
