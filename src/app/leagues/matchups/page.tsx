import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings } from "@/lib/rankings";
import { fetchCurrentMatchup, type MatchupResult, type ResolvedRosterEntry } from "@/lib/leagueImport";
import { withPositionRanks, resolveRosterPlayers, buildOptimalLineup, type PositionRanked } from "@/lib/leagueScoring";
import { fetchSleeperCurrentWeek } from "@/lib/sleeper";
import { fetchNflSchedule } from "@/lib/nflSchedule";
import { groupPlayersByGame, type GameGroup, type RosterPlayerWithSlot } from "@/lib/matchupsByGame";
import { MatchupsView } from "./MatchupsView";

function isSuccess(result: MatchupResult): result is Extract<MatchupResult, { error: null }> {
  return result.error === null;
}

export default async function MatchupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: leagues } = await supabase
    .from("user_leagues")
    .select("id, league_id, league_name, platform, season, espn_swid, espn_s2, my_roster_id")
    .eq("user_id", user.id)
    .not("my_roster_id", "is", null)
    .order("created_at", { ascending: false });

  const rankings = await getOrCreateUserRankings(supabase, user.id, "PPR");

  const cards = await Promise.all(
    (leagues ?? []).map(async (league) => {
      const credentials =
        league.espn_swid && league.espn_s2 ? { swid: league.espn_swid, espnS2: league.espn_s2 } : undefined;
      const result = await fetchCurrentMatchup(
        supabase,
        league.platform,
        league.league_id,
        league.my_roster_id as number,
        league.season,
        credentials
      );
      return { leagueRowId: league.id as string, leagueName: league.league_name ?? league.league_id, result };
    })
  );

  // Re-group the same matchup data by real NFL game instead of by league —
  // "which of my/my opponents' players are in the Patriots @ Seahawks game."
  // Tags each player with whether they're in this app's own optimal
  // lineup (not either platform's actual weekly starter choice, same as
  // MatchupCard/League Import) so the by-game view can default to
  // starters-only with bench tucked behind a toggle.
  const ranked = withPositionRanks(rankings);
  const rankingsById = new Map(ranked.map((p) => [p.playerId, p]));

  function tagWithStarterStatus(team: ResolvedRosterEntry, rosterPositions: string[]): RosterPlayerWithSlot[] {
    const { resolved } = resolveRosterPlayers(team.playerIds, rankingsById);
    const lineup = buildOptimalLineup(rosterPositions, resolved);
    const starters = lineup.starters
      .map((s) => s.player)
      .filter((p): p is PositionRanked => p != null)
      .map((p) => ({ ...p, isStarter: true }));
    const bench = lineup.bench.map((p) => ({ ...p, isStarter: false }));
    return [...starters, ...bench];
  }

  const leagueMatchupsForGrouping = cards
    .filter((c) => isSuccess(c.result) && c.result.opponent)
    .map((c) => {
      const result = c.result as Extract<MatchupResult, { error: null }>;
      return {
        leagueRowId: c.leagueRowId,
        leagueName: c.leagueName,
        myTeamName: result.myTeam.teamName,
        opponentTeamName: result.opponent!.teamName,
        myRoster: tagWithStarterStatus(result.myTeam, result.league.rosterPositions),
        opponentRoster: tagWithStarterStatus(result.opponent!, result.league.rosterPositions),
      };
    });

  let gameGroups: GameGroup[] = [];
  let scheduleError: string | null = null;
  try {
    const week = await fetchSleeperCurrentWeek();
    const schedule = await fetchNflSchedule(week, String(new Date().getFullYear()));
    gameGroups = groupPlayersByGame(leagueMatchupsForGrouping, schedule);
  } catch {
    scheduleError = "Couldn't load the NFL schedule right now — try again later.";
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/leagues"
          className="mb-4 inline-block text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Back to leagues
        </Link>
        <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">My Matchups</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          This week&apos;s games in every league you&apos;ve set a team for, scored with your own rankings (PPR).
        </p>

        {cards.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No leagues set up yet — go to{" "}
            <Link href="/leagues" className="underline">
              Leagues
            </Link>{" "}
            and pick your team in each one.
          </p>
        ) : (
          <MatchupsView cards={cards} rankings={rankings} gameGroups={gameGroups} scheduleError={scheduleError} />
        )}
      </div>
    </div>
  );
}
