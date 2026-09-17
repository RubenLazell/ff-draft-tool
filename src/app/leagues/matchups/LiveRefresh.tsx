"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 30_000;

// The first live-refresh pattern in this app — no existing SWR/React Query
// dependency to reuse, and this page's data fetch already lives entirely
// server-side, so a plain router.refresh() poll (skipped while the tab
// isn't visible) is the simplest fit. See src/lib/liveScoring.ts for what
// actually needs refreshing.
export function LiveRefresh() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1000);
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      className="shrink-0 rounded-full border border-black/[.08] px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
      disabled={refreshing}
    >
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  );
}
