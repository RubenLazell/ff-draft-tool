import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { NavLinks } from "./NavLinks";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-50 print:hidden border-b border-black/[.08] bg-white/85 backdrop-blur dark:border-white/[.145] dark:bg-black/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-700 text-xs font-bold text-white"
          >
            FF
          </span>
          {/* Wordmark drops on the narrowest phones so Menu + auth buttons fit. */}
          <span className="max-[380px]:sr-only">FF Draft Tool</span>
        </Link>

        <div className="flex items-center gap-2">
          <NavLinks signedIn={!!user} />
          {user ? (
            <form action={signOut}>
              <button
                type="submit"
                className="h-9 rounded-full px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
              >
                Log out
              </button>
            </form>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden h-9 items-center whitespace-nowrap rounded-full px-3 text-sm font-medium text-zinc-600 sm:flex hover:bg-black/[.04] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="flex h-9 items-center whitespace-nowrap rounded-full bg-emerald-700 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-800"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
