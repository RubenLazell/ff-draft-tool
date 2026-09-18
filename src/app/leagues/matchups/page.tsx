import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings } from "@/lib/rankings";
import { fetchCurrentMatchup, type MatchupResult, type MatchupRosterEntry } from "@/lib/leagueImport";
import { withPositionRanks, resolveRosterPlayers } from "@/lib/leagueScoring";
import { fetchSleeperCurrentWeek, fetchSleeperProjections, fetchSleeperWeekStats, type SleeperPlayerLine } from "@/lib/sleeper";
import { fetchNflSchedule, type NflGame } from "@/lib/nflSchedule";
import { groupPlayersByGame, type GameGroup, type RosterPlayerWithSlot } from "@/lib/matchupsByGame";
import { buildLiveMatchup, type LiveMatchup } from "@/lib/liveScoring";
import { MatchupsView } from "./MatchupsView";
import { LiveRefresh } from "./LiveRefresh";

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

  // Week/schedule/projections/live-stats are the same for every league this
  // user has linked — fetched once here rather than per league.
  const season = String(new Date().getFullYear());
  let week = 1;
  let schedule: NflGame[] = [];
  let projections = new Map<string, SleeperPlayerLine>();
  let stats = new Map<string, SleeperPlayerLine>();
  let scheduleError: string | null = null;
  try {
    week = await fetchSleeperCurrentWeek();
    [schedule, projections, stats] = await Promise.all([
      fetchNflSchedule(week, season),
      fetchSleeperProjections(season, week),
      fetchSleeperWeekStats(season, week),
    ]);
  } catch {
    scheduleError = "Couldn't load the NFL schedule right now — try again later.";
  }

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
  // Tags each player with whether they're a real starter (Sleeper's
  // starters list / ESPN's non-bench lineupSlotId, same starterPlayerIds
  // the By League live-scoring cards use — see liveScoring.ts) so the
  // by-game view can default to starters-only with bench tucked behind a
  // toggle. Previously this recomputed its own "optimal" lineup from the
  // user's own rankings instead of trusting real starters, which meant a
  // player who actually was starting could show up under bench here.
  const ranked = withPositionRanks(rankings);
  const rankingsById = new Map(ranked.map((p) => [p.playerId, p]));

  function tagWithStarterStatus(team: MatchupRosterEntry): RosterPlayerWithSlot[] {
    const { resolved } = resolveRosterPlayers(team.playerIds, rankingsById);
    const starterSet = new Set(team.starterPlayerIds);
    return resolved.map((p) => ({ ...p, isStarter: starterSet.has(p.playerId) }));
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
        myRoster: tagWithStarterStatus(result.myTeam),
        opponentRoster: tagWithStarterStatus(result.opponent!),
      };
    });

  const gameGroups: GameGroup[] = scheduleError
    ? []
    : groupPlayersByGame(leagueMatchupsForGrouping, schedule);

  // Live projections/scoring/win-% per league, By League tab only — real
  // starters (not the recomputed-optimal lineup used above for By Game),
  // see liveScoring.ts. Attached directly onto each card (rather than kept
  // in a separate Map) since Maps shouldn't cross the server->client
  // component boundary as props.
  const cardsWithLive = cards.map((card) => {
    const live: LiveMatchup | null =
      !scheduleError && isSuccess(card.result) && card.result.opponent
        ? buildLiveMatchup(
            card.result.myTeam,
            card.result.opponent,
            card.result.pointsFormat,
            rankingsById,
            projections,
            stats,
            schedule
          )
        : null;
    return { ...card, live };
  });

  // Score-graph history: one row per league per refresh, once any starter
  // has actually kicked off (skips pointless 0-0 rows pre-game). Reuses
  // the `live` data already computed above — no extra fetching. Never
  // allowed to break the page; the graph is a nice-to-have on top of the
  // live-scoring cards, not core functionality.
  await Promise.all(
    cardsWithLive.map(async (card) => {
      if (!card.live) return;
      const anyStarted =
        card.live.mine.starters.some((s) => s.hasStarted) || card.live.theirs.starters.some((s) => s.hasStarted);
      if (!anyStarted) return;
      try {
        await supabase.from("matchup_score_snapshots").insert({
          user_league_id: card.leagueRowId,
          week,
          my_total: card.live.mine.currentTotal,
          opponent_total: card.live.theirs.currentTotal,
          my_win_probability: card.live.myWinProbability,
          my_players: card.live.mine.starters.map((s) => ({
            playerId: s.playerId,
            fullName: s.fullName,
            position: s.position,
            points: s.points,
            raw: s.raw,
          })),
          opponent_players: card.live.theirs.starters.map((s) => ({
            playerId: s.playerId,
            fullName: s.fullName,
            position: s.position,
            points: s.points,
            raw: s.raw,
          })),
        });
      } catch {
        // Best-effort — a missed snapshot just means a slightly sparser graph.
      }
    })
  );

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/leagues"
          className="mb-4 inline-block text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Back to leagues
        </Link>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">My Matchups</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Week {week} — live projections and win % from Sleeper&apos;s stats feed, updating as games play.
            </p>
          </div>
          <LiveRefresh />
        </div>

        {cards.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No leagues set up yet — go to{" "}
            <Link href="/leagues" className="underline">
              Leagues
            </Link>{" "}
            and pick your team in each one.
          </p>
        ) : (
          <MatchupsView cards={cardsWithLive} gameGroups={gameGroups} scheduleError={scheduleError} />
        )}
      </div>
    </div>
  );
}
