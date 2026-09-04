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
