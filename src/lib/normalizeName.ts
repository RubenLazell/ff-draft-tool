// Mirrors scripts/sync-consensus-rankings.mjs's normalizeName — duplicated
// rather than imported because that script runs as a plain .mjs with no
// build step and can't import a .ts file. Used here to match ESPN's own
// player names (ESPN has no player-id overlap with our Sleeper-sourced
// `players.id`) against our `players.full_name`.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "") // strip accents
    .replace(/[^a-z0-9 ]/g, "") // strip punctuation (periods, apostrophes, Jr./Sr.)
    .replace(/\s+(jr|sr|ii|iii|iv)$/, "") // strip trailing suffixes
    .replace(/\s+/g, " ")
    .trim();
}

// ESPN and our own `players.team` occasionally disagree on an abbreviation
// for the same franchise (relocations/renames) — normalize both sides
// through this before comparing team codes.
const TEAM_ALIASES: Record<string, string> = {
  WSH: "WAS",
  JAX: "JAC",
  LA: "LAR",
  OAK: "LV",
  SD: "LAC",
  STL: "LAR",
};

export function normalizeTeamCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return TEAM_ALIASES[upper] ?? upper;
}
