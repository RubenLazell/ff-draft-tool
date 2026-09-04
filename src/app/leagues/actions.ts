"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchSleeperLeague } from "@/lib/sleeper";

export async function addLeague(leagueId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = leagueId.trim();
  if (!trimmed) return { error: "Enter a Sleeper league ID." };

  const league = await fetchSleeperLeague(trimmed);
  if (!league) return { error: "Couldn't find that Sleeper league. Check the ID and try again." };
  if (league.sport !== "nfl") return { error: "That league isn't an NFL league." };
  if (league.totalRosters === 0) return { error: "That league has no teams yet." };

  const { error } = await supabase.from("user_leagues").insert({
    user_id: user.id,
    platform: "SLEEPER",
    league_id: trimmed,
    league_name: league.name,
  });
  if (error) {
    if (error.code === "23505") return { error: "You've already added this league." };
    return { error: error.message };
  }
  return { error: null };
}

export async function removeLeague(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("user_leagues").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  return { error: null };
}

// A plain `<form action={fn}>` requires fn: (formData) => void | Promise<void>
// — this wraps removeLeague (which returns {error} for callers that check
// it) for that one use site, where there's nowhere to show an error anyway.
export async function removeLeagueFormAction(id: string): Promise<void> {
  await removeLeague(id);
}
