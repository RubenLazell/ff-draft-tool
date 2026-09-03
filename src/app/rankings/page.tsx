import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings, isFormat, type Format } from "@/lib/rankings";
import { AI_INSIGHTS_ALLOWED_EMAIL, AI_INSIGHTS_COOKIE } from "@/lib/aiInsights";
import { RankingsBoard } from "./RankingsBoard";

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; t?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { format: rawFormat, t } = await searchParams;
  const format: Format = rawFormat && isFormat(rawFormat) ? rawFormat : "PPR";

  const rankings = await getOrCreateUserRankings(supabase, user.id, format);
  const cookieStore = await cookies();
  const aiInsightsEnabled =
    user.email === AI_INSIGHTS_ALLOWED_EMAIL &&
    cookieStore.get(AI_INSIGHTS_COOKIE)?.value === "true";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">
          My Rankings
        </h1>
        <p className="mb-4 text-sm text-zinc-600 sm:mb-6 dark:text-zinc-400">
          Drag players to reorder your big board.
        </p>
        <RankingsBoard
          key={`${format}:${t ?? ""}`}
          initialRankings={rankings}
          format={format}
          aiInsightsEnabled={aiInsightsEnabled}
        />
      </div>
    </div>
  );
}
