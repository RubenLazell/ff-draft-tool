// Single source of truth for every tool on the site — the navbar, the
// mobile menu, the footer and the home page all render from this list, so
// a new tool shows up everywhere at once instead of being reachable only
// from whichever page happened to link to it.

export type SiteTool = {
  key: string;
  label: string;
  // Shorter label for the desktop navbar, where space is tight.
  navLabel: string;
  // Call-to-action text on the home page cards.
  cta: string;
  description: string;
  href: string;
  // Guest-mode equivalent, or null when the tool needs an account.
  guestHref: string | null;
  group: "season" | "draft";
};

export const SITE_TOOLS: SiteTool[] = [
  {
    key: "matchups",
    cta: "Open matchups",
    label: "Live Matchups",
    navLabel: "Matchups",
    description:
      "Every league's matchup in one place, live scores under your league's real scoring, win %, and a replayable score graph.",
    href: "/leagues/matchups",
    guestHref: null,
    group: "season",
  },
  {
    key: "leagues",
    cta: "See power rankings",
    label: "League Power Rankings",
    navLabel: "Leagues",
    description:
      "Import a Sleeper or ESPN league and see every team ranked by strength, judged against your own rankings.",
    href: "/leagues",
    guestHref: "/leagues/guest",
    group: "season",
  },
  {
    key: "finder",
    cta: "Find a trade",
    label: "Trade Finder",
    navLabel: "Trade finder",
    description:
      "Name the position you need and get trade ideas that improve your team by your rankings and still look fair to the other manager.",
    href: "/leagues",
    guestHref: "/leagues/guest",
    group: "season",
  },
  {
    key: "trade",
    cta: "Build a trade",
    label: "Trade Calculator",
    navLabel: "Trades",
    description:
      "Build a trade between any two teams in your league and see who comes out ahead by your own values.",
    href: "/leagues",
    guestHref: "/leagues/guest",
    group: "season",
  },
  {
    key: "rankings",
    cta: "Open your board",
    label: "Rankings Board",
    navLabel: "Rankings",
    description:
      "Your own drag-and-drop big board, seeded from consensus. Search, filter by position, and jump a player to any rank.",
    href: "/rankings",
    guestHref: "/rankings/guest",
    group: "draft",
  },
  {
    key: "compare",
    cta: "Start comparing",
    label: "Head-to-Head",
    navLabel: "Head-to-head",
    description:
      "Refine your board two players at a time, pick who you'd rather have and your rankings reorder themselves.",
    href: "/rankings/compare",
    guestHref: "/rankings/compare/guest",
    group: "draft",
  },
  {
    key: "cheatsheet",
    cta: "Make a cheatsheet",
    label: "Printable Cheatsheet",
    navLabel: "Cheatsheet",
    description: "A print-ready draft sheet, color-coded by position, generated straight from your rankings.",
    href: "/rankings/cheatsheet",
    guestHref: "/rankings/cheatsheet/guest",
    group: "draft",
  },
  {
    key: "extension",
    cta: "Get the extension",
    label: "Live Draft Assistant",
    navLabel: "Extension",
    description:
      "A Chrome extension that overlays your rankings on ESPN and Sleeper draft rooms, updating live as picks happen.",
    href: "/extension",
    guestHref: "/extension",
    group: "draft",
  },
];

export const GROUP_LABELS: Record<SiteTool["group"], string> = {
  season: "In season",
  draft: "Draft prep",
};
