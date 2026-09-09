// Re-groups the same per-league matchup data MatchupCard already renders
// (my roster + opponent's roster per league) by real NFL game instead of
// by fantasy league — e.g. "which of my players, and which of my
// opponents' players, are playing in the Patriots @ Seahawks game" rather
// than "who am I playing in League X." A player's team can appear in at
// most one game per week, so this is a straight lookup, not a scoring
// computation — no VORP/replacement-rank math involved.

import { normalizeTeamCode } from "@/lib/normalizeName";
import type { NflGame } from "@/lib/nflSchedule";
import type { PositionRanked } from "@/lib/leagueScoring";

export type RosterPlayerWithSlot = PositionRanked & { isStarter: boolean };

export type GamePlayerEntry = {
  player: PositionRanked;
  leagueName: string;
  role: "mine" | "opponent";
  opponentTeamName: string; // the fantasy team on the other side of this entry's league matchup, for context
  isStarter: boolean;
};

export type GameGroup = {
  game: NflGame;
  entries: GamePlayerEntry[];
};

export function groupPlayersByGame(
  leagueMatchups: {
    leagueName: string;
    myTeamName: string;
    opponentTeamName: string;
    myRoster: RosterPlayerWithSlot[];
    opponentRoster: RosterPlayerWithSlot[];
  }[],
  schedule: NflGame[]
): GameGroup[] {
  const gameByTeam = new Map<string, NflGame>();
  for (const game of schedule) {
    gameByTeam.set(game.homeTeam, game);
    gameByTeam.set(game.awayTeam, game);
  }

  const groups = new Map<string, GameGroup>();
  function addEntry(player: RosterPlayerWithSlot, leagueName: string, role: "mine" | "opponent", opponentTeamName: string) {
    const team = normalizeTeamCode(player.team);
    if (!team) return; // free agent / no team on record
    const game = gameByTeam.get(team);
    if (!game) return; // bye week, or a team not found in this week's schedule

    let group = groups.get(game.gameId);
    if (!group) {
      group = { game, entries: [] };
      groups.set(game.gameId, group);
    }
    group.entries.push({ player, leagueName, role, opponentTeamName, isStarter: player.isStarter });
  }

  for (const league of leagueMatchups) {
    for (const p of league.myRoster) addEntry(p, league.leagueName, "mine", league.opponentTeamName);
    for (const p of league.opponentRoster) addEntry(p, league.leagueName, "opponent", league.myTeamName);
  }

  return [...groups.values()].sort(
    (a, b) => new Date(a.game.kickoff).getTime() - new Date(b.game.kickoff).getTime()
  );
}
