// Turns a resolved matchup (real starters + Sleeper's public projections/
// live-stats feeds) into a FantasyCast-style view: current points, a
// projected final, and a win probability — for the By League tab only (see
// MatchupCard.tsx). Deliberately simple and documented as such, same spirit
// as leagueScoring.ts's VORP model: this is a stand-in, not a claim of
// statistical rigor.
//
// Pure functions only — no fetching here, so this is easy to exercise
// directly against real fetched data (see the verification steps in the
// plan this was built from).

import type { MatchupRosterEntry, PointsFormat } from "@/lib/leagueImport";
import type { RankedPlayer } from "@/lib/rankings";
import type { SleeperPlayerLine } from "@/lib/sleeper";
import { gameByTeam, type NflGame } from "@/lib/nflSchedule";
import { normalizeTeamCode } from "@/lib/normalizeName";
import { ESPN_UNMATCHED_PREFIX } from "@/lib/espnMatching";

export type LivePlayerLine = {
  playerId: string;
  fullName: string;
  position: string;
  team: string | null;
  points: number;
  hasStarted: boolean;
  isFinal: boolean;
  gameDetail: string; // "Final", "Q3 8:41", a kickoff-time string, or "Bye"
  breakdown: string[]; // e.g. ["6 rec", "74 rec yd", "1 TD"] — only once hasStarted
};

export type LiveTeamScore = {
  teamName: string;
  starters: LivePlayerLine[];
  bench: LivePlayerLine[];
  currentTotal: number;
  projectedTotal: number;
};

export type LiveMatchup = {
  mine: LiveTeamScore;
  theirs: LiveTeamScore;
  myWinProbability: number; // 0..1
};

function pointsForFormat(line: SleeperPlayerLine, format: PointsFormat): number {
  if (format === "PPR") return line.pts.ppr;
  if (format === "HALF_PPR") return line.pts.halfPpr;
  return line.pts.std;
}

const BREAKDOWN_LABELS: [key: string, label: (n: number) => string][] = [
  ["pass_yd", (n) => `${Math.round(n)} pass yd`],
  ["pass_td", (n) => `${Math.round(n)} pass TD`],
  ["pass_int", (n) => `${Math.round(n)} INT`],
  ["rush_yd", (n) => `${Math.round(n)} rush yd`],
  ["rush_td", (n) => `${Math.round(n)} rush TD`],
  ["rec", (n) => `${Math.round(n)} rec`],
  ["rec_yd", (n) => `${Math.round(n)} rec yd`],
  ["rec_td", (n) => `${Math.round(n)} rec TD`],
  ["fum_lost", (n) => `${Math.round(n)} fum lost`],
];

function buildBreakdown(raw: Record<string, number>): string[] {
  return BREAKDOWN_LABELS.filter(([key]) => raw[key]).map(([key, label]) => label(raw[key]));
}

// Point estimate + variance for one player's contribution to a team's
// final score, used only for the win-probability calc — not shown to the
// user directly. Deliberately simple: no play-by-play or clock parsing.
const STDEV_FRACTION_PREGAME = 0.5;
const STDEV_FRACTION_LIVE = 0.35;
const REMAINING_FRACTION_LIVE = 0.5; // flat "half the projection left" stand-in while a game is in progress

function estimate(
  state: "pre" | "in" | "post" | "none",
  actual: number,
  projected: number
): { mean: number; stdev: number } {
  if (state === "post") return { mean: actual, stdev: 0 };
  if (state === "in") return { mean: actual + REMAINING_FRACTION_LIVE * projected, stdev: STDEV_FRACTION_LIVE * projected };
  if (state === "pre") return { mean: projected, stdev: STDEV_FRACTION_PREGAME * projected };
  return { mean: 0, stdev: 0 }; // bye / no game found this week
}

function buildPlayerLine(
  playerId: string,
  format: PointsFormat,
  rankingsById: ReadonlyMap<string, RankedPlayer>,
  gamesByTeam: Map<string, NflGame>,
  projections: Map<string, SleeperPlayerLine>,
  stats: Map<string, SleeperPlayerLine>
): { line: LivePlayerLine; mean: number; stdev: number } {
  const info = rankingsById.get(playerId);
  // An ESPN player this app couldn't name-match against `players` (see
  // espnMatching.ts) — no projections/live stats possible without a
  // players.id, but still show the real name instead of the sentinel id.
  const fullName = info?.fullName ?? playerId.replace(ESPN_UNMATCHED_PREFIX, "");
  const position = info?.position ?? "?";
  const team = normalizeTeamCode(info?.team ?? null);
  const game = team ? gamesByTeam.get(team) : undefined;

  const projLine = projections.get(playerId);
  const statLine = stats.get(playerId);
  const projected = projLine ? pointsForFormat(projLine, format) : 0;
  const actual = statLine ? pointsForFormat(statLine, format) : 0;

  const state: "pre" | "in" | "post" | "none" = game ? game.status.state : "none";
  const { mean, stdev } = estimate(state, actual, projected);

  const hasStarted = state === "in" || state === "post";
  const gameDetail = !game
    ? "Bye"
    : state === "post"
      ? "Final"
      : state === "in"
        ? game.status.detail
        : new Date(game.kickoff).toLocaleString("en-US", {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          });

  return {
    line: {
      playerId,
      fullName,
      position,
      team,
      points: hasStarted ? actual : projected,
      hasStarted,
      isFinal: state === "post",
      gameDetail,
      breakdown: hasStarted && statLine ? buildBreakdown(statLine.raw) : [],
    },
    mean,
    stdev,
  };
}

function buildTeamScore(
  team: MatchupRosterEntry,
  format: PointsFormat,
  rankingsById: ReadonlyMap<string, RankedPlayer>,
  gamesByTeam: Map<string, NflGame>,
  projections: Map<string, SleeperPlayerLine>,
  stats: Map<string, SleeperPlayerLine>
): { score: LiveTeamScore; mean: number; variance: number } {
  const starterSet = new Set(team.starterPlayerIds);
  let mean = 0;
  let variance = 0;
  let currentTotal = 0;

  // Iterate starterPlayerIds (not playerIds) for the starters list — it's
  // already in the league's real roster-slot order (QB, RB, RB, WR, ...),
  // so both sides of a matchup — sharing the same league, same slot
  // template — line up row-for-row by slot in the UI. playerIds' order is
  // arbitrary (whatever the platform's roster endpoint returns), fine for
  // bench since bench has no slot order to preserve.
  const starters: LivePlayerLine[] = team.starterPlayerIds.map((playerId) => {
    const { line, mean: playerMean, stdev } = buildPlayerLine(
      playerId,
      format,
      rankingsById,
      gamesByTeam,
      projections,
      stats
    );
    mean += playerMean;
    variance += stdev * stdev;
    // "Current" is actual points scored only — a not-yet-started player's
    // row still shows their projection (line.points), but that shouldn't
    // count toward the live team total until their game actually starts.
    currentTotal += line.hasStarted ? line.points : 0;
    return line;
  });

  const bench: LivePlayerLine[] = team.playerIds
    .filter((playerId) => !starterSet.has(playerId))
    .map((playerId) => buildPlayerLine(playerId, format, rankingsById, gamesByTeam, projections, stats).line);

  return {
    score: {
      teamName: team.teamName,
      starters,
      bench,
      currentTotal,
      projectedTotal: mean,
    },
    mean,
    variance,
  };
}

// Standard normal CDF via the Abramowitz-Stegun erf approximation — no
// external stats dependency for one small function.
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function buildLiveMatchup(
  myTeam: MatchupRosterEntry,
  opponent: MatchupRosterEntry,
  format: PointsFormat,
  rankingsById: ReadonlyMap<string, RankedPlayer>,
  projections: Map<string, SleeperPlayerLine>,
  stats: Map<string, SleeperPlayerLine>,
  schedule: NflGame[]
): LiveMatchup {
  const gamesByTeam = gameByTeam(schedule);
  const mine = buildTeamScore(myTeam, format, rankingsById, gamesByTeam, projections, stats);
  const theirs = buildTeamScore(opponent, format, rankingsById, gamesByTeam, projections, stats);

  const totalVariance = mine.variance + theirs.variance;
  const myWinProbability =
    totalVariance === 0
      ? mine.mean === theirs.mean
        ? 0.5
        : mine.mean > theirs.mean
          ? 1
          : 0
      : normalCdf((mine.mean - theirs.mean) / Math.sqrt(totalVariance));

  return { mine: mine.score, theirs: theirs.score, myWinProbability };
}
