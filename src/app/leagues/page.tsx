import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddLeagueForm } from "./AddLeagueForm";
import { TeamPickerButton } from "./TeamPickerButton";
import { removeLeagueFormAction } from "./actions";

export const metadata = { title: "Leagues" };

export default async function LeaguesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: leagues } = await supabase
    .from("user_leagues")
    .select("id, league_id, league_name, platform, my_roster_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const hasAnyTeamSet = leagues?.some((l) => l.my_roster_id != null) ?? false;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">
          Leagues
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Import a Sleeper or ESPN league to see every team ranked by your own rankings, build trades,
          and follow your matchups live.
        </p>

        {leagues && leagues.length > 0 && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Live Matchups</h2>
              <p className="text-sm text-emerald-50">
                {hasAnyTeamSet
                  ? "Every league's matchup this week, live, under each league's real scoring."
                  : "Set your team in a league below to follow its matchup live."}
              </p>
            </div>
            {hasAnyTeamSet && (
              <Link
                href="/leagues/matchups"
                className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-white"
              >
                Open matchups <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        )}

        <section
          aria-labelledby="add-league"
          className="mb-8 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"
        >
          <h2 id="add-league" className="mb-3 font-semibold text-black dark:text-zinc-50">
            Add a league
          </h2>
          <AddLeagueForm />
        </section>

        {leagues && leagues.length > 0 ? (
          <>
          <h2 className="mb-3 font-semibold text-black dark:text-zinc-50">Your leagues</h2>
          <ul className="flex flex-col gap-2">
            {leagues.map((league) => (
              <li
                key={league.id}
                className="flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/leagues/${league.id}`}
                    className="min-w-0 flex-1 truncate font-medium text-black hover:underline dark:text-zinc-50"
                  >
                    {league.league_name ?? league.league_id}
                  </Link>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {league.platform === "SLEEPER" ? "Sleeper" : "ESPN"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <Link
                    href={`/leagues/${league.id}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Power rankings
                  </Link>
                  <Link
                    href={`/leagues/${league.id}?view=find`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Trade finder
                  </Link>
                  <Link
                    href={`/leagues/${league.id}?view=trade`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Trade calculator
                  </Link>
                  <TeamPickerButton leagueRowId={league.id} myRosterId={league.my_roster_id} />
                  <form action={removeLeagueFormAction.bind(null, league.id)} className="ml-auto">
                    <button
                      type="submit"
                      aria-label={`Remove ${league.league_name ?? league.league_id}`}
                      className="text-sm text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          </>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No leagues added yet, paste a Sleeper or ESPN league ID above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
