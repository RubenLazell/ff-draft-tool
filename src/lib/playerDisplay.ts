// Shared display logic for player rows — used by both the interactive
// drag-and-drop board (RankingsBoard) and the static printable cheat sheet
// (CheatsheetView), so the two views never drift out of sync on what a
// given delta or injury status actually means.

// Diverging scale: green = ranked earlier/higher than consensus ADP,
// red = ranked later/lower than consensus, gray = close to ADP. Thresholds
// are in units of a 12-team draft round, since that's the natural way
// fantasy drafters think about ADP distance.
//
// Red/green is used here at the user's explicit request. Note this pair is
// not colorblind-safe (red-green color blindness is the most common form) —
// the numeric delta is always shown as text too, so color is never the only
// signal, but if this becomes hard to read, blue/red is the accessible swap.
const ROUND = 12;
export type DeltaBucket = "strong-reach" | "mild-reach" | "neutral" | "mild-value" | "strong-value";

export function getDeltaBucket(delta: number): DeltaBucket {
  if (delta <= -1.5 * ROUND) return "strong-reach";
  if (delta <= -0.5 * ROUND) return "mild-reach";
  if (delta < 0.5 * ROUND) return "neutral";
  if (delta < 1.5 * ROUND) return "mild-value";
  return "strong-value";
}

// Full-row background + matching text color for each bucket.
export const DELTA_ROW_CLASSES: Record<DeltaBucket, string> = {
  "strong-reach": "bg-green-100 dark:bg-green-950/60",
  "mild-reach": "bg-green-50 dark:bg-green-950/30",
  neutral: "bg-white dark:bg-zinc-950",
  "mild-value": "bg-red-50 dark:bg-red-950/30",
  "strong-value": "bg-red-100 dark:bg-red-950/60",
};

export const DELTA_TEXT_CLASSES: Record<DeltaBucket, string> = {
  "strong-reach": "text-green-800 dark:text-green-400",
  "mild-reach": "text-green-700 dark:text-green-400",
  neutral: "text-zinc-500 dark:text-zinc-400",
  "mild-value": "text-red-600 dark:text-red-400",
  "strong-value": "text-red-700 dark:text-red-400",
};

// Solid swatch colors for legend dots — the row classes above use subtle
// backgrounds tuned for sitting behind a whole row of text, which don't
// read well as a small standalone dot.
export const DELTA_SWATCH_CLASSES: Record<DeltaBucket, string> = {
  "strong-reach": "bg-green-600 dark:bg-green-500",
  "mild-reach": "bg-green-300 dark:bg-green-800",
  neutral: "bg-zinc-300 dark:bg-zinc-600",
  "mild-value": "bg-red-300 dark:bg-red-800",
  "strong-value": "bg-red-600 dark:bg-red-500",
};

export const DELTA_LEGEND: { bucket: DeltaBucket; label: string }[] = [
  { bucket: "strong-reach", label: "1.5+ rounds higher than consensus" },
  { bucket: "mild-reach", label: "0.5–1.5 higher than consensus" },
  { bucket: "neutral", label: "Near consensus" },
  { bucket: "mild-value", label: "0.5–1.5 lower than consensus" },
  { bucket: "strong-value", label: "1.5+ rounds lower than consensus" },
];

export function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

// Maps Sleeper's injury_status strings to a compact badge. Falls back to
// showing the raw status (truncated) for anything not in this list, so an
// unrecognized status still surfaces rather than silently disappearing.
const INJURY_BADGES: Record<string, { label: string; className: string }> = {
  Questionable: { label: "Q", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400" },
  Doubtful: { label: "D", className: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-400" },
  Out: { label: "O", className: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400" },
  IR: { label: "IR", className: "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300" },
  "Injured Reserve": { label: "IR", className: "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300" },
  PUP: { label: "PUP", className: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400" },
  Suspended: { label: "SUS", className: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400" },
  NA: { label: "NA", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300" },
};

// Categorical color-by-position (identity, not polarity — unlike the
// diverging ADP scale above) — fixed hue order, never reassigned. Shared
// by the printable cheat sheet and the head-to-head comparison tool so
// the same position always reads as the same color everywhere in the app.
// Position text/label is always shown alongside it too, so color is never
// the only signal.
export const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;

export const POSITION_COLORS: Record<
  (typeof POSITION_ORDER)[number],
  { bg: string; text: string; swatch: string }
> = {
  QB: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", swatch: "bg-blue-500" },
  RB: { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", swatch: "bg-orange-500" },
  WR: { bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-400", swatch: "bg-teal-500" },
  TE: { bg: "bg-yellow-50 dark:bg-yellow-950/40", text: "text-yellow-800 dark:text-yellow-400", swatch: "bg-yellow-500" },
  K: { bg: "bg-pink-50 dark:bg-pink-950/40", text: "text-pink-700 dark:text-pink-400", swatch: "bg-pink-500" },
  DEF: { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", swatch: "bg-green-500" },
};

export const FALLBACK_POSITION_COLOR = {
  bg: "bg-zinc-50 dark:bg-zinc-900",
  text: "text-zinc-700 dark:text-zinc-300",
  swatch: "bg-zinc-400",
};

export function getInjuryBadge(status: string | null) {
  if (!status) return null;
  return (
    INJURY_BADGES[status] ?? {
      label: status.length > 4 ? status.slice(0, 4) : status,
      className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
    }
  );
}
