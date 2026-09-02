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
