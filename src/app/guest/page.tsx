import Link from "next/link";
import { SITE_TOOLS } from "@/lib/siteNav";
import { ToolCard } from "@/app/ToolCard";

export const metadata = { title: "Try as a guest" };

export default function GuestHomePage() {
  const guestTools = SITE_TOOLS.filter((t) => t.guestHref && t.key !== "extension" && t.key !== "trade");
  const accountTools = SITE_TOOLS.filter((t) => !t.guestHref || t.key === "extension");

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">Try it as a guest</h1>
          <p className="max-w-lg text-sm text-zinc-600 dark:text-zinc-400">
            These work with no account, changes are saved only in this browser. Sign up any time to save
            permanently, sync across devices, and unlock the rest.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="flex h-11 items-center justify-center rounded-full bg-emerald-700 px-6 font-medium text-white transition-colors hover:bg-emerald-800"
            >
              Create a free account
            </Link>
            <Link
              href="/login"
              className="flex h-11 items-center justify-center rounded-full border border-black/[.12] px-6 font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              Log in
            </Link>
          </div>
        </div>

        <section aria-labelledby="guest-tools">
          <h2 id="guest-tools" className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
            No account needed
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {guestTools.map((t) => (
              <ToolCard key={t.key} tool={t} href={t.guestHref as string} cta="Try it now" />
            ))}
          </div>
        </section>

        <section aria-labelledby="account-tools">
          <h2 id="account-tools" className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
            With a free account
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {accountTools.map((t) =>
              t.key === "extension" ? (
                <ToolCard key={t.key} tool={t} href={t.href} cta="Learn more" note="Needs an account to log in" />
              ) : (
                <ToolCard key={t.key} tool={t} href="/signup" cta="Sign up to use" note="Free account" />
              )
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
