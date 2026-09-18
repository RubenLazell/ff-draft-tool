// Turns a league's real scoring configuration — on either platform — into
// one normalized shape, and scores a player's raw stat line against it.
// This replaces the old "just pick Sleeper's own PPR/Half/Standard bucket"
// approximation: every category comes from the league's actual settings,
// not a generic default.
//
// Two kinds of category:
//  - Rate-based (the vast majority): points = raw_count * rate. A flat
//    Record<string, number> keyed by Sleeper's own raw-stat vocabulary
//    (rec, rec_yd, sack, ...) covers these uniformly for both platforms,
//    since Sleeper's raw stats and Sleeper's own scoring_settings already
//    share that exact vocabulary (verified directly against real data —
//    see the plan this was built from) — ESPN's settings just need
//    translating into the same key names first.
//  - Bracket-based (points allowed, yards allowed): which *range* a
//    continuous value falls into, not a per-unit count. Needs a real
//    min/max table per league, not a rate.
//
// ESPN's kicker field-goal-distance buckets are coarser than Sleeper's raw
// per-distance make counts, but nest exactly inside them (ESPN's single
// "50+" bucket IS Sleeper's fgm_50_59 + fgm_60p, not an approximation) —
// handled as a third mechanism, summing source keys into a synthetic rate
// entry, applied before the rate dot-product.

import type { EspnScoringItem } from "@/lib/espn";

export type ScoringBracket = { min: number; max: number; points: number };

export type ScoringRules = {
  rates: Record<string, number>;
  // Computed before `rates` is applied — lets a rate entry reference a key
  // that isn't a real Sleeper stat field, e.g. summing fgm_0_19 + fgm_20_29
  // + fgm_30_39 into one "under 40" count for an ESPN league's coarser bucket.
  derivedSums: { targetKey: string; sourceKeys: string[] }[];
  pointsAllowedBrackets: ScoringBracket[];
  yardsAllowedBrackets: ScoringBracket[];
};

export function scorePlayer(raw: Record<string, number>, rules: ScoringRules): number {
  const augmented: Record<string, number> = { ...raw };
  for (const { targetKey, sourceKeys } of rules.derivedSums) {
    augmented[targetKey] = sourceKeys.reduce((sum, key) => sum + (raw[key] ?? 0), 0);
  }

  let total = 0;
  for (const [key, rate] of Object.entries(rules.rates)) {
    total += (augmented[key] ?? 0) * rate;
  }
  total += bracketPoints(raw.pts_allow, rules.pointsAllowedBrackets);
  total += bracketPoints(raw.yds_allow, rules.yardsAllowedBrackets);
  return total;
}

// Exact-range match, not "first bracket at or under this value" — a
// disabled/missing bracket (a real case: ESPN simply omits a category a
// league unchecked, rather than sending it at 0) must contribute 0, not
// silently fall through to whichever bracket happens to be next.
function bracketPoints(value: number | undefined, brackets: ScoringBracket[]): number {
  if (value == null) return 0;
  const match = brackets.find((b) => value >= b.min && value <= b.max);
  return match ? match.points : 0;
}

// --- Sleeper ---------------------------------------------------------

const SLEEPER_POINTS_ALLOWED_KEYS: [key: string, min: number, max: number][] = [
  ["pts_allow_0", 0, 0],
  ["pts_allow_1_6", 1, 6],
  ["pts_allow_7_13", 7, 13],
  ["pts_allow_14_20", 14, 20],
  ["pts_allow_21_27", 21, 27],
  ["pts_allow_28_34", 28, 34],
  ["pts_allow_35p", 35, Infinity],
];

const SLEEPER_YARDS_ALLOWED_KEYS: [key: string, min: number, max: number][] = [
  ["yds_allow_0_100", 0, 100],
  ["yds_allow_100_199", 101, 199],
  ["yds_allow_200_299", 200, 299],
  ["yds_allow_300_349", 300, 349],
  ["yds_allow_350_399", 350, 399],
  ["yds_allow_400_449", 400, 449],
  ["yds_allow_450_499", 450, 499],
  ["yds_allow_500_549", 500, 549],
  ["yds_allow_550p", 550, Infinity],
];

// Sleeper's scoring_settings already uses the exact same key vocabulary as
// its raw per-player stats — no translation needed, just split the
// points/yards-allowed keys out into brackets and leave everything else as
// a direct rate.
export function rulesFromSleeper(scoringSettings: Record<string, number>): ScoringRules {
  const bracketKeys = new Set([...SLEEPER_POINTS_ALLOWED_KEYS, ...SLEEPER_YARDS_ALLOWED_KEYS].map(([key]) => key));
  const rates: Record<string, number> = {};
  for (const [key, rate] of Object.entries(scoringSettings)) {
    if (!bracketKeys.has(key) && rate) rates[key] = rate;
  }
  return {
    rates,
    derivedSums: [],
    pointsAllowedBrackets: SLEEPER_POINTS_ALLOWED_KEYS.map(([key, min, max]) => ({
      min,
      max,
      points: scoringSettings[key] ?? 0,
    })),
    yardsAllowedBrackets: SLEEPER_YARDS_ALLOWED_KEYS.map(([key, min, max]) => ({
      min,
      max,
      points: scoringSettings[key] ?? 0,
    })),
  };
}

// --- ESPN --------------------------------------------------------------
//
// statId -> category translation, verified live against a real league's
// scoringItems (every value cross-checked against the community-maintained
// ESPN stat-id reference — see espn.ts's own top comment for the source).
// 16 = ESPN's DEF position id (ESPN_POSITION_MAP in espn.ts) — D/ST
// categories store their real rate under pointsOverrides["16"], not the
// base `points` field, which is unused (0) for those items.

const ESPN_RATE_STAT_IDS: [statId: number, sleeperKey: string, isDefCategory: boolean][] = [
  [3, "pass_yd", false],
  [4, "pass_td", false],
  [19, "pass_2pt", false],
  [20, "pass_int", false],
  [24, "rush_yd", false],
  [25, "rush_td", false],
  [26, "rush_2pt", false],
  [53, "rec", false],
  [42, "rec_yd", false],
  [43, "rec_td", false],
  [44, "rec_2pt", false],
  [72, "fum_lost", false],
  [63, "fum_rec_td", false],
  [86, "xpm", false],
  [88, "xpmiss", false],
  [99, "sack", true],
  [95, "int", true],
  [96, "fum_rec", true],
  [106, "ff", true],
  [98, "safe", true],
  [97, "blk_kick", true],
];

// ESPN's kicker buckets are coarser than Sleeper's per-distance make
// counts, but nest exactly inside them — summed, not approximated.
const ESPN_KICKER_BUCKET_STAT_IDS: [statId: number, sourceKeys: string[]][] = [
  [80, ["fgm_0_19", "fgm_20_29", "fgm_30_39"]], // "Under 40"
  [77, ["fgm_40_49"]],
  [74, ["fgm_50_59", "fgm_60p"]], // "50+"
];

const ESPN_POINTS_ALLOWED_STAT_IDS: [statId: number, min: number, max: number][] = [
  [89, 0, 0],
  [90, 1, 6],
  [91, 7, 13],
  [92, 14, 17],
  [121, 18, 21],
  [122, 22, 27],
  [123, 28, 34],
  [124, 35, 45],
  [125, 46, Infinity],
];

const ESPN_YARDS_ALLOWED_STAT_IDS: [statId: number, min: number, max: number][] = [
  [128, 0, 99],
  [129, 100, 199],
  [130, 200, 299],
  [131, 300, 349],
  [132, 350, 399],
  [133, 400, 449],
  [134, 450, 499],
  [135, 500, 549],
  [136, 550, Infinity],
];

export function rulesFromEspn(scoringItems: EspnScoringItem[]): ScoringRules {
  const byId = new Map(scoringItems.map((item) => [item.statId, item]));
  const rates: Record<string, number> = {};
  const derivedSums: { targetKey: string; sourceKeys: string[] }[] = [];

  for (const [statId, sleeperKey, isDefCategory] of ESPN_RATE_STAT_IDS) {
    const item = byId.get(statId);
    if (!item) continue; // absent = this league disabled the category, not a 0 rate
    const rate = isDefCategory ? (item.pointsOverrides["16"] ?? item.points) : item.points;
    if (rate) rates[sleeperKey] = rate;
  }

  for (const [statId, sourceKeys] of ESPN_KICKER_BUCKET_STAT_IDS) {
    const item = byId.get(statId);
    if (!item) continue;
    const targetKey = `espn_fg_bucket_${statId}`;
    derivedSums.push({ targetKey, sourceKeys });
    if (item.points) rates[targetKey] = item.points;
  }

  function buildBrackets(ids: [number, number, number][]): ScoringBracket[] {
    const brackets: ScoringBracket[] = [];
    for (const [statId, min, max] of ids) {
      const item = byId.get(statId);
      if (!item) continue; // disabled bracket — verified live, ESPN omits it entirely rather than sending 0
      brackets.push({ min, max, points: item.pointsOverrides["16"] ?? item.points });
    }
    return brackets;
  }

  return {
    rates,
    derivedSums,
    pointsAllowedBrackets: buildBrackets(ESPN_POINTS_ALLOWED_STAT_IDS),
    yardsAllowedBrackets: buildBrackets(ESPN_YARDS_ALLOWED_STAT_IDS),
  };
}
