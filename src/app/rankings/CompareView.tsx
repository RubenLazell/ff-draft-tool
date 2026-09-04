"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { RankedPlayer, Format } from "@/lib/rankings";
import { getInjuryBadge, POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";
import { loadGuestOrder, saveGuestOrder, applyGuestOrder } from "@/lib/guestRankings";
import { GuestBanner } from "./GuestBanner";
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

// A well-mixed 32-bit integer hash (lowbias32, Chris Wellons' "hash
// prospector") — a 1-bit change in the input flips roughly half the output
// bits, so `hashSeed(n) % L` scatters well for any L, unlike a plain
// `n * constant` step which can degenerate to a small, near-sequential
// stride for many values of L.
function hashSeed(n: number): number {
  let x = n;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

// Comparisons aren't limited to strict neighbors (gap 1) — the partner can
// be up to 5 spots away in either direction, with the gap size drawn from
// a Binomial(4, p) distribution mapped onto gap = k+1 for k = 0..4. A small
// p keeps almost all the weight on gap 1-2 (close, high-value comparisons)
// while still occasionally reaching out to gap 5 (a coarser sanity check
// on the broader ordering) — the classic binomial shape, just skewed small
// instead of centered, since p is well under 0.5.
const MAX_GAP = 5;
// A binomial's mode sits near n*p, not at 0 — with n=4, anything at or
// above p=0.2 actually peaks at gap 2 (or higher), not gap 1. 0.15 keeps
// gap 1 clearly the most likely (~52%) while gap 2/3 still show up
// regularly and gap 4/5 stay rare: 52% / 37% / 10% / 1% / 0.1%.
const GAP_BINOMIAL_P = 0.15;

function binomialCoefficient(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

// Precomputed once at module load — a fixed CDF over gap sizes 1..MAX_GAP,
// e.g. GAP_CDF[0] is P(gap <= 1), GAP_CDF[1] is P(gap <= 2), etc.
const GAP_CDF: number[] = (() => {
  const n = MAX_GAP - 1;
  let cumulative = 0;
  return Array.from({ length: MAX_GAP }, (_, k) => {
    cumulative += binomialCoefficient(n, k) * GAP_BINOMIAL_P ** k * (1 - GAP_BINOMIAL_P) ** (n - k);
    return cumulative;
  });
})();

// Inverse-transform sampling: turns a uniform value in [0, 1) into a gap
// size 1..MAX_GAP distributed per GAP_CDF above.
function pickGap(u: number): number {
  for (let k = 0; k < GAP_CDF.length; k++) {
    if (u < GAP_CDF[k]) return k + 1;
  }
  return MAX_GAP;
}

export function CompareView({
  initialRankings,
  format,
  formats,
  formatLabels,
  guestMode = false,
}: {
  initialRankings: RankedPlayer[];
  format: Format;
  formats: readonly Format[];
  formatLabels: Record<Format, string>;
  guestMode?: boolean;
}) {
  // Guest mode's saved order lives in localStorage, invisible to the server
  // render that produced `initialRankings` (the consensus default) — read
  // here in the lazy initializer so the client's first render already has
  // it, rather than seeding with the default and correcting in an effect.
  const [players, setPlayers] = useState(() => {
    if (!guestMode) return initialRankings;
    const order = loadGuestOrder(format);
    return order ? applyGuestOrder(initialRankings, order) : initialRankings;
  });
  const [scope, setScope] = useState<Scope>("OVERALL");
  const [dealSeed, setDealSeed] = useState(0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"unchanged" | "updated" | null>(null);
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

  // The list this tool deals pairs from — filtering the pool down to one
  // position preserves a clean 1..K prefix for that position (position
  // rank only increases with overall rank), so index arithmetic within
  // this array (below) lands on genuine neighbors-by-position too, not
  // just coincidentally-nearby entries.
  const scoped = useMemo(
    () => (scope === "OVERALL" ? pool : pool.filter((p) => p.position === scope)),
    [pool, scope]
  );

  // currentPair is fully derived, not stored-and-set-in-an-effect: `dealSeed`
  // exists purely to force a re-deal after a decision that didn't change
  // `players` (the user picked the already-higher-ranked player, so there
  // was nothing to swap). A swap naturally produces a new `scoped` reference
  // too, but bumping dealSeed either way keeps "deal a new pair after every
  // decision" simple and consistent instead of relying on that side effect.
  // Deliberately not Math.random() — this needs to run inside a pure
  // useMemo, so everything below is hashSeed()'d instead: same
  // (scoped, dealSeed) always yields the same pick, but the hash's full
  // bit-avalanche means consecutive seeds land on genuinely scattered
  // results (a plain `dealSeed * constant` step, tried first, degenerates
  // for many list lengths — e.g. mod 20 it walked by 1 each time, which
  // just felt sequential, not random).
  const currentPair = useMemo(() => {
    const n = scoped.length;
    if (n < 2) return null;
    // +1 avoids hashSeed(0) === 0, which would otherwise make the very
    // first pair shown always the same deterministic starting point.
    const seed = dealSeed + 1;

    const anchorIndex = hashSeed(seed) % n;
    // Binomial-weighted gap (see pickGap above), read off a uniform value
    // derived from a differently-mixed hash of the same seed so it isn't
    // correlated with the anchor's own index. Clamped to what's actually
    // reachable from this specific anchor in at least one direction — not
    // just `n - 1` — since e.g. the middle of a 3-player list can't reach
    // 2 spots in either direction even though the list itself supports a
    // gap of 2 from its ends.
    const u = hashSeed(seed ^ 0x27d4eb2f) / 0x100000000;
    const maxFeasibleGap = Math.max(anchorIndex, n - 1 - anchorIndex);
    const gap = Math.min(pickGap(u), maxFeasibleGap);
    const goForward = hashSeed(seed ^ 0x9e3779b9) % 2 === 0;

    let partnerIndex = anchorIndex + (goForward ? gap : -gap);
    if (partnerIndex < 0 || partnerIndex >= n) {
      // That direction doesn't fit from this anchor — the other direction
      // is guaranteed to, since gap was clamped to whichever side has more
      // room.
      partnerIndex = anchorIndex + (goForward ? -gap : gap);
    }

    const a = scoped[anchorIndex];
    const b = scoped[partnerIndex];
    const ordered: [DisplayPlayer, DisplayPlayer] = a.rank < b.rank ? [a, b] : [b, a];

    // Without this, the better-ranked player (always `ordered[0]`) would
    // land on the left every single time. A third, differently-mixed hash
    // of the same seed decides the side — a fresh coin flip per dealt
    // pair, still pure.
    const flipSides = hashSeed(seed ^ 0x5bd1e995) % 2 === 1;
    return flipSides ? [ordered[1], ordered[0]] : ordered;
  }, [scoped, dealSeed]);

  function handlePick(picked: DisplayPlayer, other: DisplayPlayer) {
    setPickedId(picked.playerId);
    setComparisons((c) => c + 1);

    // A larger rank number means "currently ranked lower" (worse) — if the
    // player the user preferred is the one currently ranked lower, that
    // contradicts the existing order, so swap them. If they picked the one
    // already ranked higher, the board already agrees — nothing to change.
    if (picked.rank > other.rank) {
      setFeedback("updated");
      const previousPlayers = players;
      const nextPlayers = players
        .map((p) => {
          if (p.playerId === picked.playerId) return { ...p, rank: other.rank };
          if (p.playerId === other.playerId) return { ...p, rank: picked.rank };
          return p;
        })
        .sort((a, b) => a.rank - b.rank);
      setPlayers(nextPlayers);

      if (guestMode) {
        saveGuestOrder(format, nextPlayers);
      } else {
        startTransition(async () => {
          const result = await swapRanks(picked.playerId, picked.rank, other.playerId, other.rank, format);
          if (result.error) setPlayers(previousPlayers);
        });
      }
    } else {
      setFeedback("unchanged");
    }

    setTimeout(() => {
      setPickedId(null);
      setFeedback(null);
      setDealSeed((s) => s + 1);
    }, 900);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6">
        {guestMode && (
          <div className="w-full">
            <GuestBanner />
          </div>
        )}
        <div className="flex w-full items-center justify-between">
          <Link
            href={guestMode ? "/rankings/guest" : "/rankings"}
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
              href={`${guestMode ? "/rankings/compare/guest" : "/rankings/compare"}?format=${f}`}
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
          <>
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

            {/* Reserved height + opacity transition rather than
                mounting/unmounting, so this appearing after a pick doesn't
                shift the cards above it — and it's only ever non-empty in
                that post-pick window, never before. */}
            <div
              className="flex h-6 items-center justify-center text-sm font-medium transition-opacity duration-150"
              style={{ opacity: feedback ? 1 : 0 }}
            >
              {feedback === "updated" ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓ Updated your rankings
                </span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">
                  Already matches your rankings
                </span>
              )}
            </div>
          </>
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
