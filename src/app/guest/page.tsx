import Link from "next/link";

export default function GuestHomePage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 text-center dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Try it as a guest
          </h1>
          <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Every feature below works with no account — changes are saved only in this browser.
            Sign up any time to save permanently, sync across devices, and use the Chrome extension.
          </p>
        </div>

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

        <div className="grid w-full gap-4 text-left sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Rankings Board
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Drag-and-drop your own big board, seeded from consensus rankings — search, filter by
              position, and jump a player straight to a rank.
            </p>
            <Link
              href="/rankings/guest"
              className="text-sm font-medium underline text-black dark:text-zinc-50"
            >
              Start ranking →
            </Link>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Head-to-Head
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Refine your rankings two players at a time — pick who you&apos;d rather draft, and
              your board reorders automatically whenever your pick disagrees with it.
            </p>
            <Link
              href="/rankings/compare/guest"
              className="text-sm font-medium underline text-black dark:text-zinc-50"
            >
              Start comparing →
            </Link>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Printable Cheatsheet
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A print-ready draft cheat sheet, color-coded by position, generated straight from
              your rankings.
            </p>
            <Link
              href="/rankings/cheatsheet/guest"
              className="text-sm font-medium underline text-black dark:text-zinc-50"
            >
              Create a cheatsheet →
            </Link>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              League Import
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Paste any Sleeper or ESPN league ID to see every team ranked by strength, with a
              visual breakdown of where each team&apos;s value comes from.
            </p>
            <Link
              href="/leagues/guest"
              className="text-sm font-medium underline text-black dark:text-zinc-50"
            >
              Preview a league →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
