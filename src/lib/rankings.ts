import type { SupabaseClient } from "@supabase/supabase-js";

export const FORMATS = ["PPR", "HALF_PPR", "STANDARD", "SUPERFLEX"] as const;
export type Format = (typeof FORMATS)[number];

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}

export const FORMAT_LABELS: Record<Format, string> = {
  PPR: "PPR",
  HALF_PPR: "Half-PPR",
  STANDARD: "Standard",
  SUPERFLEX: "Superflex",
};

export type RankedPlayer = {
  playerId: string;
  fullName: string;
  position: string;
  team: string | null;
  rank: number;
  consensusRank: number | null;
  injuryStatus: string | null;
  injuryBodyPart: string | null;
  injuryNotes: string | null;
  practiceParticipation: string | null;
  byeWeek: number | null;
};

export async function getOrCreateUserRankings(
  supabase: SupabaseClient,
  userId: string,
  format: Format
): Promise<RankedPlayer[]> {
  const existing = await fetchRankings(supabase, userId, format);
  if (existing.length > 0) {
    // Re-running the seed/sync scripts can add players (or a first-time
    // format like a newly-drafted rookie) after this user's board already
    // exists — append any the user doesn't have yet rather than leaving
    // them invisible. Ranks go after everything the user already has, so
    // no existing row's rank (and thus no manual reordering) is touched.
    const appended = await appendMissingPlayers(supabase, userId, format, existing);
    return appended ? await fetchRankings(supabase, userId, format) : existing;
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, search_rank, consensus_rankings(consensus_rank, format)");
  if (playersError) throw playersError;
  if (!players || players.length === 0) return [];

  // Prefer this format's consensus ADP for the default seed order; fall
  // back to Sleeper's generic search_rank for any player without
  // consensus coverage (e.g. deep bench players FFC doesn't track).
  const sortable = players.map((p) => {
    const consensusRows = (p.consensus_rankings ?? []) as {
      consensus_rank: number;
      format: string;
    }[];
    const consensus = consensusRows.find((c) => c.format === format);
    return {
      id: p.id,
      sortValue: consensus?.consensus_rank ?? p.search_rank ?? Infinity,
    };
  });
  sortable.sort((a, b) => a.sortValue - b.sortValue || a.id.localeCompare(b.id));

  const seedRows = sortable.map((p, i) => ({
    user_id: userId,
    player_id: p.id,
    format,
    rank: i + 1,
  }));

  // upsert + ignoreDuplicates makes this safe if the same first-time user
  // opens two tabs at once and both requests see "no rows yet".
  const { error: seedError } = await supabase
    .from("user_rankings")
    .upsert(seedRows, {
      onConflict: "user_id,player_id,format",
      ignoreDuplicates: true,
    });
  if (seedError) throw seedError;

  return fetchRankings(supabase, userId, format);
}

// Returns whether anything was inserted (so the caller knows to re-fetch).
async function appendMissingPlayers(
  supabase: SupabaseClient,
  userId: string,
  format: Format,
  existing: RankedPlayer[]
): Promise<boolean> {
  const { data: players, error } = await supabase
    .from("players")
    .select("id, search_rank, consensus_rankings(consensus_rank, format)");
  if (error) throw error;
  if (!players || players.length === 0) return false;

  const existingIds = new Set(existing.map((p) => p.playerId));
  const missing = players.filter((p) => !existingIds.has(p.id));
  if (missing.length === 0) return false;

  // Same consensus-rank-first, search-rank-fallback ordering as the initial
  // seed, applied only among the new arrivals, so they land at the bottom
  // in a sensible relative order instead of players-table insertion order.
  const sortable = missing.map((p) => {
    const consensusRows = (p.consensus_rankings ?? []) as {
      consensus_rank: number;
      format: string;
    }[];
    const consensus = consensusRows.find((c) => c.format === format);
    return { id: p.id, sortValue: consensus?.consensus_rank ?? p.search_rank ?? Infinity };
  });
  sortable.sort((a, b) => a.sortValue - b.sortValue || a.id.localeCompare(b.id));

  const maxRank = Math.max(...existing.map((p) => p.rank));
  const newRows = sortable.map((p, i) => ({
    user_id: userId,
    player_id: p.id,
    format,
    rank: maxRank + i + 1,
  }));

  const { error: insertError } = await supabase
    .from("user_rankings")
    .upsert(newRows, { onConflict: "user_id,player_id,format", ignoreDuplicates: true });
  if (insertError) throw insertError;
  return true;
}

// Guest mode's board: the same consensus-rank-first, search-rank-fallback
// seed order new signed-up users get (see getOrCreateUserRankings above),
// but with no user_id to write against — just returned directly, with rank
// synthesized from sort position. Reads `players`/`consensus_rankings`
// directly rather than through `user_rankings`, so it needs a client that
// can read those tables without a user session (RLS blocks the anon key
// there the same as everywhere else) — callers pass a service-role client.
export async function getDefaultRankings(
  supabase: SupabaseClient,
  format: Format
): Promise<RankedPlayer[]> {
  const { data: players, error } = await supabase.from("players").select(
    "id, full_name, position, team, bye_week, injury_status, injury_body_part, injury_notes, practice_participation, search_rank, consensus_rankings(consensus_rank, format)"
  );
  if (error) throw error;
  if (!players || players.length === 0) return [];

  const sortable = players.map((p) => {
    const consensusRows = (p.consensus_rankings ?? []) as {
      consensus_rank: number;
      format: string;
    }[];
    const consensus = consensusRows.find((c) => c.format === format);
    return {
      player: p,
      consensusRank: consensus?.consensus_rank ?? null,
      sortValue: consensus?.consensus_rank ?? p.search_rank ?? Infinity,
    };
  });
  sortable.sort((a, b) => a.sortValue - b.sortValue || a.player.id.localeCompare(b.player.id));

  return sortable.map((entry, i) => ({
    playerId: entry.player.id,
    fullName: entry.player.full_name,
    position: entry.player.position,
    team: entry.player.team,
    rank: i + 1,
    consensusRank: entry.consensusRank,
    injuryStatus: entry.player.injury_status,
    injuryBodyPart: entry.player.injury_body_part,
    injuryNotes: entry.player.injury_notes,
    practiceParticipation: entry.player.practice_participation,
    byeWeek: entry.player.bye_week,
  }));
}

async function fetchRankings(
  supabase: SupabaseClient,
  userId: string,
  format: Format
): Promise<RankedPlayer[]> {
  const { data, error } = await supabase
    .from("user_rankings")
    .select(
      "player_id, rank, players(full_name, position, team, bye_week, injury_status, injury_body_part, injury_notes, practice_participation, consensus_rankings(consensus_rank, format))"
    )
    .eq("user_id", userId)
    .eq("format", format)
    .order("rank", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    const consensusRows = (player?.consensus_rankings ?? []) as {
      consensus_rank: number;
      format: string;
    }[];
    const consensus = consensusRows.find((c) => c.format === format);
    return {
      playerId: row.player_id,
      fullName: player!.full_name,
      position: player!.position,
      team: player!.team,
      rank: row.rank,
      consensusRank: consensus?.consensus_rank ?? null,
      injuryStatus: player!.injury_status,
      injuryBodyPart: player!.injury_body_part,
      injuryNotes: player!.injury_notes,
      practiceParticipation: player!.practice_participation,
      byeWeek: player!.bye_week,
    };
  });
}
