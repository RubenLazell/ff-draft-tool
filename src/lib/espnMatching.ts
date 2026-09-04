// Resolves ESPN's own roster/player data against our `players` table (no
// id overlap with ESPN — unlike Sleeper, whose player ids ARE our
// players.id — so this matches by normalized name, with team as an extra
// signal for DEF entries). Produces the exact same plain roster shape
// Sleeper's import produces ({ rosterId, ownerId, teamName, playerIds }),
// so scoreLeagueTeams and everything under it needs zero ESPN-specific
// code, per the platform-agnostic design from the Sleeper phase.
//
// Deliberately ignores ESPN's own current lineupSlotId assignments (who a
// manager actually started this week) — every rostered player, bench and
// IR included, feeds into the same buildOptimalLineup this app already
// runs for Sleeper, so both platforms are judged by roster *potential*,
// not by how well someone set their lineup this week.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EspnLeague } from "@/lib/espn";
import { normalizeName, normalizeTeamCode } from "@/lib/normalizeName";

// Any unmatched ESPN player is encoded as this sentinel "player id" — it
// can never collide with a real Sleeper-sourced players.id, so it's
// guaranteed to land in resolveRosterPlayers' unresolvedPlayerIds
// untouched, and the UI strips this prefix to show the real name instead
// of treating it like an opaque Sleeper id.
export const ESPN_UNMATCHED_PREFIX = "espn-unmatched:";

export async function resolveEspnRosters(
  supabase: SupabaseClient,
  league: EspnLeague
): Promise<{ rosterId: number; ownerId: string | null; teamName: string; playerIds: string[] }[]> {
  const { data: players, error } = await supabase.from("players").select("id, full_name, position, team");
  if (error) throw error;

  const byNameOnly = new Map<string, string>();
  const byTeamDef = new Map<string, string>();
  for (const p of players ?? []) {
    if (p.position === "DEF") {
      const team = normalizeTeamCode(p.team);
      if (team) byTeamDef.set(team, p.id);
      continue;
    }
    byNameOnly.set(normalizeName(p.full_name), p.id);
  }

  return league.teams.map((team) => {
    const playerIds = team.roster
      .map((slot) => slot.player)
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map((p) => {
        const matchedId =
          p.position === "DEF"
            ? byTeamDef.get(normalizeTeamCode(p.proTeam) ?? "")
            : byNameOnly.get(normalizeName(p.fullName));
        return matchedId ?? `${ESPN_UNMATCHED_PREFIX}${p.fullName}`;
      });

    return {
      rosterId: team.teamId,
      ownerId: null,
      teamName: team.teamName,
      playerIds,
    };
  });
}
