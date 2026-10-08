"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_TOOLS, GROUP_LABELS, type SiteTool } from "@/lib/siteNav";
import { ToolIcon } from "./ToolIcon";

// Tools shown directly in the desktop bar. The trade calculator lives
// inside each league page, so it's reached through Leagues there — but it
// still gets its own row in the mobile menu and on the home page.
const DESKTOP_KEYS = ["matchups", "leagues", "rankings", "compare", "cheatsheet", "extension"];

function hrefFor(tool: SiteTool, signedIn: boolean): string {
  if (signedIn) return tool.href;
  return tool.guestHref ?? "/signup";
}

// Longest-prefix match so /rankings/compare highlights Head-to-head, not
// Rankings, and /leagues/matchups highlights Matchups, not Leagues.
function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    const matches = pathname === h || pathname.startsWith(h + "/");
    if (matches && (!best || h.length > best.length)) best = h;
  }
  return best;
}

export function NavLinks({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close the mobile menu whenever navigation happens.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const desktopTools = SITE_TOOLS.filter((t) => DESKTOP_KEYS.includes(t.key));
  const current = activeHref(
    pathname,
    desktopTools.map((t) => hrefFor(t, signedIn))
  );
  const mobileCurrent = activeHref(
    pathname,
    SITE_TOOLS.map((t) => hrefFor(t, signedIn))
  );

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {desktopTools.map((tool) => {
          const href = hrefFor(tool, signedIn);
          const isCurrent = href === current;
          const locked = !signedIn && tool.guestHref === null;
          return (
            <Link
              key={tool.key}
              href={href}
              aria-current={isCurrent ? "page" : undefined}
              title={locked ? "Needs a free account" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isCurrent
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "text-zinc-600 hover:bg-black/[.04] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
              }`}
            >
              <ToolIcon tool={tool.key} className="h-4 w-4" />
              {tool.navLabel}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="flex h-9 items-center gap-2 rounded-full border border-black/[.08] px-3 text-sm font-medium text-black transition-colors hover:bg-black/[.04] lg:hidden dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        Menu
      </button>

      {open && (
        <>
          <div className="fixed inset-0 top-14 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <nav
            id="mobile-menu"
            aria-label="Main"
            className="fixed inset-x-0 top-14 z-50 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-black/[.08] bg-white px-4 pb-6 pt-2 shadow-lg lg:hidden dark:border-white/[.145] dark:bg-zinc-950"
          >
            {(["season", "draft"] as const).map((group) => (
              <div key={group} className="mt-3">
                <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {GROUP_LABELS[group]}
                </p>
                <ul className="flex flex-col">
                  {SITE_TOOLS.filter((t) => t.group === group).map((tool) => {
                    const href = hrefFor(tool, signedIn);
                    // Trade tools share Leagues' href, so only Leagues lights up.
                    const isCurrent = tool.key !== "trade" && tool.key !== "finder" && href === mobileCurrent;
                    const locked = !signedIn && tool.guestHref === null;
                    return (
                      <li key={tool.key}>
                        <Link
                          href={href}
                          aria-current={isCurrent ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-2 py-2.5 text-base font-medium ${
                            isCurrent
                              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "text-black hover:bg-black/[.04] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                          }`}
                        >
                          <ToolIcon tool={tool.key} className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span className="flex-1">{tool.label}</span>
                          {locked && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                              Free account
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {!signedIn && (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-black/[.08] pt-4 dark:border-white/[.145]">
                <Link
                  href="/login"
                  className="flex h-11 items-center justify-center rounded-full border border-black/[.12] font-medium text-black dark:border-white/[.2] dark:text-zinc-50"
                >
                  Log in
                </Link>
                <Link
                  href="/guest"
                  className="flex h-11 items-center justify-center rounded-full border border-black/[.12] font-medium text-black dark:border-white/[.2] dark:text-zinc-50"
                >
                  Try as guest
                </Link>
              </div>
            )}
          </nav>
        </>
      )}
    </>
  );
}
