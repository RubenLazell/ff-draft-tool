// Trade finder: "I want a RB, who should I go after and what should I
// offer?" Searches every 1-for-1 and 2-for-1 (you give two, get one) deal
// between the user's team and every other team for a player at the
// requested position, and keeps the ones that work for both sides:
//
// - The user's team must get better by the USER'S OWN rankings. That's
//   the whole point of this app: you trust your board.
// - The partner's team must not get meaningfully worse by MARKET value
//   (consensus ADP). The other manager isn't using your rankings, so the
//   realistic test of "would they accept" is whether it looks fair to
//   someone going by the market.
//
// Deals that win on both are where your rankings disagree with the market
// in your favor, which is exactly where a trade is both good for you and
// gettable.
//
// Uses the same VORP team scoring as the power rankings and trade
// calculator (leagueScoring.ts), just with the per-league setup (position
// ranks, replacement levels) computed once instead of per evaluation, since
// a single search scores tens of thousands of hypothetical rosters.

import type { RankedPlayer } from "@/lib/rankings";
import {
  withPositionRanks,
  computeReplacementRanks,
  computePlayerVorp,
  buildOptimalLineup,
  computePositionBreakdown,
  rankByConsensus,
  TRADE_GRADE_THRESHOLDS,
  type PositionRanked,
} from "@/lib/leagueScoring";

export const TRADE_FINDER_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type TradeFinderPosition = (typeof TRADE_FINDER_POSITIONS)[number];

// How much market value the partner is allowed to lose and still be
// assumed to accept. Exclusive, so every suggestion lands in the band the
// trade calculator labels "Fair Trade" or better.
const PARTNER_MAX_MARKET_LOSS = TRADE_GRADE_THRESHOLDS.slight;
// Only the user's most market-valuable players are tried as trade bait.
// Anyone below this is roster filler the partner wouldn't value anyway,
// and capping it keeps 2-for-1 combinations to a few dozen per target.
const MAX_BAIT_PLAYERS = 14;
const MAX_OFFERS_PER_PLAYER = 2;
// Gains smaller than this are within the noise of rank-based scoring and
// not worth the hassle of a trade.
const MIN_MY_GAIN = 1;

type League = { rosterPositions: string[]; totalRosters: number };
export type TradeFinderTeam = { rosterId: number; teamName: string; playerIds: string[] };

export type TradeSuggestion = {
  partnerRosterId: number;
  partnerTeamName: string;
  give: PositionRanked[];
  get: PositionRanked[];
  // Change in the user's team score, by the user's own rankings.
  myGain: number;
  // Change in the partner's team score, by market ADP.
  partnerMarketGain: number;
};

type Lens = {
  byId: Map<string, PositionRanked>;
  value: (id: string) => number;
  score: (ids: string[], maxSize: number) => number;
};

function makeLens(league: League, rankings: RankedPlayer[]): Lens {
  const ranked = withPositionRanks(rankings);
  const byId = new Map(ranked.map((p) => [p.playerId, p]));
  const replacement = computeReplacementRanks(league.rosterPositions, league.totalRosters);

  const valueCache = new Map<string, number>();
  function value(id: string): number {
    let v = valueCache.get(id);
    if (v === undefined) {
      const p = byId.get(id);
      v = p ? computePlayerVorp(p.positionRank, p.position, replacement) : 0;
      valueCache.set(id, v);
    }
    return v;
  }

  // A team receiving more players than it sends would have to cut
  // someone. Without this, a 2-for-1 always "adds" a bench player's value
  // for free, so the roster is trimmed back to its original size by
  // dropping its least valuable players first.
  function score(ids: string[], maxSize: number): number {
    let players = ids.map((id) => byId.get(id)).filter((p): p is PositionRanked => p != null);
    if (players.length > maxSize) {
      players = [...players].sort((a, b) => value(b.playerId) - value(a.playerId)).slice(0, maxSize);
    }
    const lineup = buildOptimalLineup(league.rosterPositions, players);
    const breakdown = computePositionBreakdown(lineup, replacement);
    return Object.values(breakdown).reduce((a, b) => a + b, 0);
  }

  return { byId, value, score };
}

function combinations<T>(items: T[], maxSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    out.push([items[i]]);
    if (maxSize < 2) continue;
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

export function suggestTrades({
  league,
  rankings,
  teams,
  myRosterId,
  position,
  maxGive = 2,
  limit = 12,
}: {
  league: League;
  rankings: RankedPlayer[];
  teams: TradeFinderTeam[];
  myRosterId: number;
  position: TradeFinderPosition;
  maxGive?: 1 | 2;
  limit?: number;
}): TradeSuggestion[] {
  const mine = makeLens(league, rankings);
  const market = makeLens(league, rankByConsensus(rankings));

  const myTeam = teams.find((t) => t.rosterId === myRosterId);
  if (!myTeam) return [];
  const myIds = myTeam.playerIds;
  const mySize = myIds.length;
  const myBefore = mine.score(myIds, mySize);

  const bait = myIds
    .filter((id) => market.value(id) > 0)
    .sort((a, b) => market.value(b) - market.value(a))
    .slice(0, MAX_BAIT_PLAYERS);
  const packages = combinations(bait, maxGive);

  const candidates: TradeSuggestion[] = [];

  for (const partner of teams) {
    if (partner.rosterId === myRosterId) continue;
    const partnerIds = partner.playerIds;
    const partnerSize = partnerIds.length;
    const partnerBefore = market.score(partnerIds, partnerSize);

    const targets = partnerIds.filter((id) => {
      const p = mine.byId.get(id);
      return p?.position === position && mine.value(id) > 0;
    });

    for (const target of targets) {
      for (const give of packages) {
        const giveSet = new Set(give);
        const myAfter = mine.score([...myIds.filter((id) => !giveSet.has(id)), target], mySize);
        const myGain = myAfter - myBefore;
        if (myGain < MIN_MY_GAIN) continue;

        const partnerAfter = market.score([...partnerIds.filter((id) => id !== target), ...give], partnerSize);
        const partnerMarketGain = partnerAfter - partnerBefore;
        if (partnerMarketGain <= -PARTNER_MAX_MARKET_LOSS) continue;

        candidates.push({
          partnerRosterId: partner.rosterId,
          partnerTeamName: partner.teamName,
          give: give.map((id) => mine.byId.get(id) as PositionRanked),
          get: [mine.byId.get(target) as PositionRanked],
          myGain,
          partnerMarketGain,
        });
      }
    }
  }

  // Greedy pick, best first: one deal per target player (so one star
  // doesn't fill the list with twenty variations of the same deal), and
  // each of the user's players offered in at most MAX_OFFERS_PER_PLAYER
  // deals (so one player the market loves more than you do doesn't become
  // the answer to everything; the next-best package for that target gets
  // a turn instead).
  candidates.sort((a, b) => dealScore(b) - dealScore(a) || a.give.length - b.give.length);
  const usedTargets = new Set<string>();
  const offerCounts = new Map<string, number>();
  const picked: TradeSuggestion[] = [];
  for (const c of candidates) {
    if (picked.length >= limit) break;
    const target = c.get[0].playerId;
    if (usedTargets.has(target)) continue;
    if (c.give.some((p) => (offerCounts.get(p.playerId) ?? 0) >= MAX_OFFERS_PER_PLAYER)) continue;
    usedTargets.add(target);
    for (const p of c.give) offerCounts.set(p.playerId, (offerCounts.get(p.playerId) ?? 0) + 1);
    picked.push(c);
  }
  return picked;
}

// Mostly the user's gain, but a deal the partner also likes ranks above a
// slightly bigger lowball, since it's far more likely to actually happen.
function dealScore(s: TradeSuggestion): number {
  return s.myGain + 0.5 * s.partnerMarketGain;
}
