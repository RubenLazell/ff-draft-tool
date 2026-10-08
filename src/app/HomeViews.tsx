import Link from "next/link";
import { SITE_TOOLS, GROUP_LABELS, type SiteTool } from "@/lib/siteNav";
import { AiInsightsToggle } from "@/app/AiInsightsToggle";
import { ToolCard } from "@/app/ToolCard";
import { ToolIcon } from "@/app/ToolIcon";

// The home page's two faces: the signed-in dashboard and the signed-out
// landing page. Pure rendering — data loading stays in page.tsx.

const tool = (key: string) => SITE_TOOLS.find((t) => t.key === key) as SiteTool;
const DRAFT_TOOLS = SITE_TOOLS.filter((t) => t.group === "draft");

export type DashboardLeague = {
  id: string;
  league_id: string;
  league_name: string | null;
  platform: string;
  my_roster_id: number | null;
};

export function HomeDashboard({
  email,
  week,
  leagues: leagueList,
  aiInsights,
}: {
  email: string;
  week: number | null;
  leagues: DashboardLeague[];
  // null when this account can't use AI insights at all — the card is
  // hidden rather than shown permanently disabled.
  aiInsights: { enabled: boolean } | null;
}) {
  const leaguesWithTeam = leagueList.filter((l) => l.my_roster_id != null);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        <header>
          {week != null && (
            <p className="mb-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">NFL Week {week}</p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-black sm:text-4xl dark:text-zinc-50">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Signed in as {email}</p>
        </header>

        {/* This week — the in-season tools, front and center. */}
        <section aria-labelledby="this-week" className="grid gap-4 lg:grid-cols-5">
          <h2 id="this-week" className="sr-only">
            This week
          </h2>
          <MatchupsHero leagueCount={leagueList.length} withTeamCount={leaguesWithTeam.length} />

          <div className="flex flex-col rounded-2xl border border-black/[.08] bg-white p-5 lg:col-span-2 dark:border-white/[.145] dark:bg-zinc-950">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-black dark:text-zinc-50">Your leagues</h2>
              <Link href="/leagues" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                Manage
              </Link>
            </div>
            {leagueList.length === 0 ? (
              <div className="flex flex-1 flex-col items-start justify-center gap-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Import a Sleeper or ESPN league to unlock power rankings, the trade calculator and live
                  matchups.
                </p>
                <Link
                  href="/leagues"
                  className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  Import a league
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
                {leagueList.map((league) => (
                  <li key={league.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-black dark:text-zinc-50">
                        {league.league_name ?? league.league_id}
                      </span>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {league.platform === "SLEEPER" ? "Sleeper" : "ESPN"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <Link
                        href={`/leagues/${league.id}`}
                        className="flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        <ToolIcon tool="leagues" className="h-4 w-4" />
                        Power rankings
                      </Link>
                      <Link
                        href={`/leagues/${league.id}?view=find`}
                        className="flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        <ToolIcon tool="finder" className="h-4 w-4" />
                        Trade finder
                      </Link>
                      <Link
                        href={`/leagues/${league.id}?view=trade`}
                        className="flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        <ToolIcon tool="trade" className="h-4 w-4" />
                        Trade calculator
                      </Link>
                      {league.my_roster_id == null && (
                        <Link href="/leagues" className="font-medium text-amber-700 hover:underline dark:text-amber-400">
                          Set your team
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="draft-tools">
          <h2 id="draft-tools" className="mb-1 text-lg font-semibold text-black dark:text-zinc-50">
            {GROUP_LABELS.draft}
          </h2>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Your rankings drive everything above, keep them sharp.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DRAFT_TOOLS.map((t) => (
              <ToolCard key={t.key} tool={t} href={t.href} cta={t.cta} />
            ))}
          </div>
        </section>

        {aiInsights && (
          <section
            aria-labelledby="ai-insights"
            className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[.145] dark:bg-zinc-950"
          >
            <div>
              <h2 id="ai-insights" className="font-semibold text-black dark:text-zinc-50">
                AI Insights
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                AI-generated strength/concern and injury research on player cards in your rankings, off by
                default since each one costs a small amount to generate.
              </p>
            </div>
            <div className="shrink-0">
              <AiInsightsToggle enabled={aiInsights.enabled} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// The matchups card adapts to where the user is in setup, so the next step
// is always the button in front of them rather than a note somewhere else.
function MatchupsHero({ leagueCount, withTeamCount }: { leagueCount: number; withTeamCount: number }) {
  const matchups = tool("matchups");
  const ready = withTeamCount > 0;
  const cta = ready
    ? { href: "/leagues/matchups", label: "Open live matchups" }
    : leagueCount > 0
      ? { href: "/leagues", label: "Pick your team to start" }
      : { href: "/leagues", label: "Import a league to start" };

  return (
    <div className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-6 text-white shadow-sm lg:col-span-3">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
            <ToolIcon tool="matchups" />
          </span>
          <h2 className="text-xl font-semibold">{matchups.label}</h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-emerald-50">{matchups.description}</p>
        {ready && (
          <p className="mt-2 text-sm text-emerald-100">
            Tracking {withTeamCount} {withTeamCount === 1 ? "league" : "leagues"}.
          </p>
        )}
      </div>
      <Link
        href={cta.href}
        className="relative inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-white"
      >
        {cta.label} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <section className="relative overflow-hidden border-b border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 max-w-3xl rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center sm:py-24">
          <p className="rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            Free fantasy football toolkit
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-black sm:text-5xl dark:text-zinc-50">
            Your rankings. Your league&apos;s scoring. One place.
          </h1>
          <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Build your own big board, take it into the draft room, then follow every matchup live, scored
            exactly the way your Sleeper or ESPN league scores it.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/signup"
              className="flex h-12 items-center justify-center rounded-full bg-emerald-700 px-6 font-medium text-white transition-colors hover:bg-emerald-800"
            >
              Create a free account
            </Link>
            <Link
              href="/guest"
              className="flex h-12 items-center justify-center rounded-full border border-black/[.12] bg-white px-6 font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:bg-transparent dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              Try it without an account
            </Link>
          </div>
          <p className="max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            Guest mode saves to this browser only. An account syncs across devices and unlocks live matchups
            and the Chrome extension.
          </p>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6">
        {(["season", "draft"] as const).map((group) => (
          <section key={group} aria-labelledby={`group-${group}`}>
            <h2 id={`group-${group}`} className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
              {GROUP_LABELS[group]}
            </h2>
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
              {SITE_TOOLS.filter((t) => t.group === group).map((t) =>
                t.guestHref ? (
                  <ToolCard key={t.key} tool={t} href={t.guestHref} cta={t.key === "extension" ? t.cta : "Try it now"} />
                ) : (
                  <ToolCard key={t.key} tool={t} href="/signup" cta="Sign up to use" note="Free account" />
                )
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
