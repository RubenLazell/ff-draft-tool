import { useState } from "react";
import type { MatchupResult } from "@/lib/leagueImport";
import type { LiveMatchup, LivePlayerLine, LiveTeamScore } from "@/lib/liveScoring";
import { POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";
import { ScoreGraph } from "./ScoreGraph";

function positionColor(position: string) {
  return POSITION_COLORS[position as keyof typeof POSITION_COLORS] ?? FALLBACK_POSITION_COLOR;
}

function PlayerRow({ line }: { line: LivePlayerLine }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(line.position).bg} ${positionColor(line.position).text}`}
        >
          {line.position}
        </span>
        <div className="min-w-0">
          <p className="truncate text-black dark:text-zinc-50">{line.fullName}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {line.gameDetail}
            {!line.hasStarted && ` · proj ${line.points.toFixed(1)}`}
            {line.hasStarted && !line.isFinal && ` · proj final ${line.projectedFinal.toFixed(1)}`}
            {line.breakdown.length > 0 && ` · ${line.breakdown.join(", ")}`}
          </p>
        </div>
      </div>
      <span className="shrink-0 font-medium tabular-nums text-black dark:text-zinc-50">
        {line.hasStarted ? line.points.toFixed(1) : "0.0"}
      </span>
    </div>
  );
}

function RosterList({ team }: { team: LiveTeamScore }) {
  return (
    <div className="flex flex-col gap-2">
      {team.starters.map((line) => (
        <PlayerRow key={line.playerId} line={line} />
      ))}
      {team.bench.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
            +{team.bench.length} bench
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {team.bench.map((line) => (
              <PlayerRow key={line.playerId} line={line} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function MatchupCard({
  leagueRowId,
  leagueName,
  result,
  live,
}: {
  leagueRowId: string;
  leagueName: string;
  result: MatchupResult;
  live: LiveMatchup | null;
}) {
  const [showGraph, setShowGraph] = useState(false);

  if (result.error !== null) {
    return (
      <div className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
        <p className="font-medium text-black dark:text-zinc-50">{leagueName}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{result.error}</p>
      </div>
    );
  }

  const { week, myTeam, opponent } = result;

  if (!opponent || !live) {
    return (
      <div className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="font-medium text-black dark:text-zinc-50">{leagueName}</p>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Week {week}</span>
        </div>
        <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
          {opponent ? "Couldn't load live scoring right now." : "Bye week — no opponent this week."}
        </p>
        <p className="mb-1 text-sm font-medium text-black dark:text-zinc-50">{myTeam.teamName}</p>
      </div>
    );
  }

  const { mine, theirs, myWinProbability } = live;
  const bothFinal = mine.starters.every((s) => s.isFinal) && theirs.starters.every((s) => s.isFinal);
  const winPct = Math.round(myWinProbability * 100);

  return (
    <div className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-medium text-black dark:text-zinc-50">{leagueName}</p>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Week {week}</span>
      </div>

      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-black dark:text-zinc-50">{mine.teamName}</span>
        <span className="font-medium text-black dark:text-zinc-50">{theirs.teamName}</span>
      </div>
      <p className="text-center text-[10px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-600">
        {bothFinal ? "Final" : "Live"}
      </p>
      <div className="mb-1 flex items-center justify-center gap-3">
        <span
          className={`text-4xl font-bold tabular-nums ${mine.currentTotal >= theirs.currentTotal ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}
        >
          {mine.currentTotal.toFixed(1)}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-600">vs</span>
        <span
          className={`text-4xl font-bold tabular-nums ${theirs.currentTotal >= mine.currentTotal ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}
        >
          {theirs.currentTotal.toFixed(1)}
        </span>
      </div>
      {!bothFinal && (
        <p className="mb-1 text-center text-sm font-medium text-black dark:text-zinc-50">
          {winPct >= 50 ? `You: ${winPct}% to win` : `Opponent: ${100 - winPct}% to win`}
        </p>
      )}
      <p className="mb-2 text-center text-[10px] text-zinc-400 dark:text-zinc-600">
        {bothFinal ? "" : `proj. final ${mine.projectedTotal.toFixed(1)} – ${theirs.projectedTotal.toFixed(1)}`}
      </p>

      <div className="mb-4 flex justify-center">
        <button
          type="button"
          onClick={() => setShowGraph(true)}
          className="rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
        >
          📈 See graph
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RosterList team={mine} />
        <RosterList team={theirs} />
      </div>

      <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-600">
        Points and win % come from Sleeper&apos;s live stats and projections — generic PPR/Standard scoring for
        ESPN leagues, not your league&apos;s exact rules.
      </p>

      {showGraph && (
        <ScoreGraph
          leagueRowId={leagueRowId}
          week={week}
          myTeamName={mine.teamName}
          opponentTeamName={theirs.teamName}
          onClose={() => setShowGraph(false)}
        />
      )}
    </div>
  );
}
