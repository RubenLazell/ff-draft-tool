// ESPN's fantasy API is unofficial and undocumented — there is no public
// spec, only reverse-engineering by the fantasy-dev community (this file's
// field names and ID maps are grounded in that community's widely-used,
// actively-maintained parsing, e.g. github.com/cwendt94/espn-api). As with
// this app's Chrome extension adapters, treat the exact shapes here as
// "believed correct, not yet verified against a live response" until
// they've been exercised against a real league — the honest thing to do
// is flag that plainly rather than present unverified confidence.
//
// Private leagues need two cookies from the user's own logged-in ESPN
// session (SWID, espn_s2) — there's no OAuth flow a third party can use
// instead. Public leagues work with no credentials at all.

export type EspnCredentials = { swid: string; espnS2: string };

export class EspnAuthRequiredError extends Error {
  constructor() {
    super("This league needs your ESPN login cookies (SWID and espn_s2).");
    this.name = "EspnAuthRequiredError";
  }
}

// Player's primary position. Unrecognized ids (IDP positions this app has
// no ranking data for) fall back to "IDP".
const ESPN_POSITION_MAP: Record<number, string> = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  16: "DEF",
  17: "K",
};

// Roster slot type, in the same vocabulary Sleeper's roster_positions
// already uses (QB/RB/WR/TE/K/DEF/FLEX/SUPER_FLEX/BN/IR) so both platforms
// feed the identical downstream scoring code. ESPN's "OP" (offensive
// player) slot accepts QB/RB/WR/TE, functionally the same shape as
// SUPER_FLEX for the purposes of replacement-rank allocation.
const ESPN_SLOT_MAP: Record<number, string> = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  16: "DEF",
  17: "K",
  23: "FLEX",
  7: "SUPER_FLEX",
  20: "BN",
  21: "IR",
};

// Numeric ESPN pro-team id -> abbreviation, used only to match DEF entries
// against our `players.team`. Stable/long-established, unlike the response
// shape above, but still worth a live sanity check.
const ESPN_PRO_TEAM_MAP: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

export type EspnPlayer = {
  espnPlayerId: number;
  fullName: string;
  position: string; // mapped via ESPN_POSITION_MAP, else "IDP"
  proTeam: string | null;
};

export type EspnRosterSlot = {
  slotType: string; // mapped via ESPN_SLOT_MAP, else "IDP"
  player: EspnPlayer | null;
};

export type EspnTeam = {
  teamId: number;
  teamName: string;
  roster: EspnRosterSlot[];
};

export type EspnLeague = {
  leagueId: string;
  season: string;
  name: string;
  rosterPositions: string[]; // flattened from lineupSlotCounts, same shape as Sleeper's
  teams: EspnTeam[];
};

// Canonical display order when flattening lineupSlotCounts (a count map,
// with no inherent ordering) into a flat rosterPositions array.
const SLOT_DISPLAY_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "K", "DEF", "BN", "IR"];

export async function fetchEspnLeague(
  leagueId: string,
  season: string,
  credentials?: EspnCredentials
): Promise<EspnLeague | null> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; ff-draft-tool/1.0)",
  };
  if (credentials) headers.Cookie = `SWID=${credentials.swid}; espn_s2=${credentials.espnS2}`;

  // Verified live: `fantasy.espn.com/apis/v3/...` (the host cited by most
  // community writeups) redirects server-side requests to the marketing
  // homepage's HTML instead of hitting the actual API — even with valid
  // cookies for a real league. `lm-api-reads.fantasy.espn.com` is the host
  // that actually serves the JSON.
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster&view=mSettings`;
  const res = await fetch(url, { headers });

  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new EspnAuthRequiredError();
  if (!res.ok) throw new Error(`ESPN fetch failed: ${res.status}`);
  // A nonexistent league doesn't 404 — ESPN redirects (which fetch follows
  // by default) to the fantasy homepage's HTML instead of a JSON error.
  // Verified live: a made-up league id lands here with a 200 and an HTML
  // content-type, not a clean error status.
  if (!res.headers.get("content-type")?.includes("application/json")) return null;

  const data = (await res.json()) as {
    settings?: { name?: string; rosterSettings?: { lineupSlotCounts?: Record<string, number> } };
    teams?: {
      id: number;
      name?: string;
      location?: string;
      nickname?: string;
      roster?: {
        entries?: {
          lineupSlotId: number;
          playerPoolEntry?: { player?: { id: number; fullName: string; defaultPositionId: number; proTeamId: number } };
        }[];
      };
    }[];
  };

  const lineupSlotCounts = data.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const rosterPositions: string[] = [];
  const seenSlotIds = new Set(Object.keys(lineupSlotCounts).map(Number));
  const orderedSlotIds = [...seenSlotIds].sort((a, b) => {
    const ai = SLOT_DISPLAY_ORDER.indexOf(ESPN_SLOT_MAP[a] ?? "IDP");
    const bi = SLOT_DISPLAY_ORDER.indexOf(ESPN_SLOT_MAP[b] ?? "IDP");
    return (ai === -1 ? SLOT_DISPLAY_ORDER.length : ai) - (bi === -1 ? SLOT_DISPLAY_ORDER.length : bi);
  });
  for (const slotId of orderedSlotIds) {
    const slotType = ESPN_SLOT_MAP[slotId] ?? "IDP";
    const count = lineupSlotCounts[String(slotId)] ?? 0;
    for (let i = 0; i < count; i++) rosterPositions.push(slotType);
  }

  const teams: EspnTeam[] = (data.teams ?? []).map((team) => {
    const roster: EspnRosterSlot[] = (team.roster?.entries ?? []).map((entry) => {
      const raw = entry.playerPoolEntry?.player;
      const player: EspnPlayer | null = raw
        ? {
            espnPlayerId: raw.id,
            fullName: raw.fullName,
            position: ESPN_POSITION_MAP[raw.defaultPositionId] ?? "IDP",
            proTeam: ESPN_PRO_TEAM_MAP[raw.proTeamId] ?? null,
          }
        : null;
      return { slotType: ESPN_SLOT_MAP[entry.lineupSlotId] ?? "IDP", player };
    });
    return {
      teamId: team.id,
      teamName: team.name || `${team.location ?? ""} ${team.nickname ?? ""}`.trim() || `Team ${team.id}`,
      roster,
    };
  });

  return {
    leagueId,
    season,
    name: data.settings?.name || `ESPN League ${leagueId}`,
    rosterPositions,
    teams,
  };
}
