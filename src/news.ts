// Rotating news ticker copy. Mix of Genki product callouts, gaming culture
// chatter, and small UX tips. Order is randomized on each visit, then rotates
// sequentially. Tone: short, casual, conversational — like a friend texting
// you about gaming.

export interface NewsItem {
  id: string;
  text: string;
  link?: { href: string; label: string };
}

export const NEWS_ITEMS: NewsItem[] = [
  {
    id: 'welcome',
    text: "You're on the new Genki Arcade — fresh browser build, ShadowCast 3 ready, plays nice with most other capture cards too.",
  },
  {
    id: 'covert-dock-3',
    text: 'Covert Dock 3 sold out in 2 weeks 🫠 Restock landing early June.',
    link: {
      href: 'https://www.genkithings.com/products/covert-dock-3',
      label: 'Backorder yours',
    },
  },
  {
    id: 'genki-grips',
    text: 'Genki Grips just unlocked more colors. Ships next month — late pledge still open.',
    link: {
      href: 'https://www.kickstarter.com/projects/humanthings/genkigrips',
      label: 'Pledge on Kickstarter',
    },
  },
  {
    id: 'star-fox',
    text: 'Hot take needed: the new Star Fox art style — bold Nintendo flex, or cursed timeline? We’re 60/40 on bold.',
  },
  {
    id: 'gta6',
    text: "GTA 6 is still ‘coming soon.’ We’ve watched two console generations ship in the time Rockstar’s been polishing it.",
  },
  {
    id: 'mixtape',
    text: 'Mixtape drops today 🎵 Skating around late-90s suburbia is on tonight’s queue. Tuesdays are saved.',
  },
  {
    id: 'forza-h6',
    text: 'Forza Horizon 6 with Tokyo as the map ✨ Drifting Shibuya scramble at 200mph is going to be a core memory.',
  },
  {
    id: 'handhelds',
    text: 'Handheld gaming in 2026 is unreal. Switch 2, Steam Deck 2, ROG Ally X, Lenovo Legion Go — pick your fighter (and pack a Covert Dock).',
  },
  {
    id: 'shadowcast-cheer',
    text: 'ShadowCast 3 fits in a pocket and pumps 4K over a single USB-C. Genki engineers, what is wrong with you (complimentary).',
  },
  {
    id: 'pip-tip',
    text: 'Pro tip: drag the PiP webcam anywhere. Top-right is the streamer standard. Bottom-left is the rebel choice.',
  },
];

// Fisher-Yates shuffle so each visit sees a different first message
// without picking the same message twice in the rotation.
export function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
