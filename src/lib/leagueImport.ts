// Shared "fetch this league's rosters from whichever platform, resolved
// down to plain scoreLeagueTeams-ready shapes" logic — used by both the
// signed-in league detail page (credentials come from a saved user_leagues
// row) and the guest preview flow (credentials come straight from the
// form, nothing persisted). Deliberately stops short of sourcing rankings
// or calling scoreLeagueTeams itself, since callers legitimately differ
// there (a signed-in user's own rankings vs. guest default rankings).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchSleeperLeague,
  fetchSleeperRosters,
  fetchSleeperUsers,
  fetchSleeperCurrentWeek,
  fetchSleeperMatchups,
} from "@/lib/sleeper";
import { fetchEspnLeague, EspnAuthRequiredError, type EspnCredentials } from "@/lib/espn";
import { resolveEspnRosters } from "@/lib/espnMatching";

export type ResolvedRosterEntry = { rosterId: number; ownerId: string | null; teamName: string; playerIds: string[] };

export type ResolvedLeague = {
  league: { rosterPositions: string[]; totalRosters: number; name: string };
  rosters: ResolvedRosterEntry[];
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

// This week's game for one specific roster — who they're playing and both
// full rosters, resolved the same way fetchAndResolveLeague already does.
// Deliberately ignores each platform's actual weekly starter/bench split
// (Sleeper's `starters`, ESPN's `lineupSlotId`) in favor of the full
// roster, matching how this app already recomputes its own optimal
// lineup rather than trusting a manager's real-world lineup choice.
export type MatchupResult =
  | { error: string }
  | {
      error: null;
      week: number;
      league: { rosterPositions: string[]; totalRosters: number; name: string };
      myTeam: ResolvedRosterEntry;
      opponent: ResolvedRosterEntry | null;
    };

export async function fetchCurrentMatchup(
  supabase: SupabaseClient,
  platform: "SLEEPER" | "ESPN",
  leagueId: string,
  myRosterId: number,
  espnSeason?: string | null,
  espnCredentials?: EspnCredentials
): Promise<MatchupResult> {
  if (platform === "SLEEPER") {
    const [week, sleeperLeague] = await Promise.all([fetchSleeperCurrentWeek(), fetchSleeperLeague(leagueId)]);
    if (!sleeperLeague) return { error: "Couldn't find that Sleeper league. Check the ID and try again." };
    const [matchups, rosters, users] = await Promise.all([
      fetchSleeperMatchups(leagueId, week),
      fetchSleeperRosters(leagueId),
      fetchSleeperUsers(leagueId),
    ]);

    const mine = matchups.find((m) => m.rosterId === myRosterId);
    if (!mine) return { error: "Couldn't find your roster for this week." };
    const opponentEntry =
      mine.matchupId != null
        ? matchups.find((m) => m.rosterId !== myRosterId && m.matchupId === mine.matchupId)
        : undefined;

    const usersById = new Map(users.map((u) => [u.userId, u]));
    const rostersById = new Map(rosters.map((r) => [r.rosterId, r]));
    const teamNameFor = (rosterId: number): string => {
      const roster = rostersById.get(rosterId);
      const owner = roster?.ownerId ? usersById.get(roster.ownerId) : undefined;
      return owner?.teamName || owner?.displayName || `Team ${rosterId}`;
    };

    const myTeam: ResolvedRosterEntry = {
      rosterId: myRosterId,
      ownerId: rostersById.get(myRosterId)?.ownerId ?? null,
      teamName: teamNameFor(myRosterId),
      playerIds: mine.playerIds,
    };
    const opponent: ResolvedRosterEntry | null = opponentEntry
      ? {
          rosterId: opponentEntry.rosterId,
          ownerId: rostersById.get(opponentEntry.rosterId)?.ownerId ?? null,
          teamName: teamNameFor(opponentEntry.rosterId),
          playerIds: opponentEntry.playerIds,
        }
      : null;

    return {
      error: null,
      week,
      league: {
        rosterPositions: sleeperLeague.rosterPositions,
        totalRosters: sleeperLeague.totalRosters,
        name: sleeperLeague.name,
      },
      myTeam,
      opponent,
    };
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

  const game = espnLeague.schedule.find(
    (m) =>
      m.matchupPeriodId === espnLeague!.currentMatchupPeriodId &&
      (m.awayTeamId === myRosterId || m.homeTeamId === myRosterId)
  );
  if (!game) return { error: "Couldn't find your matchup for this week." };
  const opponentTeamId = game.awayTeamId === myRosterId ? game.homeTeamId : game.awayTeamId;

  const rosters = await resolveEspnRosters(supabase, espnLeague);
  const rostersById = new Map(rosters.map((r) => [r.rosterId, r]));
  const myTeam = rostersById.get(myRosterId);
  if (!myTeam) return { error: "Couldn't find your roster." };
  const opponent = opponentTeamId != null ? rostersById.get(opponentTeamId) ?? null : null;

  return {
    error: null,
    week: espnLeague.currentMatchupPeriodId,
    league: {
      rosterPositions: espnLeague.rosterPositions,
      totalRosters: espnLeague.teams.length,
      name: espnLeague.name,
    },
    myTeam,
    opponent,
  };
}
