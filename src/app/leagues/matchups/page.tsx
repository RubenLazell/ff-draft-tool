import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings } from "@/lib/rankings";
import { fetchCurrentMatchup } from "@/lib/leagueImport";
import { MatchupCard } from "./MatchupCard";

export default async function MatchupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: leagues } = await supabase
    .from("user_leagues")
    .select("id, league_id, league_name, platform, season, espn_swid, espn_s2, my_roster_id")
    .eq("user_id", user.id)
    .not("my_roster_id", "is", null)
    .order("created_at", { ascending: false });

  const rankings = await getOrCreateUserRankings(supabase, user.id, "PPR");

  const cards = await Promise.all(
    (leagues ?? []).map(async (league) => {
      const credentials =
        league.espn_swid && league.espn_s2 ? { swid: league.espn_swid, espnS2: league.espn_s2 } : undefined;
      const result = await fetchCurrentMatchup(
        supabase,
        league.platform,
        league.league_id,
        league.my_roster_id as number,
        league.season,
        credentials
      );
      return { leagueRowId: league.id as string, leagueName: league.league_name ?? league.league_id, result };
    })
  );

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/leagues"
          className="mb-4 inline-block text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Back to leagues
        </Link>
        <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">My Matchups</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          This week&apos;s game in every league you&apos;ve set a team for, scored with your own rankings (PPR).
        </p>

        {cards.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No leagues set up yet — go to{" "}
            <Link href="/leagues" className="underline">
              Leagues
            </Link>{" "}
            and pick your team in each one.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {cards.map((card) => (
              <MatchupCard key={card.leagueRowId} leagueName={card.leagueName} result={card.result} rankings={rankings} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
