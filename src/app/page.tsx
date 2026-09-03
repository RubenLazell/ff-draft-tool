import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { AI_INSIGHTS_ALLOWED_EMAIL, AI_INSIGHTS_COOKIE } from "@/lib/aiInsights";
import { AiInsightsToggle } from "@/app/AiInsightsToggle";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const isAuthorizedForAiInsights = user?.email === AI_INSIGHTS_ALLOWED_EMAIL;
  const aiInsightsEnabled =
    isAuthorizedForAiInsights && cookieStore.get(AI_INSIGHTS_COOKIE)?.value === "true";

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 text-center dark:bg-black">
      {user ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Welcome back
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
          </div>

          <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
            <Link
              href="/rankings"
              className="flex h-12 w-40 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              My rankings
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-12 w-40 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              >
                Log out
              </button>
            </form>
          </div>

          <div className="grid w-full gap-4 text-left sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                AI Insights
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                AI-generated strength/concern and injury research on player
                cards in your rankings — off by default since each one costs
                a small amount to generate.
              </p>
              <AiInsightsToggle
                enabled={aiInsightsEnabled}
                disabled={!isAuthorizedForAiInsights}
                disabledReason="not-authorized"
              />
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Live Draft Assistant
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                A Chrome extension overlays your rankings on ESPN and Sleeper
                draft rooms, filtering out picks live as they happen so you
                always know who&apos;s still available.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <h1 className="max-w-lg text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Rank your players. Draft smarter.
          </h1>
          <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
            Build your own fantasy football rankings, then take them with you
            on draft day.
          </p>
          <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
            <Link
              href="/signup"
              className="flex h-12 w-40 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="flex h-12 w-40 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
            >
              Log in
            </Link>
          </div>
          <AiInsightsToggle enabled={false} disabled disabledReason="logged-out" />
        </div>
      )}
    </div>
  );
}
