import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings, isFormat, FORMATS, FORMAT_LABELS, type Format } from "@/lib/rankings";
import { fetchAndResolveLeague } from "@/lib/leagueImport";
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
    .select("id, platform, league_id, league_name, season, espn_swid, espn_s2")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!savedLeague) notFound();

  const { format: rawFormat } = await searchParams;
  const format: Format = rawFormat && isFormat(rawFormat) ? rawFormat : "PPR";
  const rankings = await getOrCreateUserRankings(supabase, user.id, format);

  const credentials =
    savedLeague.espn_swid && savedLeague.espn_s2
      ? { swid: savedLeague.espn_swid, espnS2: savedLeague.espn_s2 }
      : undefined;
  const fetchResult = await fetchAndResolveLeague(
    supabase,
    savedLeague.platform,
    savedLeague.league_id,
    savedLeague.season,
    credentials
  );

  if (fetchResult.error !== null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 px-4 text-center dark:bg-black">
        <p className="font-medium text-black dark:text-zinc-50">
          Couldn&apos;t reach this league on {savedLeague.platform === "SLEEPER" ? "Sleeper" : "ESPN"}.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{fetchResult.error}</p>
      </div>
    );
  }

  const { league, rosters } = fetchResult.resolved;
  const results = scoreLeagueTeams(league, rosters, rankings);

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
