import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserRankings, isFormat, FORMATS, FORMAT_LABELS, type Format } from "@/lib/rankings";
import { fetchSleeperLeague, fetchSleeperRosters, fetchSleeperUsers } from "@/lib/sleeper";
import { fetchEspnLeague, EspnAuthRequiredError } from "@/lib/espn";
import { resolveEspnRosters } from "@/lib/espnMatching";
import { scoreLeagueTeams } from "@/lib/leagueScoring";
import { LeagueDetailView } from "./LeagueDetailView";

function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 px-4 text-center dark:bg-black">
      <p className="font-medium text-black dark:text-zinc-50">{title}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{detail}</p>
    </div>
  );
}

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

  let league: { rosterPositions: string[]; totalRosters: number; name: string };
  let rostersWithNames: { rosterId: number; ownerId: string | null; teamName: string; playerIds: string[] }[];

  if (savedLeague.platform === "SLEEPER") {
    const [sleeperLeague, rosters, sleeperUsers] = await Promise.all([
      fetchSleeperLeague(savedLeague.league_id),
      fetchSleeperRosters(savedLeague.league_id),
      fetchSleeperUsers(savedLeague.league_id),
    ]);
    if (!sleeperLeague) {
      return (
        <ErrorState
          title="Couldn't reach this league on Sleeper."
          detail="It may have been renamed, deleted, or rolled over to a new season on Sleeper's end."
        />
      );
    }
    const usersById = new Map(sleeperUsers.map((u) => [u.userId, u]));
    league = sleeperLeague;
    rostersWithNames = rosters.map((r) => {
      const owner = r.ownerId ? usersById.get(r.ownerId) : undefined;
      return {
        rosterId: r.rosterId,
        ownerId: r.ownerId,
        playerIds: r.playerIds,
        teamName: owner?.teamName || owner?.displayName || `Team ${r.rosterId}`,
      };
    });
  } else {
    const credentials =
      savedLeague.espn_swid && savedLeague.espn_s2
        ? { swid: savedLeague.espn_swid, espnS2: savedLeague.espn_s2 }
        : undefined;
    let espnLeague;
    try {
      espnLeague = await fetchEspnLeague(savedLeague.league_id, savedLeague.season ?? String(new Date().getFullYear()), credentials);
    } catch (err) {
      if (err instanceof EspnAuthRequiredError) {
        return (
          <ErrorState
            title="ESPN needs fresh login cookies for this league."
            detail="Your saved SWID/espn_s2 no longer work (they expire) — remove this league and re-add it with current cookies."
          />
        );
      }
      throw err;
    }
    if (!espnLeague) {
      return (
        <ErrorState
          title="Couldn't reach this league on ESPN."
          detail="It may have been deleted or rolled over to a new season on ESPN's end."
        />
      );
    }
    league = { rosterPositions: espnLeague.rosterPositions, totalRosters: espnLeague.teams.length, name: espnLeague.name };
    rostersWithNames = await resolveEspnRosters(supabase, espnLeague);
  }

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
