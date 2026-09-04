import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddLeagueForm } from "./AddLeagueForm";
import { removeLeagueFormAction } from "./actions";

export default async function LeaguesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: leagues } = await supabase
    .from("user_leagues")
    .select("id, league_id, league_name, platform")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">
          Leagues
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Import a Sleeper league to see every team ranked using your own rankings.
        </p>

        <div className="mb-8 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <AddLeagueForm />
        </div>

        {leagues && leagues.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {leagues.map((league) => (
              <li
                key={league.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <Link
                  href={`/leagues/${league.id}`}
                  className="min-w-0 flex-1 truncate font-medium text-black hover:underline dark:text-zinc-50"
                >
                  {league.league_name ?? league.league_id}
                </Link>
                <form action={removeLeagueFormAction.bind(null, league.id)}>
                  <button
                    type="submit"
                    className="shrink-0 text-sm text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No leagues added yet — paste a Sleeper league ID above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
