// Shared "fetch this league's rosters from whichever platform, resolved
// down to plain scoreLeagueTeams-ready shapes" logic — used by both the
// signed-in league detail page (credentials come from a saved user_leagues
// row) and the guest preview flow (credentials come straight from the
// form, nothing persisted). Deliberately stops short of sourcing rankings
// or calling scoreLeagueTeams itself, since callers legitimately differ
// there (a signed-in user's own rankings vs. guest default rankings).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSleeperLeague, fetchSleeperRosters, fetchSleeperUsers } from "@/lib/sleeper";
import { fetchEspnLeague, EspnAuthRequiredError, type EspnCredentials } from "@/lib/espn";
import { resolveEspnRosters } from "@/lib/espnMatching";

export type ResolvedLeague = {
  league: { rosterPositions: string[]; totalRosters: number; name: string };
  rosters: { rosterId: number; ownerId: string | null; teamName: string; playerIds: string[] }[];
};

export async function fetchAndResolveLeague(
  supabase: SupabaseClient,
  platform: "SLEEPER" | "ESPN",
  leagueId: string,
  espnSeason?: string | null,
  espnCredentials?: EspnCredentials
): Promise<{ error: string } | { error: null; resolved: ResolvedLeague }> {
  if (platform === "SLEEPER") {
    const league = await fetchSleeperLeague(leagueId);
    if (!league) return { error: "Couldn't find that Sleeper league. Check the ID and try again." };
    if (league.sport !== "nfl") return { error: "That league isn't an NFL league." };
    if (league.totalRosters === 0) return { error: "That league has no teams yet." };

    const [rosters, users] = await Promise.all([fetchSleeperRosters(leagueId), fetchSleeperUsers(leagueId)]);
    const usersById = new Map(users.map((u) => [u.userId, u]));
    const rostersWithNames = rosters.map((r) => {
      const owner = r.ownerId ? usersById.get(r.ownerId) : undefined;
      return {
        rosterId: r.rosterId,
        ownerId: r.ownerId,
        playerIds: r.playerIds,
        teamName: owner?.teamName || owner?.displayName || `Team ${r.rosterId}`,
      };
    });
    return { error: null, resolved: { league, rosters: rostersWithNames } };
  }

  const season = espnSeason?.trim() || String(new Date().getFullYear());
  let espnLeague;
  try {
    espnLeague = await fetchEspnLeague(leagueId, season, espnCredentials);
  } catch (err) {
    if (err instanceof EspnAuthRequiredError) {
      return {
        error: espnCredentials
          ? "Those cookies didn't work for this league. Double-check SWID and espn_s2 and try again."
          : "This looks like a private league — paste your SWID and espn_s2 cookies below and try again.",
      };
    }
    throw err;
  }
  if (!espnLeague) return { error: "Couldn't find that ESPN league. Check the ID and season and try again." };
  if (espnLeague.teams.length === 0) return { error: "That league has no teams yet." };

  const rostersWithNames = await resolveEspnRosters(supabase, espnLeague);
  return {
    error: null,
    resolved: {
      league: {
        rosterPositions: espnLeague.rosterPositions,
        totalRosters: espnLeague.teams.length,
        name: espnLeague.name,
      },
      rosters: rostersWithNames,
    },
  };
}
