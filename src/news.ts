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
  // ── Genki product (3) ────────────────────────────────────────────────
  {
    id: 'welcome',
    text: "you're on the new Genki Arcade — fresh browser build, optimized for ShadowCast 3, plays nice with most other capture cards too.",
  },
  {
    id: 'covert-dock-3',
    text: 'Covert Dock 3 sold out in 2 weeks 🫠 restock landing mid-June. backorder now to skip the line.',
    link: {
      href: 'https://www.genkithings.com/products/covert-dock-3',
      label: 'Backorder yours',
    },
  },
  {
    id: 'genki-grips',
    text: 'Genki Grips just unlocked new colorways. late pledges are live on Kickstarter — get in before shipping.',
    link: {
      href: 'https://www.kickstarter.com/projects/humanthings/genkigrips',
      label: 'Pledge on Kickstarter',
    },
  },

  // ── Switch 2 / Nintendo (6) ──────────────────────────────────────────
  {
    id: 'yoshi-may-21',
    text: "Yoshi and the Mysterious Book is May 21, Switch 2 exclusive. Nintendo continues its 'we don't need GTA 6' victory tour.",
  },
  {
    id: 'indy-switch2',
    text: 'Indiana Jones and the Great Circle hits Switch 2 May 12. nazi-punching is now portable. the dream of 1981, realized 🤠',
  },
  {
    id: 'starfox-june-25',
    text: "Star Fox returns June 25, Switch 2 only. 'cinematic remake' of 64. Andross has had 28 years to think about what he did.",
  },
  {
    id: 'pokopia-4m',
    text: 'Pokémon Pokopia just crossed 4M units. Game Freak accidentally invented the Stardew killer and they did it in cargo shorts.',
  },
  {
    id: 'switch2-19m',
    text: 'Switch 2 sits at 19.86M units. Sony does a State of Play, Microsoft does a showcase, Nintendo does a printer 🖨️',
  },
  {
    id: 'switch2-price',
    text: 'Nintendo just hiked Switch 2 prices worldwide. tariffs gonna tariff. the global console market collectively winces 🪙',
  },

  // ── Big multi-platform launches (4) ──────────────────────────────────
  {
    id: 'mixtape-launch',
    text: 'Mixtape dropped this week 🎵 skate-around-90s-suburbia vibes, no goals. millennial nostalgia is a trillion-dollar industry.',
  },
  {
    id: 'forza-tokyo',
    text: "Forza Horizon 6: Tokyo, May 19. Microsoft outsourced 'go viral on TikTok' to Playground Games and they delivered.",
  },
  {
    id: 'bond-may-27',
    text: "007 First Light, May 27. young Bond, full stealth-action. IO Interactive's pivot from Hitman to Bond is the smoothest M&A in gaming 🍸",
  },
  {
    id: 'castlevania-belmont',
    text: "new 2D Castlevania: Belmont's Curse, from Konami × Motion Twin (Dead Cells). best decision Konami has made in 15 years. low bar — still counts.",
  },

  // ── Hype + market commentary (5) ─────────────────────────────────────
  {
    id: 'sgf-countdown',
    text: "Summer Game Fest is one month out. June 5, Dolby Theatre, ~40 games in 2 hours. Geoff Keighley's annual one-man Olympics 🎤",
  },
  {
    id: 'gta6-nov',
    text: "GTA 6 delayed to Nov 19, 2026. Strauss Zelnick is single-handedly keeping the 'soon™' meme alive. the streets remain unmade.",
  },
  {
    id: 'handhelds-2026',
    text: '2026 handheld market check: Switch 2 (printing), Steam Deck 2 (cooking), ROG Ally X (refusing to lose), Lenovo Legion Go (vibing). pick a fighter.',
  },
  {
    id: 'steam-controller-soldout',
    text: "new Steam Controller sold out in 30 minutes. Valve's already opening a reservation queue. word on the street: Genki's cooking one that outperforms it 👀",
  },
  {
    id: 'steam-machine-rumor',
    text: "shipping records show 15K+ unmarked consoles arriving at Valve warehouses. SteamOS 3.8.0 quietly slipped in 'Steam Machine' references. the long con may finally be ending 🕵️",
  },

  // ── Community / viral (2) ────────────────────────────────────────────
  {
    id: 'minecraft-saved-tweet',
    text: "viral on X: @boredcrow24 just tweeted 'minecraft has been saved' with zero context. 2.5K likes. Mojang silent. the internet is unwell 🟫",
  },
  {
    id: 'smash-ai-port-drama',
    text: "the new native Smash Bros PC port is reportedly 100% AI-generated. r/gaming is filing for emotional damages. 'is it a port if no human touched the code?' 🤖",
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
