// Rotating "chat-style" ticker copy.
// Vibe: feels like a friendly stream chat — supporters cheering you on,
// gaming culture chatter, and the occasional Genki product mention.
// Order is randomized on each visit, then rotates sequentially through.
// Each message types out character-by-character (typewriter), then dwells
// for a few seconds before fading to the next.

export interface NewsItem {
  id: string;
  text: string;
  /** Chat-style attribution shown in front of the message ("@HandleName · ").
   * If `href` is set, the handle becomes a clickable link to the source. */
  headline?: { label: string; href?: string };
  /** Optional CTA link rendered after the typed text */
  link?: { href: string; label: string };
}

export const NEWS_ITEMS: NewsItem[] = [
  // ── Genki product (3) ────────────────────────────────────────────────
  {
    id: 'welcome',
    headline: { label: 'Welcome to Genki Arcade' },
    text: 'fresh browser build, optimized for ShadowCast 3, plays nice with most other capture cards too.',
  },
  {
    id: 'covert-dock-3',
    headline: {
      label: 'Covert Dock 3 sold out',
      href: 'https://www.genkithings.com/products/covert-dock-3',
    },
    text: 'in 2 weeks 🫠 restock landing mid-June. backorder now to skip the line.',
    link: {
      href: 'https://www.genkithings.com/products/covert-dock-3',
      label: 'Backorder yours',
    },
  },
  {
    id: 'genki-grips',
    headline: {
      label: 'Genki Grips · new colorways',
      href: 'https://www.kickstarter.com/projects/humanthings/genkigrips',
    },
    text: 'late pledges are live on Kickstarter — get in before shipping.',
    link: {
      href: 'https://www.kickstarter.com/projects/humanthings/genkigrips',
      label: 'Pledge on Kickstarter',
    },
  },

  // ── Switch 2 / Nintendo (6) ──────────────────────────────────────────
  {
    id: 'yoshi-may-21',
    headline: { label: 'Yoshi & the Mysterious Book · May 21' },
    text: "Switch 2 exclusive. Nintendo continues its 'we don't need GTA 6' victory tour.",
  },
  {
    id: 'indy-switch2',
    headline: { label: 'Indiana Jones hits Switch 2 May 12' },
    text: 'nazi-punching is now portable. the dream of 1981, realized 🤠',
  },
  {
    id: 'starfox-june-25',
    headline: { label: 'Star Fox returns June 25' },
    text: "Switch 2 only. 'cinematic remake' of 64. Andross has had 28 years to think about what he did.",
  },
  {
    id: 'pokopia-4m',
    headline: { label: 'Pokémon Pokopia crosses 4M units' },
    text: 'Game Freak accidentally invented the Stardew killer and they did it in cargo shorts.',
  },
  {
    id: 'switch2-19m',
    headline: { label: 'Switch 2 · 19.86M units sold' },
    text: 'Sony does a State of Play, Microsoft does a showcase, Nintendo does a money printer 🖨️',
  },
  {
    id: 'switch2-price',
    headline: { label: 'Switch 2 price hike worldwide' },
    text: 'tariffs gonna tariff. the global console market collectively winces 🪙',
  },

  // ── Big multi-platform launches (4) ──────────────────────────────────
  {
    id: 'mixtape-launch',
    headline: { label: 'Mixtape · out now' },
    text: '🎵 skate-around-90s-suburbia vibes, no goals. millennial nostalgia is a trillion-dollar industry.',
  },
  {
    id: 'forza-tokyo',
    headline: { label: 'Forza Horizon 6: Tokyo · May 19' },
    text: "Microsoft outsourced 'go viral on TikTok' to Playground Games and they delivered.",
  },
  {
    id: 'bond-may-27',
    headline: { label: '007 First Light · May 27' },
    text: "young Bond, full stealth-action. IO Interactive's pivot from Hitman to Bond is the smoothest M&A in gaming 🍸",
  },
  {
    id: 'castlevania-belmont',
    headline: { label: "Castlevania: Belmont's Curse" },
    text: 'Konami × Motion Twin (Dead Cells). best decision Konami has made in 15 years. low bar — still counts.',
  },

  // ── Hype + market commentary (5) ─────────────────────────────────────
  {
    id: 'sgf-countdown',
    headline: { label: 'Summer Game Fest · 1 month out' },
    text: "June 5, Dolby Theatre, ~40 games in 2 hours. Geoff Keighley's annual one-man Olympics 🎤",
  },
  {
    id: 'gta6-nov',
    headline: { label: 'GTA 6 delayed to Nov 19, 2026' },
    text: "Strauss Zelnick is single-handedly keeping the 'soon™' meme alive. the streets remain unmade.",
  },
  {
    id: 'handhelds-2026',
    headline: { label: '2026 handheld market check' },
    text: 'Switch 2 (printing), Steam Deck 2 (cooking), ROG Ally X (refusing to lose), Lenovo Legion Go (vibing). pick a fighter.',
  },
  {
    id: 'steam-controller-soldout',
    headline: { label: 'Steam Controller sold out in 30 min' },
    text: "Valve's opening a reservation queue. word on the street: Genki's cooking one that outperforms it 👀",
  },
  {
    id: 'steam-machine-rumor',
    headline: { label: 'Steam Machine · inbound?' },
    text: "shipping records show 15K+ unmarked consoles arriving at Valve warehouses. SteamOS 3.8.0 slipped in 'Steam Machine' references. the long con may finally be ending 🕵️",
  },

  // ── Industry / community (1) ─────────────────────────────────────────
  {
    id: 'gamestop-ebay-bid',
    headline: { label: 'GameStop CEO banned from eBay' },
    text: "Ryan Cohen reportedly wants to acquire eBay. eBay's response: ban his account. mid-acquisition, mid-tweet, nothing about this is normal corporate finance 📦",
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
