import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings, isFormat, FORMATS, FORMAT_LABELS, type Format } from "@/lib/rankings";
import { fetchSleeperLeague, fetchSleeperRosters, fetchSleeperUsers } from "@/lib/sleeper";
import { scoreLeagueTeams } from "@/lib/leagueScoring";
import { LeagueDetailView } from "./LeagueDetailView";

export default async function LeagueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { data: savedLeague } = await supabase
    .from("user_leagues")
    .select("id, league_id, league_name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!savedLeague) notFound();

  const { format: rawFormat } = await searchParams;
  const format: Format = rawFormat && isFormat(rawFormat) ? rawFormat : "PPR";

  const [league, rosters, sleeperUsers, rankings] = await Promise.all([
    fetchSleeperLeague(savedLeague.league_id),
    fetchSleeperRosters(savedLeague.league_id),
    fetchSleeperUsers(savedLeague.league_id),
    getOrCreateUserRankings(supabase, user.id, format),
  ]);

  if (!league) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 px-4 text-center dark:bg-black">
        <p className="font-medium text-black dark:text-zinc-50">
          Couldn&apos;t reach this league on Sleeper.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          It may have been renamed, deleted, or rolled over to a new season on Sleeper&apos;s end.
        </p>
      </div>
    );
  }

  const usersById = new Map(sleeperUsers.map((u) => [u.userId, u]));
  const rostersWithNames = rosters.map((r) => {
    const owner = r.ownerId ? usersById.get(r.ownerId) : undefined;
    return {
      rosterId: r.rosterId,
      ownerId: r.ownerId,
      playerIds: r.playerIds,
      teamName: owner?.teamName || owner?.displayName || `Team ${r.rosterId}`,
    };
  });

  const results = scoreLeagueTeams(league, rostersWithNames, rankings);

  return (
    <LeagueDetailView
      leagueRowId={savedLeague.id}
      leagueName={savedLeague.league_name ?? league.name}
      results={results}
      format={format}
      formats={FORMATS}
      formatLabels={FORMAT_LABELS}
    />
  );
}
