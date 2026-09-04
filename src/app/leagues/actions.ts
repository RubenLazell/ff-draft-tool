"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { fetchSleeperLeague } from "@/lib/sleeper";
import { fetchEspnLeague, EspnAuthRequiredError } from "@/lib/espn";
import { fetchAndResolveLeague } from "@/lib/leagueImport";
import { getDefaultRankings, type Format, type RankedPlayer } from "@/lib/rankings";
import { scoreLeagueTeams, type TeamResult } from "@/lib/leagueScoring";

export async function addLeague(leagueId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = leagueId.trim();
  if (!trimmed) return { error: "Enter a Sleeper league ID." };

  const league = await fetchSleeperLeague(trimmed);
  if (!league) return { error: "Couldn't find that Sleeper league. Check the ID and try again." };
  if (league.sport !== "nfl") return { error: "That league isn't an NFL league." };
  if (league.totalRosters === 0) return { error: "That league has no teams yet." };

  const { error } = await supabase.from("user_leagues").insert({
    user_id: user.id,
    platform: "SLEEPER",
    league_id: trimmed,
    league_name: league.name,
  });
  if (error) {
    if (error.code === "23505") return { error: "You've already added this league." };
    return { error: error.message };
  }
  return { error: null };
}

export async function addEspnLeague(
  leagueId: string,
  season: string,
  swid: string,
  espnS2: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmedId = leagueId.trim();
  const trimmedSeason = season.trim();
  const trimmedSwid = swid.trim();
  const trimmedS2 = espnS2.trim();
  if (!trimmedId) return { error: "Enter an ESPN league ID." };
  if (!trimmedSeason) return { error: "Enter a season year." };

  const credentials = trimmedSwid && trimmedS2 ? { swid: trimmedSwid, espnS2: trimmedS2 } : undefined;

  let league;
  try {
    league = await fetchEspnLeague(trimmedId, trimmedSeason, credentials);
  } catch (err) {
    if (err instanceof EspnAuthRequiredError) {
      return {
        error: credentials
          ? "Those cookies didn't work for this league. Double-check SWID and espn_s2 and try again."
          : "This looks like a private league — paste your SWID and espn_s2 cookies below and try again.",
      };
    }
    throw err;
  }
  if (!league) return { error: "Couldn't find that ESPN league. Check the ID and season and try again." };
  if (league.teams.length === 0) return { error: "That league has no teams yet." };

  const { error } = await supabase.from("user_leagues").insert({
    user_id: user.id,
    platform: "ESPN",
    league_id: trimmedId,
    league_name: league.name,
    season: trimmedSeason,
    espn_swid: credentials?.swid ?? null,
    espn_s2: credentials?.espnS2 ?? null,
  });
  if (error) {
    if (error.code === "23505") return { error: "You've already added this league." };
    return { error: error.message };
  }
  return { error: null };
}

export type LeaguePreview =
  | { error: string; leagueName?: undefined; results?: undefined; rankings?: undefined; league?: undefined }
  | {
      error: null;
      leagueName: string;
      results: TeamResult[];
      rankings: RankedPlayer[];
      league: { rosterPositions: string[]; totalRosters: number };
    };

// Guest-accessible: no auth, nothing persisted. Scored against default
// consensus rankings rather than a signed-in user's own — reads run
// through the service-role client for the same reason guest mode's
// rankings board does (RLS blocks anon reads on `players`/
// `consensus_rankings`, and there's no session to read `user_leagues`
// with anyway since nothing gets saved here).
export async function previewLeague(
  platform: "SLEEPER" | "ESPN",
  leagueId: string,
  format: Format,
  season?: string,
  swid?: string,
  espnS2?: string
): Promise<LeaguePreview> {
  const trimmedId = leagueId.trim();
  if (!trimmedId) {
    return { error: `Enter a ${platform === "SLEEPER" ? "Sleeper" : "ESPN"} league ID.` };
  }

  const supabase = createServiceRoleClient();
  const credentials = swid?.trim() && espnS2?.trim() ? { swid: swid.trim(), espnS2: espnS2.trim() } : undefined;

  const fetchResult = await fetchAndResolveLeague(supabase, platform, trimmedId, season, credentials);
  if (fetchResult.error !== null) return { error: fetchResult.error };

  const rankings = await getDefaultRankings(supabase, format);
  const { league, rosters } = fetchResult.resolved;
  const results = scoreLeagueTeams(league, rosters, rankings);
  return {
    error: null,
    leagueName: league.name,
    results,
    rankings,
    league: { rosterPositions: league.rosterPositions, totalRosters: league.totalRosters },
  };
}

export async function removeLeague(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("user_leagues").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  return { error: null };
}

// A plain `<form action={fn}>` requires fn: (formData) => void | Promise<void>
// — this wraps removeLeague (which returns {error} for callers that check
// it) for that one use site, where there's nowhere to show an error anyway.
export async function removeLeagueFormAction(id: string): Promise<void> {
  await removeLeague(id);
}
