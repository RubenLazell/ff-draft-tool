"use client";

import { useState, useTransition } from "react";
import { FORMATS, FORMAT_LABELS, type Format } from "@/lib/rankings";
import type { TeamResult } from "@/lib/leagueScoring";
import { previewLeague } from "../actions";
import { LeagueDetailView } from "../[id]/LeagueDetailView";

const CURRENT_SEASON = String(new Date().getFullYear());
const PLATFORMS = ["SLEEPER", "ESPN"] as const;
type Platform = (typeof PLATFORMS)[number];

type Submitted = { platform: Platform; leagueId: string; season: string; swid: string; espnS2: string };

export function GuestLeaguePreview() {
  const [platform, setPlatform] = useState<Platform>("SLEEPER");
  const [leagueId, setLeagueId] = useState("");
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [swid, setSwid] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [format, setFormat] = useState<Format>("PPR");
  const [preview, setPreview] = useState<{ leagueName: string; results: TeamResult[] } | null>(null);

  function runPreview(params: Submitted, f: Format) {
    setError(null);
    startTransition(async () => {
      const result = await previewLeague(params.platform, params.leagueId, f, params.season, params.swid, params.espnS2);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setSubmitted(params);
      setFormat(f);
      setPreview({ leagueName: result.leagueName, results: result.results });
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runPreview({ platform, leagueId, season, swid, espnS2 }, format);
  }

  function handleFormatChange(f: Format) {
    if (submitted) runPreview(submitted, f);
  }

  function handleReset() {
    setPreview(null);
    setSubmitted(null);
    setError(null);
  }

  if (preview) {
    return (
      <LeagueDetailView
        guestMode
        leagueName={preview.leagueName}
        results={preview.results}
        format={format}
        formats={FORMATS}
        formatLabels={FORMAT_LABELS}
        onFormatChange={handleFormatChange}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Preview a league
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            See any Sleeper or ESPN league&apos;s teams ranked using default consensus rankings —
            nothing is saved. Sign up to use your own rankings and keep leagues for next time.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <div className="flex gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
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
            <input
              type="text"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              placeholder={platform === "SLEEPER" ? "Sleeper league ID" : "ESPN league ID"}
              className="flex-1 rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
            />
            {platform === "ESPN" && (
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="Season"
                className="w-full rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 sm:w-24 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
              />
            )}
          </div>

          {platform === "ESPN" && (
            <div className="flex flex-col gap-2 rounded-md border border-black/[.08] p-3 dark:border-white/[.145]">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Only needed for a private league. In your browser, while logged into ESPN Fantasy:
                open DevTools → Application → Cookies → fantasy.espn.com, and copy the{" "}
                <code>SWID</code> and <code>espn_s2</code> values.
              </p>
              <input
                type="text"
                value={swid}
                onChange={(e) => setSwid(e.target.value)}
                placeholder="SWID (e.g. {ABC123...})"
                className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
              />
              <input
                type="text"
                value={espnS2}
                onChange={(e) => setEspnS2(e.target.value)}
                placeholder="espn_s2"
                className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={pending || !leagueId.trim()}
            className="flex h-10 shrink-0 items-center justify-center self-start rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            {pending ? "Loading…" : "Preview league"}
          </button>
        </form>
      </div>
    </div>
  );
}
