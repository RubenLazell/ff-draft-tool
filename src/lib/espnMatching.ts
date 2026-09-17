// Resolves ESPN's own roster/player data against our `players` table (no
// id overlap with ESPN — unlike Sleeper, whose player ids ARE our
// players.id — so this matches by normalized name, with team as an extra
// signal for DEF entries). Produces the same plain roster shape Sleeper's
// import produces ({ rosterId, ownerId, teamName, playerIds }), so
// scoreLeagueTeams and everything under it needs zero ESPN-specific code,
// per the platform-agnostic design from the Sleeper phase.
//
// The VORP scoring pipeline (buildOptimalLineup) deliberately ignores
// ESPN's own current lineupSlotId assignments (who a manager actually
// started this week) — every rostered player, bench and IR included,
// feeds into the same optimal-lineup logic this app runs for Sleeper, so
// both platforms are judged by roster *potential*, not by how well
// someone set their lineup this week. `starterPlayerIds` (derived from
// that same lineupSlotId data, just not discarded) exists alongside
// `playerIds` for callers that specifically want the real lineup instead
// — currently only the live-scoring feature (src/lib/liveScoring.ts).

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
): Promise<
  { rosterId: number; ownerId: string | null; teamName: string; playerIds: string[]; starterPlayerIds: string[] }[]
> {
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
    const playerIds: string[] = [];
    const starterPlayerIds: string[] = [];
    for (const slot of team.roster) {
      if (!slot.player) continue;
      const matchedId =
        slot.player.position === "DEF"
          ? byTeamDef.get(normalizeTeamCode(slot.player.proTeam) ?? "")
          : byNameOnly.get(normalizeName(slot.player.fullName));
      const id = matchedId ?? `${ESPN_UNMATCHED_PREFIX}${slot.player.fullName}`;
      playerIds.push(id);
      if (slot.slotType !== "BN" && slot.slotType !== "IR") starterPlayerIds.push(id);
    }

    return {
      rosterId: team.teamId,
      ownerId: null,
      teamName: team.teamName,
      playerIds,
      starterPlayerIds,
    };
  });
}
