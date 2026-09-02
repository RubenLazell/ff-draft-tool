"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AI_INSIGHTS_ALLOWED_EMAIL, AI_INSIGHTS_COOKIE } from "@/lib/aiInsights";

// AI insights (player strength/concern + injury outlook research) call a
// paid API on every click, so they're opt-in rather than always-on for
// whoever happens to be logged in — this toggle is the switch, and it's
// re-checked server-side (not just disabled in the UI) since a request
// could otherwise be crafted directly against this action.
export async function setAiInsightsEnabled(enabled: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (user.email !== AI_INSIGHTS_ALLOWED_EMAIL) {
    return { error: "Not authorized" };
  }

  const cookieStore = await cookies();
  cookieStore.set(AI_INSIGHTS_COOKIE, enabled ? "true" : "false", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { error: null };
}
