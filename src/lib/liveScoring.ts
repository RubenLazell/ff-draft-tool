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

import type { MatchupRosterEntry } from "@/lib/leagueImport";
import type { RankedPlayer } from "@/lib/rankings";
import type { SleeperStatLine } from "@/lib/sleeper";
import { scorePlayer, type ScoringRules } from "@/lib/scoringRules";
import { gameByTeam, type NflGame } from "@/lib/nflSchedule";
import { normalizeTeamCode } from "@/lib/normalizeName";
import { ESPN_UNMATCHED_PREFIX } from "@/lib/espnMatching";

export type LivePlayerLine = {
  playerId: string;
  fullName: string;
  position: string;
  team: string | null;
  points: number;
  projectedFinal: number; // the model's current best guess at this player's END-of-game total — the pregame projection before kickoff, actual+estimated-remaining mid-game, or just the final once it's over
  hasStarted: boolean;
  isFinal: boolean;
  gameDetail: string; // "Final", "Q3 8:41", a kickoff-time string, or "Bye"
  breakdown: string[]; // e.g. ["6 rec", "74 rec yd", "1 TD"] — only once hasStarted
  raw: Record<string, number>; // same categories as breakdown, unformatted — lets callers (the score graph) diff two points in time to describe what actually changed, not just the point total
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
  ["sack", (n) => `${Math.round(n)} sack`],
  ["int", (n) => `${Math.round(n)} INT`],
  ["fum_rec", (n) => `${Math.round(n)} fum rec`],
  ["ff", (n) => `${Math.round(n)} forced fum`],
  ["safe", (n) => `${Math.round(n)} safety`],
  ["blk_kick", (n) => `${Math.round(n)} blocked kick`],
  ["pts_allow", (n) => `${Math.round(n)} pts allowed`],
  ["yds_allow", (n) => `${Math.round(n)} yds allowed`],
  ["def_td", (n) => `${Math.round(n)} def/ST TD`],
];

function buildBreakdown(raw: Record<string, number>): string[] {
  return BREAKDOWN_LABELS.filter(([key]) => raw[key]).map(([key, label]) => label(raw[key]));
}

// Point estimate + variance for one player's contribution to a team's
// final score — also what's shown to the user as "proj final" once a
// player's game is live (see LivePlayerLine.projectedFinal).
const STDEV_FRACTION_PREGAME = 0.5;
const STDEV_FRACTION_LIVE = 0.35;

const QUARTER_SECONDS = 15 * 60;
const REGULATION_SECONDS = 4 * QUARTER_SECONDS;

function parseClockSeconds(clock: string): number {
  const [min, sec] = clock.split(":").map(Number);
  if (Number.isNaN(min) || Number.isNaN(sec)) return 0;
  return min * 60 + sec;
}

// Fraction of the game clock still remaining, from the real period/clock
// ESPN reports — used to scale how much of a live player's pregame
// projection should still be "left to earn." Early in Q1 this is close
// to 1 (nearly the full projection still ahead), late in the 4th it's
// close to 0. Deliberately simple: assumes roughly linear pace across the
// game (no garbage-time/red-zone modeling), but a real improvement over a
// flat "half left" guess, which barely moved off the pregame number no
// matter how early or late the game actually was.
function remainingGameFraction(period: number, clock: string): number {
  if (period <= 0) return 1;
  if (period > 4) return 0; // OT — treat the pregame projection as fully "spent" by end of regulation
  const elapsedSeconds = (period - 1) * QUARTER_SECONDS + (QUARTER_SECONDS - parseClockSeconds(clock));
  return Math.max(0, Math.min(1, 1 - elapsedSeconds / REGULATION_SECONDS));
}

function estimate(
  state: "pre" | "in" | "post" | "none",
  actual: number,
  projected: number,
  remainingFraction: number
): { mean: number; stdev: number } {
  if (state === "post") return { mean: actual, stdev: 0 };
  if (state === "in") {
    return { mean: actual + remainingFraction * projected, stdev: STDEV_FRACTION_LIVE * projected * remainingFraction };
  }
  if (state === "pre") return { mean: projected, stdev: STDEV_FRACTION_PREGAME * projected };
  return { mean: 0, stdev: 0 }; // bye / no game found this week
}

function buildPlayerLine(
  playerId: string,
  scoringRules: ScoringRules,
  rankingsById: ReadonlyMap<string, RankedPlayer>,
  gamesByTeam: Map<string, NflGame>,
  projections: Map<string, SleeperStatLine>,
  stats: Map<string, SleeperStatLine>
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
  const projected = projLine ? scorePlayer(projLine, scoringRules) : 0;
  const actual = statLine ? scorePlayer(statLine, scoringRules) : 0;

  const state: "pre" | "in" | "post" | "none" = game ? game.status.state : "none";
  const remainingFraction = state === "in" && game ? remainingGameFraction(game.status.period, game.status.clock) : 1;
  const { mean, stdev } = estimate(state, actual, projected, remainingFraction);

  const hasStarted = state === "in" || state === "post";
  const gameDetail = !game
    ? "Bye"
    : state === "post"
      ? "Final"
      : state === "in"
        ? `🔴 ${game.status.period > 4 ? "OT" : `Q${game.status.period}`} ${game.status.clock}`.trim()
        : // Runs server-side, where the runtime's local timezone can't be
          // assumed to be Eastern (e.g. UTC on Vercel) — explicit here,
          // same convention as every other kickoff-time display in this
          // app (see getSlate in nflSchedule.ts). Missing this is what
          // made 1pm ET games show up as "5pm".
          new Date(game.kickoff).toLocaleString("en-US", {
            timeZone: "America/New_York",
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
      projectedFinal: mean,
      hasStarted,
      isFinal: state === "post",
      gameDetail,
      breakdown: hasStarted && statLine ? buildBreakdown(statLine) : [],
      raw: hasStarted && statLine ? statLine : {},
    },
    mean,
    stdev,
  };
}

// Fixed display order regardless of the league's actual roster-slot
// order (Sleeper's starters array / ESPN's roster entries can come back
// in an arbitrary or inconsistent order — a FLEX slot sitting between two
// unrelated positions, for instance) — QB, RB, WR, TE, DEF, K, anything
// else last. Array.prototype.sort is stable, so same-position players
// (e.g. two RBs) keep their original relative order.
const POSITION_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, DEF: 4, K: 5 };
function byPositionOrder(a: LivePlayerLine, b: LivePlayerLine): number {
  return (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);
}

function buildTeamScore(
  team: MatchupRosterEntry,
  scoringRules: ScoringRules,
  rankingsById: ReadonlyMap<string, RankedPlayer>,
  gamesByTeam: Map<string, NflGame>,
  projections: Map<string, SleeperStatLine>,
  stats: Map<string, SleeperStatLine>
): { score: LiveTeamScore; mean: number; variance: number } {
  const starterSet = new Set(team.starterPlayerIds);
  let mean = 0;
  let variance = 0;
  let currentTotal = 0;

  const starters: LivePlayerLine[] = team.starterPlayerIds
    .map((playerId) => {
      const { line, mean: playerMean, stdev } = buildPlayerLine(
        playerId,
        scoringRules,
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
    })
    .sort(byPositionOrder);

  const bench: LivePlayerLine[] = team.playerIds
    .filter((playerId) => !starterSet.has(playerId))
    .map((playerId) => buildPlayerLine(playerId, scoringRules, rankingsById, gamesByTeam, projections, stats).line)
    .sort(byPositionOrder);

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
  scoringRules: ScoringRules,
  rankingsById: ReadonlyMap<string, RankedPlayer>,
  projections: Map<string, SleeperStatLine>,
  stats: Map<string, SleeperStatLine>,
  schedule: NflGame[]
): LiveMatchup {
  const gamesByTeam = gameByTeam(schedule);
  const mine = buildTeamScore(myTeam, scoringRules, rankingsById, gamesByTeam, projections, stats);
  const theirs = buildTeamScore(opponent, scoringRules, rankingsById, gamesByTeam, projections, stats);

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
