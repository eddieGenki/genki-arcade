// Rotating "chat-style" ticker copy.
// Vibe: feels like a friendly stream chat — supporters cheering you on,
// gaming culture chatter, and the occasional Genki product mention.
// Order is randomized on each visit, then rotates sequentially through.
// Each message types out character-by-character (typewriter), then dwells
// for a few seconds before fading to the next.

export interface NewsItem {
  id: string;
  text: string;
  /** Optional chat-style username — renders as "@username  text" */
  username?: string;
  /** Optional CTA link rendered after the typed text */
  link?: { href: string; label: string };
}

export const NEWS_ITEMS: NewsItem[] = [
  // ── Genki product (official voice — no username) ─────────────────────
  {
    id: 'welcome',
    text: "you're on the new Genki Arcade — fresh browser build, ShadowCast 3 ready, plays nice with most other capture cards too.",
  },
  {
    id: 'covert-dock-3',
    text: 'Covert Dock 3 sold out in 2 weeks 🫠 restock landing early June.',
    link: {
      href: 'https://www.genkithings.com/products/covert-dock-3',
      label: 'Backorder yours',
    },
  },
  {
    id: 'genki-grips',
    text: 'Genki Grips just unlocked more colors. ships next month — late pledge still open.',
    link: {
      href: 'https://www.kickstarter.com/projects/humanthings/genkigrips',
      label: 'Pledge on Kickstarter',
    },
  },
  {
    id: 'shadowcast-cheer',
    text: 'ShadowCast 3 fits in a pocket and pumps 4K over a single USB-C. Genki engineers, what is wrong with you (complimentary).',
  },

  // ── Gaming culture — short observations ──────────────────────────────
  {
    id: 'star-fox',
    text: 'hot take needed: the new Star Fox art style — bold Nintendo flex, or cursed timeline?',
  },
  {
    id: 'gta6',
    text: "GTA 6 is still 'coming soon.' we've watched two console generations ship in the time Rockstar's been polishing it.",
  },
  {
    id: 'mixtape',
    text: 'Mixtape drops today 🎵 skating around late-90s suburbia is on tonight\'s queue.',
  },
  {
    id: 'forza-h6',
    text: 'Forza Horizon 6 with Tokyo as the map ✨ drifting Shibuya scramble at 200mph is going to be a core memory.',
  },
  {
    id: 'handhelds',
    text: 'handheld gaming in 2026 is unreal. Switch 2, Steam Deck 2, ROG Ally X, Lenovo Legion Go — pick your fighter.',
  },

  // ── Chat-style cheers (with @usernames) ──────────────────────────────
  {
    id: 'chat-cheer-1',
    username: 'gamerthing24',
    text: 'yo your run tonight is looking clean 🔥 keep cookin',
  },
  {
    id: 'chat-cheer-2',
    username: 'speedrun_dad',
    text: "send it. we're all rooting for you over here",
  },
  {
    id: 'chat-cheer-3',
    username: 'neonshreds',
    text: 'GG WP regardless of how this one shakes out',
  },
  {
    id: 'chat-cheer-4',
    username: 'arcadequeen',
    text: 'i have so much faith in you rn 🌟',
  },
  {
    id: 'chat-cheer-5',
    username: 'late_night_hero',
    text: 'late-night gaming session is sacred. respect.',
  },
  {
    id: 'chat-cheer-6',
    username: 'framedrop_devon',
    text: 'wherever you are right now, someone out there is quietly cheering for your run',
  },

  // ── Tip ─────────────────────────────────────────────────────────────
  {
    id: 'pip-tip',
    text: 'pro tip: drag the PiP webcam anywhere. top-right is the streamer standard. bottom-left is the rebel choice.',
  },
];

// Fisher-Yates shuffle so each visit sees a different first message.
export function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
