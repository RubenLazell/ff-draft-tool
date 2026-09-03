"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { RankedPlayer, Format } from "@/lib/rankings";
import { getInjuryBadge, POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";
import { swapRanks } from "./actions";

// Only these four are offered as a scope — K/DEF are excluded from this
// tool entirely per its whole premise (nobody wants to head-to-head their
// kickers), not just filtered out of an "ALL" view like the main board.
const SCOPES = ["OVERALL", "QB", "RB", "WR", "TE"] as const;
type Scope = (typeof SCOPES)[number];
const SCOPE_LABELS: Record<Scope, string> = {
  OVERALL: "Overall",
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
};

// The pool this tool draws pairs from — capped at the top 150 overall (a
// realistic draftable range) and always excluding K/DEF, regardless of
// scope, per the feature's own premise.
const POOL_SIZE = 150;

type DisplayPlayer = RankedPlayer & { overallRank: number; positionRank: number };

export function CompareView({
  initialRankings,
  format,
  formats,
  formatLabels,
}: {
  initialRankings: RankedPlayer[];
  format: Format;
  formats: readonly Format[];
  formatLabels: Record<Format, string>;
}) {
  const [players, setPlayers] = useState(initialRankings);
  const [scope, setScope] = useState<Scope>("OVERALL");
  const [dealSeed, setDealSeed] = useState(0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [comparisons, setComparisons] = useState(0);
  const [, startTransition] = useTransition();

  // Overall rank = position in the full sorted order (same definition used
  // everywhere else in the app, K/DEF included in the count) — the top-150
  // cutoff below is applied on top of that existing numbering rather than
  // inventing a separate "overall rank ignoring K/DEF" concept.
  const withRanks = useMemo<DisplayPlayer[]>(() => {
    const positionCounters: Record<string, number> = {};
    return players.map((p, i) => {
      positionCounters[p.position] = (positionCounters[p.position] ?? 0) + 1;
      return { ...p, overallRank: i + 1, positionRank: positionCounters[p.position] };
    });
  }, [players]);

  const pool = useMemo(
    () =>
      withRanks.filter(
        (p) => p.overallRank <= POOL_SIZE && p.position !== "K" && p.position !== "DEF"
      ),
    [withRanks]
  );

  // Pairs of adjacent players within the current scope — "adjacent" means
  // next to each other in the user's own order, not just close in value.
  // Filtering the pool down to one position preserves a clean 1..K prefix
  // for that position (position rank only increases with overall rank), so
  // consecutive pool entries of the same position are genuinely neighbors
  // in that position's own ordering too, not just coincidentally nearby.
  const pairs = useMemo(() => {
    const scoped = scope === "OVERALL" ? pool : pool.filter((p) => p.position === scope);
    const result: [DisplayPlayer, DisplayPlayer][] = [];
    for (let i = 0; i < scoped.length - 1; i++) {
      result.push([scoped[i], scoped[i + 1]]);
    }
    return result;
  }, [pool, scope]);

  // currentPair is fully derived, not stored-and-set-in-an-effect: `dealSeed`
  // exists purely to force a re-deal after a decision that didn't change
  // `players` (the user picked the already-higher-ranked player, so there
  // was nothing to swap). A swap naturally produces a new `pairs` reference
  // too, but bumping dealSeed either way keeps "deal a new pair after every
  // decision" simple and consistent instead of relying on that side effect.
  // Deliberately not Math.random() — this needs to run inside a pure
  // useMemo, so it's a plain multiplicative hash of the incrementing seed
  // instead: same (pairs, dealSeed) always yields the same pick, but
  // consecutive seeds land on well-spread, "random enough" indices.
  const currentPair = useMemo(() => {
    if (pairs.length === 0) return null;
    const index = (dealSeed * 2654435761) % pairs.length;
    return pairs[index];
  }, [pairs, dealSeed]);

  function handlePick(picked: DisplayPlayer, other: DisplayPlayer) {
    setPickedId(picked.playerId);
    setComparisons((c) => c + 1);

    // A larger rank number means "currently ranked lower" (worse) — if the
    // player the user preferred is the one currently ranked lower, that
    // contradicts the existing order, so swap them. If they picked the one
    // already ranked higher, the board already agrees — nothing to change.
    if (picked.rank > other.rank) {
      const previousPlayers = players;
      const nextPlayers = players
        .map((p) => {
          if (p.playerId === picked.playerId) return { ...p, rank: other.rank };
          if (p.playerId === other.playerId) return { ...p, rank: picked.rank };
          return p;
        })
        .sort((a, b) => a.rank - b.rank);
      setPlayers(nextPlayers);

      startTransition(async () => {
        const result = await swapRanks(picked.playerId, picked.rank, other.playerId, other.rank, format);
        if (result.error) setPlayers(previousPlayers);
      });
    }

    setTimeout(() => {
      setPickedId(null);
      setDealSeed((s) => s + 1);
    }, 220);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6">
        <div className="flex w-full items-center justify-between">
          <Link
            href="/rankings"
            className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Back to rankings
          </Link>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {comparisons} comparison{comparisons === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Which do you like better?
          </h1>
          <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Pick a player and your rankings update automatically whenever
            your pick disagrees with their current order. Top {POOL_SIZE}{" "}
            overall only, no kickers or defenses.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {formats.map((f) => (
            <Link
              key={f}
              href={`/rankings/compare?format=${f}`}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                format === f
                  ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {formatLabels[f]}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {SCOPES.map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                scope === s
                  ? "border-transparent bg-foreground text-background"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>

        {currentPair ? (
          <div className="grid w-full grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <PlayerCard
              player={currentPair[0]}
              picked={pickedId === currentPair[0].playerId}
              dimmed={pickedId != null && pickedId !== currentPair[0].playerId}
              onPick={() => handlePick(currentPair![0], currentPair![1])}
            />
            <div className="flex items-center justify-center text-sm font-semibold text-zinc-400 dark:text-zinc-600">
              VS
            </div>
            <PlayerCard
              player={currentPair[1]}
              picked={pickedId === currentPair[1].playerId}
              dimmed={pickedId != null && pickedId !== currentPair[1].playerId}
              onPick={() => handlePick(currentPair![1], currentPair![0])}
            />
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-black/[.08] bg-white p-10 text-center dark:border-white/[.145] dark:bg-zinc-950">
            <p className="font-medium text-black dark:text-zinc-50">
              Not enough {scope === "OVERALL" ? "players" : SCOPE_LABELS[scope]} in your top{" "}
              {POOL_SIZE} to compare.
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Try a different position or Overall.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  picked,
  dimmed,
  onPick,
}: {
  player: DisplayPlayer;
  picked: boolean;
  dimmed: boolean;
  onPick: () => void;
}) {
  const color = POSITION_COLORS[player.position as keyof typeof POSITION_COLORS] ?? FALLBACK_POSITION_COLOR;
  const injuryBadge = getInjuryBadge(player.injuryStatus);

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={picked || dimmed}
      className={`group flex flex-col items-center gap-3 rounded-2xl border-2 bg-white p-8 text-center shadow-sm transition-all duration-200 dark:bg-zinc-950 ${
        picked
          ? "scale-[1.02] border-emerald-500 shadow-lg"
          : dimmed
            ? "scale-[0.98] border-black/[.08] opacity-40 dark:border-white/[.145]"
            : "border-black/[.08] hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md dark:border-white/[.145] dark:hover:border-white/30"
      }`}
    >
      <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${color.bg} ${color.text}`}>
        {player.position}
      </span>
      <span className="text-xl font-semibold text-black dark:text-zinc-50">{player.fullName}</span>
      <span className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        {player.team ?? "FA"}
        {player.byeWeek != null && <span>· Bye {player.byeWeek}</span>}
        {player.consensusRank != null && <span>· ADP {player.consensusRank.toFixed(1)}</span>}
      </span>
      {injuryBadge && (
        <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${injuryBadge.className}`}>
          {injuryBadge.label}
        </span>
      )}
    </button>
  );
}
