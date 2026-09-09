import type { RankedPlayer } from "@/lib/rankings";
import type { MatchupResult, ResolvedRosterEntry } from "@/lib/leagueImport";
import {
  withPositionRanks,
  resolveRosterPlayers,
  buildOptimalLineup,
  computeReplacementRanks,
  computePositionBreakdown,
  type PositionRanked,
} from "@/lib/leagueScoring";
import { POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";

function positionColor(position: string) {
  return POSITION_COLORS[position as keyof typeof POSITION_COLORS] ?? FALLBACK_POSITION_COLOR;
}

function RosterList({ starters, bench }: { starters: PositionRanked[]; bench: PositionRanked[] }) {
  return (
    <div className="flex flex-col gap-1">
      {starters.map((p) => (
        <div key={p.playerId} className="flex items-center gap-2 text-sm">
          <span
            className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(p.position).bg} ${positionColor(p.position).text}`}
          >
            {p.position}
            {p.positionRank}
          </span>
          <span className="min-w-0 truncate text-black dark:text-zinc-50">{p.fullName}</span>
        </div>
      ))}
      {bench.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
            +{bench.length} bench
          </summary>
          <div className="mt-1 flex flex-col gap-1">
            {bench.map((p) => (
              <div key={p.playerId} className="flex items-center gap-2 text-sm">
                <span
                  className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(p.position).bg} ${positionColor(p.position).text}`}
                >
                  {p.position}
                  {p.positionRank}
                </span>
                <span className="min-w-0 truncate text-black dark:text-zinc-50">{p.fullName}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function MatchupCard({
  leagueName,
  result,
  rankings,
}: {
  leagueName: string;
  result: MatchupResult;
  rankings: RankedPlayer[];
}) {
  if (result.error !== null) {
    return (
      <div className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
        <p className="font-medium text-black dark:text-zinc-50">{leagueName}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{result.error}</p>
      </div>
    );
  }

  const { week, league, myTeam, opponent } = result;
  const ranked = withPositionRanks(rankings);
  const rankingsById = new Map(ranked.map((p) => [p.playerId, p]));
  const replacementRanks = computeReplacementRanks(league.rosterPositions, league.totalRosters);

  function scoreFor(team: ResolvedRosterEntry) {
    const { resolved } = resolveRosterPlayers(team.playerIds, rankingsById);
    const lineup = buildOptimalLineup(league.rosterPositions, resolved);
    const breakdown = computePositionBreakdown(lineup, replacementRanks);
    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { lineup, score };
  }

  const mine = scoreFor(myTeam);
  const theirs = opponent ? scoreFor(opponent) : null;

  return (
    <div className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-medium text-black dark:text-zinc-50">{leagueName}</p>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Week {week}</span>
      </div>

      {!opponent || !theirs ? (
        <>
          <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">Bye week — no opponent this week.</p>
          <p className="mb-1 text-sm font-medium text-black dark:text-zinc-50">{myTeam.teamName}</p>
          <RosterList starters={mine.lineup.starters.map((s) => s.player).filter((p): p is PositionRanked => p != null)} bench={mine.lineup.bench} />
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-black dark:text-zinc-50">{myTeam.teamName}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Projected</span>
            <span className="font-medium text-black dark:text-zinc-50">{opponent.teamName}</span>
          </div>
          <div className="mb-4 flex items-center justify-center gap-3 text-sm">
            <span
              className={`font-semibold tabular-nums ${mine.score >= theirs.score ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}
            >
              {mine.score.toFixed(1)}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-600">vs</span>
            <span
              className={`font-semibold tabular-nums ${theirs.score >= mine.score ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}
            >
              {theirs.score.toFixed(1)}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RosterList starters={mine.lineup.starters.map((s) => s.player).filter((p): p is PositionRanked => p != null)} bench={mine.lineup.bench} />
            <RosterList starters={theirs.lineup.starters.map((s) => s.player).filter((p): p is PositionRanked => p != null)} bench={theirs.lineup.bench} />
          </div>
        </>
      )}
    </div>
  );
}
