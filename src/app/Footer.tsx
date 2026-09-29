import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SITE_TOOLS, GROUP_LABELS } from "@/lib/siteNav";

// Site map on every page — every tool is always one click away, whatever
// page you're on.
export async function Footer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <footer className="border-t border-black/[.08] bg-white print:hidden dark:border-white/[.145] dark:bg-zinc-950">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 text-sm sm:grid-cols-3 sm:px-6">
        {(["season", "draft"] as const).map((group) => (
          <nav key={group} aria-label={GROUP_LABELS[group]}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {GROUP_LABELS[group]}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {SITE_TOOLS.filter((t) => t.group === group).map((tool) => (
                <li key={tool.key}>
                  <Link
                    href={user ? tool.href : (tool.guestHref ?? "/signup")}
                    className="text-zinc-700 hover:text-black hover:underline dark:text-zinc-300 dark:hover:text-white"
                  >
                    {tool.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <nav aria-label="Site">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Site
          </h2>
          <ul className="flex flex-col gap-1.5">
            <li>
              <Link href="/" className="text-zinc-700 hover:text-black hover:underline dark:text-zinc-300 dark:hover:text-white">
                Home
              </Link>
            </li>
            {!user && (
              <>
                <li>
                  <Link href="/guest" className="text-zinc-700 hover:text-black hover:underline dark:text-zinc-300 dark:hover:text-white">
                    Try as a guest
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="text-zinc-700 hover:text-black hover:underline dark:text-zinc-300 dark:hover:text-white">
                    Create an account
                  </Link>
                </li>
              </>
            )}
            <li>
              <Link href="/privacy" className="text-zinc-700 hover:text-black hover:underline dark:text-zinc-300 dark:hover:text-white">
                Privacy policy
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
