// Small line icons for each tool in SITE_TOOLS (src/lib/siteNav.ts).
// Decorative only — always rendered next to a visible text label, so
// they're hidden from screen readers.

const PATHS: Record<string, string> = {
  // pulse / live line
  matchups: "M3 12h4l3-8 4 16 3-8h4",
  // trophy
  leagues: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3",
  // magnifying glass
  finder: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5",
  // swap arrows
  trade: "M7 7h13l-4-4M17 17H4l4 4",
  // ordered list
  rankings: "M10 6h10M10 12h10M10 18h10M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",
  // versus / scales
  compare: "M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7ZM19 7l-3 7a3 3 0 0 0 6 0l-3-7ZM8 21h8",
  // printer
  cheatsheet: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6v-7Z",
  // puzzle piece
  extension:
    "M20 13h-1a2 2 0 1 0 0 4h1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 1 0-4 0v1H9a1 1 0 0 1-1-1v-3H7a2 2 0 1 1 0-4h1V9a1 1 0 0 1 1-1h3V7a2 2 0 1 1 4 0v1h3a1 1 0 0 1 1 1v4Z",
};

export function ToolIcon({ tool, className = "h-5 w-5" }: { tool: string; className?: string }) {
  const d = PATHS[tool];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}
