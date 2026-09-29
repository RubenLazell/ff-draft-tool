import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AI_INSIGHTS_ALLOWED_EMAIL, AI_INSIGHTS_COOKIE } from "@/lib/aiInsights";
import { fetchSleeperCurrentWeek } from "@/lib/sleeper";
import { HomeDashboard, LandingPage } from "@/app/HomeViews";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <LandingPage />;

  const cookieStore = await cookies();
  const isAuthorizedForAiInsights = user.email === AI_INSIGHTS_ALLOWED_EMAIL;
  const aiInsightsEnabled = isAuthorizedForAiInsights && cookieStore.get(AI_INSIGHTS_COOKIE)?.value === "true";

  const [{ data: leagues }, week] = await Promise.all([
    supabase
      .from("user_leagues")
      .select("id, league_id, league_name, platform, my_roster_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    fetchSleeperCurrentWeek().catch(() => null),
  ]);

  return (
    <HomeDashboard
      email={user.email ?? ""}
      week={week}
      leagues={leagues ?? []}
      aiInsights={isAuthorizedForAiInsights ? { enabled: aiInsightsEnabled } : null}
    />
  );
}
