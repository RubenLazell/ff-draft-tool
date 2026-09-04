// Ranks a fantasy league's teams by strength, judged against the signed-in
// user's own rankings rather than a generic consensus. The core idea is
// Value Over Replacement Player (VORP): a starter is worth the distance
// between their rank and the rank of a freely-available replacement at
// their position for a league this size — not their raw rank, since a gap
// near the top of a position means far more than the same-sized gap near
// the bottom.
//
// This is rank-distance-from-replacement, not points-based VORP — this app
// only has ordinal rank data (no per-player point projections), so "value"
// here is a documented, deliberately simple stand-in, not a claim of
// statistical rigor.
//
// Every function below is pure and platform-agnostic: it only knows about
// RankedPlayer, roster_positions-shaped string arrays, and plain roster
// objects — nothing about Sleeper specifically. A future ESPN import only
// needs to produce the same plain shapes to reuse all of this unchanged.

import type { RankedPlayer } from "@/lib/rankings";

export type PositionRanked = RankedPlayer & { positionRank: number };

// Bench players' VORP counts at this fraction toward a team's score — deep
// benches provide real trade/injury insurance but shouldn't be weighed
// equally against a team's actual starting lineup. Tunable.
export const BENCH_WEIGHT = 0.25;

// How one FLEX-type slot's replacement-level demand is split across the
// positions eligible to fill it, purely for sizing replacement rank — not
// used when actually filling a lineup (see buildOptimalLineup, which always
// gives a flex slot to whichever eligible position is best available).
// Weights per slot type must sum to 1. Tunable.
export const FLEX_ALLOCATION: Record<string, Partial<Record<string, number>>> = {
  FLEX: { RB: 0.4, WR: 0.4, TE: 0.2 },
  SUPER_FLEX: { QB: 0.5, RB: 0.2, WR: 0.2, TE: 0.1 },
};

// IDP slots this app has zero ranking data for (no defensive-player ranks
// anywhere in `players`/`consensus_rankings`) — always shown as unfilled,
// never scored, regardless of who's actually rostered in them.
export const UNRANKED_SLOT_TYPES = new Set(["DL", "LB", "DB", "IDP_FLEX"]);

// Slots that aren't "start a player" slots at all.
export const NON_STARTING_SLOT_TYPES = new Set(["BN", "IR", "TAXI"]);

const SINGLE_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

// Extracted from the identical inline pattern in RankingsBoard.tsx and
// CompareView.tsx (a positionCounters accumulator over a rank-sorted list)
// so a third feature doesn't re-derive it a third time.
export function withPositionRanks(rankings: RankedPlayer[]): PositionRanked[] {
  const positionCounters: Record<string, number> = {};
  return rankings.map((p) => {
    positionCounters[p.position] = (positionCounters[p.position] ?? 0) + 1;
    return { ...p, positionRank: positionCounters[p.position] };
  });
}

// League-wide replacement rank per position — the position-rank at which a
// freely available (non-rostered-as-a-starter-anywhere) player exists, for
// a league of this size and roster shape.
export function computeReplacementRanks(
  rosterPositions: string[],
  totalRosters: number
): Record<string, number> {
  const perTeamDemand: Record<string, number> = {};
  for (const pos of SINGLE_POSITIONS) perTeamDemand[pos] = 0;

  for (const slot of rosterPositions) {
    if (slot in perTeamDemand) {
      perTeamDemand[slot] += 1;
      continue;
    }
    const allocation = FLEX_ALLOCATION[slot];
    if (!allocation) continue; // BN/IR/TAXI/IDP slots don't add starter demand
    for (const [pos, share] of Object.entries(allocation)) {
      perTeamDemand[pos] = (perTeamDemand[pos] ?? 0) + (share ?? 0);
    }
  }

  const replacementRanks: Record<string, number> = {};
  for (const [pos, demand] of Object.entries(perTeamDemand)) {
    replacementRanks[pos] = Math.ceil(demand * totalRosters) + 1;
  }
  return replacementRanks;
}

export function computePlayerVorp(
  positionRank: number,
  position: string,
  replacementRanks: Record<string, number>
): number {
  const replacement = replacementRanks[position];
  if (replacement == null) return 0; // no replacement level computed for this position (e.g. IDP)
  return Math.max(0, replacement - positionRank);
}

// Matches a Sleeper roster's player IDs directly against the user's own
// rankings — safe because players.id is literally Sleeper's own player_id
// (both sourced from Sleeper's player API). No name matching needed for
// this platform. Anything not found (not synced, practice squad, etc.) is
// surfaced, never silently dropped.
export function resolveRosterPlayers(
  playerIds: string[],
  rankingsById: Map<string, PositionRanked>
): { resolved: PositionRanked[]; unresolvedPlayerIds: string[] } {
  const resolved: PositionRanked[] = [];
  const unresolvedPlayerIds: string[] = [];
  for (const id of playerIds) {
    const player = rankingsById.get(id);
    if (player) resolved.push(player);
    else unresolvedPlayerIds.push(id);
  }
  return { resolved, unresolvedPlayerIds };
}

export type LineupSlot = { slotType: string; player: PositionRanked | null };
export type LineupResult = {
  starters: LineupSlot[];
  bench: PositionRanked[];
};

// Greedy, constrained-slots-first lineup optimizer — not a full bipartite
// assignment solve, which would be overkill for ordinal (rank-based, not
// points-based) data. Fills single-position slots first (least flexible),
// then FLEX, then SUPER_FLEX (most flexible, filled last so it doesn't
// claim a player a more constrained slot needed). This can rarely be
// suboptimal versus a true assignment (e.g. a marginal RB taking FLEX
// forces a better WR to bench when swapping would raise total value) —
// an accepted tradeoff given the approximate nature of rank-based VORP.
export function buildOptimalLineup(
  rosterPositions: string[],
  rosterPlayers: PositionRanked[]
): LineupResult {
  const pool = [...rosterPlayers].sort((a, b) => a.rank - b.rank);
  const used = new Set<string>();

  function takeBest(eligible: (p: PositionRanked) => boolean): PositionRanked | null {
    const player = pool.find((p) => !used.has(p.playerId) && eligible(p));
    if (player) used.add(player.playerId);
    return player ?? null;
  }

  // slotType -> filled player, keyed by original array index so the
  // display order can be restored after filling constrained slots first.
  const filled = new Map<number, PositionRanked | null>();

  rosterPositions.forEach((slot, index) => {
    if (SINGLE_POSITIONS.includes(slot)) {
      filled.set(index, takeBest((p) => p.position === slot));
    }
  });

  const flexEligible: Record<string, string[]> = {
    FLEX: ["RB", "WR", "TE"],
    SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  };
  // FLEX before SUPER_FLEX — the more constrained of the two flex types
  // (can't take a QB) gets first pick of what's left.
  for (const flexSlot of ["FLEX", "SUPER_FLEX"]) {
    rosterPositions.forEach((slot, index) => {
      if (slot !== flexSlot) return;
      const eligible = flexEligible[flexSlot];
      filled.set(index, takeBest((p) => eligible.includes(p.position)));
    });
  }

  rosterPositions.forEach((slot, index) => {
    if (UNRANKED_SLOT_TYPES.has(slot)) filled.set(index, null); // never scored, always shown empty
  });

  const starters: LineupSlot[] = rosterPositions
    .map((slot, index) => ({ slotType: slot, player: filled.get(index) ?? null }))
    .filter((_, index) => !NON_STARTING_SLOT_TYPES.has(rosterPositions[index]));

  const bench = pool.filter((p) => !used.has(p.playerId));

  return { starters, bench };
}

export function scoreTeam(lineup: LineupResult, replacementRanks: Record<string, number>): number {
  const starterValue = lineup.starters.reduce((sum, slot) => {
    if (!slot.player) return sum;
    return sum + computePlayerVorp(slot.player.positionRank, slot.player.position, replacementRanks);
  }, 0);
  const benchValue = lineup.bench.reduce(
    (sum, p) => sum + computePlayerVorp(p.positionRank, p.position, replacementRanks),
    0
  );
  return starterValue + BENCH_WEIGHT * benchValue;
}

export type TeamResult = {
  rosterId: number;
  ownerId: string | null;
  teamName: string;
  score: number;
  lineup: LineupResult;
  unresolvedPlayerIds: string[];
};

// The one function a page needs to call per league — takes already-fetched
// league/roster data and the user's own rankings, returns every team
// scored and sorted best-to-worst.
export function scoreLeagueTeams(
  league: { rosterPositions: string[]; totalRosters: number },
  rosters: { rosterId: number; ownerId: string | null; teamName: string; playerIds: string[] }[],
  userRankings: RankedPlayer[]
): TeamResult[] {
  const ranked = withPositionRanks(userRankings);
  const rankingsById = new Map(ranked.map((p) => [p.playerId, p]));
  const replacementRanks = computeReplacementRanks(league.rosterPositions, league.totalRosters);

  const results = rosters.map((roster) => {
    const { resolved, unresolvedPlayerIds } = resolveRosterPlayers(roster.playerIds, rankingsById);
    const lineup = buildOptimalLineup(league.rosterPositions, resolved);
    const score = scoreTeam(lineup, replacementRanks);
    return {
      rosterId: roster.rosterId,
      ownerId: roster.ownerId,
      teamName: roster.teamName,
      score,
      lineup,
      unresolvedPlayerIds,
    };
  });

  return results.sort((a, b) => b.score - a.score);
}
