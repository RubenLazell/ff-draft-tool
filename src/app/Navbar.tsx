import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b border-black/[.08] bg-white/80 px-4 backdrop-blur sm:px-6 dark:border-white/[.145] dark:bg-black/80">
      <Link
        href="/"
        className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
      >
        FF Draft Tool
      </Link>
      <nav className="flex items-center gap-3 text-sm font-medium sm:gap-4">
        {user ? (
          <>
            <Link
              href="/rankings"
              className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              My Rankings
            </Link>
            <Link
              href="/rankings/compare"
              className="hidden text-zinc-600 hover:text-black sm:inline dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Head-to-head
            </Link>
            <Link
              href="/leagues"
              className="hidden text-zinc-600 hover:text-black sm:inline dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Leagues
            </Link>
            <Link
              href="/extension"
              className="hidden text-zinc-600 hover:text-black sm:inline dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Extension
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-full border border-black/[.08] px-3 py-1 text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              >
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/guest"
              className="hidden text-zinc-600 hover:text-black sm:inline dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Try as guest
            </Link>
            <Link
              href="/login"
              className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-foreground px-3 py-1 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
