// Sleeper's public API — no key, no auth. Plain fetch wrappers only; no
// Supabase, no Next.js-specific APIs, so this stays reusable from anywhere
// (a script, a test, a future different framework).

export type SleeperLeague = {
  leagueId: string;
  name: string;
  season: string;
  sport: string;
  status: string;
  totalRosters: number;
  rosterPositions: string[];
  scoringSettings: Record<string, number>;
  isDynasty: boolean;
  isSuperflex: boolean;
};

export type SleeperRoster = {
  rosterId: number;
  ownerId: string | null;
  playerIds: string[];
};

export type SleeperUser = {
  userId: string;
  displayName: string;
  teamName: string | null;
};

async function sleeperFetch(path: string): Promise<unknown> {
  const res = await fetch(`https://api.sleeper.app/v1${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sleeper API ${path} failed: ${res.status}`);
  return res.json();
}

// Returns null for a nonexistent league (Sleeper 404s that case) rather than
// throwing, so callers can turn it into a plain user-facing error message.
export async function fetchSleeperLeague(leagueId: string): Promise<SleeperLeague | null> {
  const data = (await sleeperFetch(`/league/${leagueId}`)) as {
    league_id: string;
    name: string;
    season: string;
    sport: string;
    status: string;
    total_rosters: number;
    roster_positions?: string[];
    scoring_settings?: Record<string, number>;
    settings?: { type?: number };
  } | null;
  if (!data) return null;

  const rosterPositions = data.roster_positions ?? [];
  return {
    leagueId: data.league_id,
    name: data.name,
    season: data.season,
    sport: data.sport,
    status: data.status,
    totalRosters: data.total_rosters,
    rosterPositions,
    scoringSettings: data.scoring_settings ?? {},
    isDynasty: data.settings?.type === 2,
    isSuperflex: rosterPositions.includes("SUPER_FLEX"),
  };
}

export async function fetchSleeperRosters(leagueId: string): Promise<SleeperRoster[]> {
  const data = (await sleeperFetch(`/league/${leagueId}/rosters`)) as
    | { roster_id: number; owner_id: string | null; players: string[] | null }[]
    | null;
  return (data ?? []).map((r) => ({
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    playerIds: r.players ?? [],
  }));
}

export async function fetchSleeperUsers(leagueId: string): Promise<SleeperUser[]> {
  const data = (await sleeperFetch(`/league/${leagueId}/users`)) as
    | { user_id: string; display_name: string; metadata?: { team_name?: string } }[]
    | null;
  return (data ?? []).map((u) => ({
    userId: u.user_id,
    displayName: u.display_name,
    teamName: u.metadata?.team_name ?? null,
  }));
}

// The current NFL week — league-independent, same for every Sleeper league.
export async function fetchSleeperCurrentWeek(): Promise<number> {
  const data = (await sleeperFetch("/state/nfl")) as { week: number } | null;
  return data?.week ?? 1;
}

export type SleeperMatchupEntry = {
  rosterId: number;
  matchupId: number | null;
  playerIds: string[];
  starterPlayerIds: string[];
};

// One entry per roster for a given week; two entries sharing the same
// matchupId are playing each other. `playerIds` is that week's roster
// snapshot, not necessarily identical to the roster's current state if
// there's been a waiver move since. `starterPlayerIds` is Sleeper's real
// starting lineup for the week (order believed to line up positionally
// with the league's non-bench roster_positions slots, per Sleeper's
// documented convention — verify against a live league before trusting
// the order, not just the membership).
export async function fetchSleeperMatchups(leagueId: string, week: number): Promise<SleeperMatchupEntry[]> {
  const data = (await sleeperFetch(`/league/${leagueId}/matchups/${week}`)) as
    | { roster_id: number; matchup_id: number | null; players: string[] | null; starters: string[] | null }[]
    | null;
  return (data ?? []).map((m) => ({
    rosterId: m.roster_id,
    matchupId: m.matchup_id,
    playerIds: m.players ?? [],
    // Sleeper pads an empty starting slot with the string "0" rather than
    // omitting it — strip those, they aren't a real player.
    starterPlayerIds: (m.starters ?? []).filter((id) => id !== "0"),
  }));
}

// --- Live scoring: a different host (api.sleeper.app, no /v1 prefix) than
// every function above, so it gets its own fetch helper, same pattern. ---

async function sleeperStatsFetch(path: string): Promise<unknown> {
  const res = await fetch(`https://api.sleeper.app${path}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sleeper stats API ${path} failed: ${res.status}`);
  return res.json();
}

// A player's (or team defense's) full raw stat line for one week, straight
// from Sleeper — every category Sleeper tracks, unfiltered. This is also
// the exact key vocabulary Sleeper's own SleeperLeague.scoringSettings
// uses (rec, rec_yd, rec_td, sack, pts_allow_7_13, ...), which is what
// lets src/lib/scoringRules.ts score a player generically: sum of
// raw[category] * league's real rate for that category, for either
// platform, one formula. This used to be filtered down to a curated
// display-only subset here — that curation now lives purely in
// BREAKDOWN_LABELS (liveScoring.ts); the scoring engine needs categories
// it never covered (2pt conversions, kicker brackets, every D/ST category).
export type SleeperStatLine = Record<string, number>;

function parseSleeperStatLines(data: unknown): Map<string, SleeperStatLine> {
  const entries = (data ?? []) as {
    player_id: string;
    stats?: Record<string, number>;
  }[];
  const map = new Map<string, SleeperStatLine>();
  for (const entry of entries) {
    if (!entry.player_id) continue;
    map.set(entry.player_id, entry.stats ?? {});
  }
  return map;
}

// Pre-game baseline for the week, keyed by player_id (this app's own
// players.id for every Sleeper-sourced or name-matched ESPN player).
export async function fetchSleeperProjections(season: string, week: number): Promise<Map<string, SleeperStatLine>> {
  const data = await sleeperStatsFetch(`/projections/nfl/${season}/${week}?season_type=regular`);
  return parseSleeperStatLines(data);
}

// Actual accrued stats for the week — updates live during games, locks in
// once final. Same shape as fetchSleeperProjections.
export async function fetchSleeperWeekStats(season: string, week: number): Promise<Map<string, SleeperStatLine>> {
  const data = await sleeperStatsFetch(`/stats/nfl/${season}/${week}?season_type=regular`);
  return parseSleeperStatLines(data);
}
