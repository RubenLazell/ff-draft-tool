"use server";

import { createClient } from "@/lib/supabase/server";
import type { Format } from "@/lib/rankings";

export async function updateRank(playerId: string, newRank: number, format: Format) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("user_rankings")
    .update({ rank: newRank, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("player_id", playerId)
    .eq("format", format);

  if (error) return { error: error.message };
  return { error: null };
}

// Used by the head-to-head comparison tool — the two players being
// compared are always adjacent in rank, so trading their two rank values
// directly reorders them without needing the fractional-midpoint math
// drag-and-drop uses (there's no "neighbor" to compute a midpoint against;
// they're already each other's neighbor).
export async function swapRanks(
  playerIdA: string,
  rankA: number,
  playerIdB: string,
  rankB: number,
  format: Format
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const now = new Date().toISOString();
  const [resA, resB] = await Promise.all([
    supabase
      .from("user_rankings")
      .update({ rank: rankB, updated_at: now })
      .eq("user_id", user.id)
      .eq("player_id", playerIdA)
      .eq("format", format),
    supabase
      .from("user_rankings")
      .update({ rank: rankA, updated_at: now })
      .eq("user_id", user.id)
      .eq("player_id", playerIdB)
      .eq("format", format),
  ]);

  if (resA.error) return { error: resA.error.message };
  if (resB.error) return { error: resB.error.message };
  return { error: null };
}

// Fallback for the (effectively unreachable at MVP scale) case where a
// fractional-rank midpoint collides with a neighbor's value: renormalize
// this user's whole list (for this format) to integer ranks 1..N in their
// current order.
export async function renormalizeRanks(orderedPlayerIds: string[], format: Format) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const updates = orderedPlayerIds.map((playerId, index) =>
    supabase
      .from("user_rankings")
      .update({ rank: index + 1, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("player_id", playerId)
      .eq("format", format)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  return { error: null };
}
