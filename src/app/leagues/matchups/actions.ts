"use server";

import { createClient } from "@/lib/supabase/server";

export type SnapshotPlayer = { playerId: string; fullName: string; position: string; points: number };

export type MatchupSnapshot = {
  capturedAt: string;
  myTotal: number;
  opponentTotal: number;
  myPlayers: SnapshotPlayer[];
  opponentPlayers: SnapshotPlayer[];
};

// Auth-scoped the same way getTeamNames/setMyTeam are in
// src/app/leagues/actions.ts: check the league row belongs to this user
// before returning anything, rather than relying on RLS alone.
export async function getMatchupSnapshots(
  leagueRowId: string,
  week: number
): Promise<{ error: string } | { error: null; snapshots: MatchupSnapshot[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: owned } = await supabase
    .from("user_leagues")
    .select("id")
    .eq("id", leagueRowId)
    .eq("user_id", user.id)
    .single();
  if (!owned) return { error: "League not found." };

  const { data, error } = await supabase
    .from("matchup_score_snapshots")
    .select("captured_at, my_total, opponent_total, my_players, opponent_players")
    .eq("user_league_id", leagueRowId)
    .eq("week", week)
    .order("captured_at", { ascending: true });
  if (error) return { error: error.message };

  const snapshots: MatchupSnapshot[] = (data ?? []).map((row) => ({
    capturedAt: row.captured_at as string,
    myTotal: row.my_total as number,
    opponentTotal: row.opponent_total as number,
    myPlayers: (row.my_players ?? []) as SnapshotPlayer[],
    opponentPlayers: (row.opponent_players ?? []) as SnapshotPlayer[],
  }));

  return { error: null, snapshots };
}
