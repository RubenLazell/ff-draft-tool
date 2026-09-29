"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLeague, addEspnLeague } from "./actions";

const CURRENT_SEASON = String(new Date().getFullYear());
const PLATFORMS = ["SLEEPER", "ESPN"] as const;
type Platform = (typeof PLATFORMS)[number];

export function AddLeagueForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("SLEEPER");
  const [leagueId, setLeagueId] = useState("");
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [swid, setSwid] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        platform === "SLEEPER"
          ? await addLeague(leagueId)
          : await addEspnLeague(leagueId, season, swid, espnS2);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLeagueId("");
      setSwid("");
      setEspnS2("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div role="group" aria-label="Platform" className="flex gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={platform === p}
            onClick={() => setPlatform(p)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              platform === p
                ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
            }`}
          >
            {p === "SLEEPER" ? "Sleeper" : "ESPN"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {platform === "SLEEPER" ? "Sleeper league ID" : "ESPN league ID"}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            placeholder={platform === "SLEEPER" ? "e.g. 1180298412345678901" : "e.g. 12345678"}
            className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
          />
        </label>
        {platform === "ESPN" && (
          <label className="flex flex-col gap-1 sm:w-24">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Season</span>
            <input
              type="text"
              inputMode="numeric"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
            />
          </label>
        )}
      </div>

      {platform === "ESPN" && (
        <div className="flex flex-col gap-2 rounded-md border border-black/[.08] p-3 dark:border-white/[.145]">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Only needed for a private league. In your browser, while logged into ESPN Fantasy: open
            DevTools → Application → Cookies → fantasy.espn.com, and copy the <code>SWID</code> and{" "}
            <code>espn_s2</code> values.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">SWID</span>
            <input
              type="text"
              value={swid}
              onChange={(e) => setSwid(e.target.value)}
              placeholder="{ABC123...}"
              className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">espn_s2</span>
            <input
              type="text"
              value={espnS2}
              onChange={(e) => setEspnS2(e.target.value)}
              className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
            />
          </label>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending || !leagueId.trim()}
        className="flex h-10 shrink-0 items-center justify-center self-start rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {pending ? "Adding…" : "Add league"}
      </button>
    </form>
  );
}
