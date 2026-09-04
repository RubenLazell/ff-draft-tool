"use client";

import { useMemo, useState } from "react";
import type { RankedPlayer } from "@/lib/rankings";
import {
  scoreLeagueTeams,
  rankByConsensus,
  gradeForDelta,
  type TeamResult,
  type PositionRanked,
  type TradeGradeTone,
} from "@/lib/leagueScoring";
import { POSITION_ORDER, POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";

function positionColor(position: string) {
  return POSITION_COLORS[position as keyof typeof POSITION_COLORS] ?? FALLBACK_POSITION_COLOR;
}

function fullRoster(team: TeamResult): PositionRanked[] {
  const starters = team.lineup.starters.map((s) => s.player).filter((p): p is PositionRanked => p != null);
  return [...starters, ...team.lineup.bench];
}

// Distinct from any real Sleeper roster_id (a small positive integer) or
// ESPN team id, so the four synthetic before/after rosters built for a
// trade preview can never collide with — or be mistaken for — an actual
// team in the league.
const SYNTHETIC_IDS = { beforeA: -1, afterA: -2, beforeB: -3, afterB: -4 };

const GRADE_TONE_CLASSES: Record<TradeGradeTone, string> = {
  great: "bg-emerald-500 text-white",
  good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  fair: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  bad: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
  terrible: "bg-red-500 text-white",
};

function formatDelta(delta: number): string {
  const rounded = delta.toFixed(1);
  return delta > 0 ? `+${rounded}` : rounded;
}

export function TradeCalculator({
  results,
  rankings,
  league,
}: {
  results: TeamResult[];
  rankings: RankedPlayer[];
  league: { rosterPositions: string[]; totalRosters: number };
}) {
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [awayFromA, setAwayFromA] = useState<Set<string>>(new Set());
  const [awayFromB, setAwayFromB] = useState<Set<string>>(new Set());

  const teamA = results.find((t) => t.rosterId === teamAId) ?? null;
  const teamB = results.find((t) => t.rosterId === teamBId) ?? null;
  const rosterA = useMemo(() => (teamA ? fullRoster(teamA) : []), [teamA]);
  const rosterB = useMemo(() => (teamB ? fullRoster(teamB) : []), [teamB]);

  function togglePlayer(side: "A" | "B", playerId: string) {
    const set = side === "A" ? awayFromA : awayFromB;
    const setter = side === "A" ? setAwayFromA : setAwayFromB;
    const next = new Set(set);
    if (next.has(playerId)) next.delete(playerId);
    else next.add(playerId);
    setter(next);
  }

  function selectTeam(side: "A" | "B", rosterId: number) {
    if (side === "A") {
      setTeamAId(rosterId);
      setAwayFromA(new Set());
    } else {
      setTeamBId(rosterId);
      setAwayFromB(new Set());
    }
  }

  const hasProposal = awayFromA.size > 0 || awayFromB.size > 0;

  const trade = useMemo(() => {
    if (!teamA || !teamB || !hasProposal) return null;

    const keepA = rosterA.filter((p) => !awayFromA.has(p.playerId)).map((p) => p.playerId);
    const keepB = rosterB.filter((p) => !awayFromB.has(p.playerId)).map((p) => p.playerId);
    const incomingToA = [...awayFromB];
    const incomingToB = [...awayFromA];

    const syntheticRosters = [
      { rosterId: SYNTHETIC_IDS.beforeA, ownerId: null, teamName: teamA.teamName, playerIds: rosterA.map((p) => p.playerId) },
      { rosterId: SYNTHETIC_IDS.afterA, ownerId: null, teamName: teamA.teamName, playerIds: [...keepA, ...incomingToA] },
      { rosterId: SYNTHETIC_IDS.beforeB, ownerId: null, teamName: teamB.teamName, playerIds: rosterB.map((p) => p.playerId) },
      { rosterId: SYNTHETIC_IDS.afterB, ownerId: null, teamName: teamB.teamName, playerIds: [...keepB, ...incomingToB] },
    ];

    const personal = scoreLeagueTeams(league, syntheticRosters, rankings);
    const market = scoreLeagueTeams(league, syntheticRosters, rankByConsensus(rankings));
    const find = (list: TeamResult[], id: number) => list.find((r) => r.rosterId === id)!;

    return {
      personal: {
        beforeA: find(personal, SYNTHETIC_IDS.beforeA),
        afterA: find(personal, SYNTHETIC_IDS.afterA),
        beforeB: find(personal, SYNTHETIC_IDS.beforeB),
        afterB: find(personal, SYNTHETIC_IDS.afterB),
      },
      market: {
        beforeA: find(market, SYNTHETIC_IDS.beforeA),
        afterA: find(market, SYNTHETIC_IDS.afterA),
        beforeB: find(market, SYNTHETIC_IDS.beforeB),
        afterB: find(market, SYNTHETIC_IDS.afterB),
      },
    };
  }, [teamA, teamB, hasProposal, rosterA, rosterB, awayFromA, awayFromB, league, rankings]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <TeamPicker label="Team A" teams={results} selectedId={teamAId} excludeId={teamBId} onSelect={(id) => selectTeam("A", id)} />
        <TeamPicker label="Team B" teams={results} selectedId={teamBId} excludeId={teamAId} onSelect={(id) => selectTeam("B", id)} />
      </div>

      {teamA && teamB && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
            <RosterColumn team={teamA} roster={rosterA} away={awayFromA} onToggle={(id) => togglePlayer("A", id)} />
            <div className="hidden items-center justify-center pt-12 text-2xl text-zinc-400 sm:flex dark:text-zinc-600">
              <span className={hasProposal ? "animate-pulse" : ""}>⇄</span>
            </div>
            <RosterColumn team={teamB} roster={rosterB} away={awayFromB} onToggle={(id) => togglePlayer("B", id)} />
          </div>

          {trade && (
            <div className="flex flex-col gap-4 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
              <TradeSideSummary
                teamName={teamA.teamName}
                before={trade.personal.beforeA}
                after={trade.personal.afterA}
                marketBefore={trade.market.beforeA}
                marketAfter={trade.market.afterA}
              />
              <div className="border-t border-black/[.08] dark:border-white/[.145]" />
              <TradeSideSummary
                teamName={teamB.teamName}
                before={trade.personal.beforeB}
                after={trade.personal.afterB}
                marketBefore={trade.market.beforeB}
                marketAfter={trade.market.afterB}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TeamPicker({
  label,
  teams,
  selectedId,
  excludeId,
  onSelect,
}: {
  label: string;
  teams: TeamResult[];
  selectedId: number | null;
  excludeId: number | null;
  onSelect: (rosterId: number) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="flex flex-wrap gap-2">
        {teams
          .filter((t) => t.rosterId !== excludeId)
          .map((t) => (
            <button
              key={t.rosterId}
              type="button"
              onClick={() => onSelect(t.rosterId)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                selectedId === t.rosterId
                  ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {t.teamName}
            </button>
          ))}
      </div>
    </div>
  );
}

function RosterColumn({
  team,
  roster,
  away,
  onToggle,
}: {
  team: TeamResult;
  roster: PositionRanked[];
  away: Set<string>;
  onToggle: (playerId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="truncate font-medium text-black dark:text-zinc-50">{team.teamName}</h3>
      <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-black/[.08] p-2 sm:grid-cols-3 dark:border-white/[.145]">
        {roster.map((player) => (
          <TradePlayerCard
            key={player.playerId}
            player={player}
            selected={away.has(player.playerId)}
            onClick={() => onToggle(player.playerId)}
          />
        ))}
      </div>
    </div>
  );
}

function TradePlayerCard({
  player,
  selected,
  onClick,
}: {
  player: PositionRanked;
  selected: boolean;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const color = positionColor(player.position);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-center transition-all duration-150 ${
        selected
          ? "scale-[1.03] border-blue-500 bg-blue-50 shadow-md dark:bg-blue-950/30"
          : "border-black/[.08] hover:-translate-y-0.5 hover:border-black/20 dark:border-white/[.145] dark:hover:border-white/30"
      }`}
    >
      {selected && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
          ✓
        </span>
      )}
      {!imgError ? (
        <img
          src={`https://sleepercdn.com/content/nfl/players/thumb/${player.playerId}.jpg`}
          alt=""
          onError={() => setImgError(true)}
          className="h-12 w-12 rounded-full object-cover"
        />
      ) : (
        <span className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${color.bg} ${color.text}`}>
          {player.position}
        </span>
      )}
      <span className="w-full truncate text-xs font-medium text-black dark:text-zinc-50">{player.fullName}</span>
      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
        {player.position}
        {player.positionRank}
        {player.consensusRank != null && ` · ADP ${player.consensusRank.toFixed(0)}`}
      </span>
    </button>
  );
}

function TradeSideSummary({
  teamName,
  before,
  after,
  marketBefore,
  marketAfter,
}: {
  teamName: string;
  before: TeamResult;
  after: TeamResult;
  marketBefore: TeamResult;
  marketAfter: TeamResult;
}) {
  const personalDelta = after.score - before.score;
  const marketDelta = marketAfter.score - marketBefore.score;
  const personalGrade = gradeForDelta(personalDelta);
  const marketGrade = gradeForDelta(marketDelta);
  const maxScore = Math.max(before.score, after.score, 1);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-black dark:text-zinc-50">{teamName}</p>
      <ScoreBar label="Before" team={before} maxScore={maxScore} />
      <ScoreBar label="After" team={after} maxScore={maxScore} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">Your rankings:</span>
          <span className={personalDelta >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-red-600 dark:text-red-400"}>
            {formatDelta(personalDelta)}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GRADE_TONE_CLASSES[personalGrade.tone]}`}>
            {personalGrade.label}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">Market ADP:</span>
          <span className={marketDelta >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-red-600 dark:text-red-400"}>
            {formatDelta(marketDelta)}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GRADE_TONE_CLASSES[marketGrade.tone]}`}>
            {marketGrade.label}
          </span>
        </span>
      </div>
    </div>
  );
}

function ScoreBar({ label, team, maxScore }: { label: string; team: TeamResult; maxScore: number }) {
  const widthPct = team.score > 0 ? Math.max(2, (team.score / maxScore) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="flex h-full rounded-full transition-[width] duration-300" style={{ width: `${widthPct}%` }}>
          {POSITION_ORDER.map((pos) => {
            const value = team.positionBreakdown[pos] ?? 0;
            if (value <= 0 || team.score <= 0) return null;
            const sharePct = (value / team.score) * 100;
            return <div key={pos} className={`transition-all duration-300 ${positionColor(pos).swatch}`} style={{ width: `${sharePct}%` }} />;
          })}
        </div>
      </div>
      <span className="w-12 shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">{team.score.toFixed(1)}</span>
    </div>
  );
}
