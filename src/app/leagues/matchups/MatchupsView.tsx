"use client";

import { useState } from "react";
import type { RankedPlayer } from "@/lib/rankings";
import type { MatchupResult } from "@/lib/leagueImport";
import type { GameGroup } from "@/lib/matchupsByGame";
import { POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";
import { MatchupCard } from "./MatchupCard";

function positionColor(position: string) {
  return POSITION_COLORS[position as keyof typeof POSITION_COLORS] ?? FALLBACK_POSITION_COLOR;
}

const TABS = ["league", "game"] as const;
type Tab = (typeof TABS)[number];

export function MatchupsView({
  cards,
  rankings,
  gameGroups,
  scheduleError,
}: {
  cards: { leagueRowId: string; leagueName: string; result: MatchupResult }[];
  rankings: RankedPlayer[];
  gameGroups: GameGroup[];
  scheduleError: string | null;
}) {
  const [tab, setTab] = useState<Tab>("league");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              tab === t
                ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
            }`}
          >
            {t === "league" ? "By League" : "By Game"}
          </button>
        ))}
      </div>

      {tab === "league" ? (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <MatchupCard key={card.leagueRowId} leagueName={card.leagueName} result={card.result} rankings={rankings} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {scheduleError && <p className="text-sm text-red-600 dark:text-red-400">{scheduleError}</p>}
          {gameGroups.length === 0 && !scheduleError && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No games with your rostered players found this week.
            </p>
          )}
          {gameGroups.map((group) => {
            const mine = group.entries.filter((e) => e.role === "mine");
            const theirs = group.entries.filter((e) => e.role === "opponent");
            const kickoff = new Date(group.game.kickoff);
            return (
              <div
                key={group.game.gameId}
                className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="font-medium text-black dark:text-zinc-50">{group.game.shortName}</p>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {kickoff.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Your players
                    </p>
                    {mine.length === 0 ? (
                      <p className="text-sm italic text-zinc-400 dark:text-zinc-600">None</p>
                    ) : (
                      mine.map((entry, i) => (
                        <div key={`${entry.player.playerId}-${i}`} className="flex items-center gap-2 text-sm">
                          <span
                            className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(entry.player.position).bg} ${positionColor(entry.player.position).text}`}
                          >
                            {entry.player.position}
                          </span>
                          <span className="min-w-0 truncate text-black dark:text-zinc-50">
                            {entry.player.fullName}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">
                            {entry.leagueName}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Opponents&apos; players
                    </p>
                    {theirs.length === 0 ? (
                      <p className="text-sm italic text-zinc-400 dark:text-zinc-600">None</p>
                    ) : (
                      theirs.map((entry, i) => (
                        <div key={`${entry.player.playerId}-${i}`} className="flex items-center gap-2 text-sm">
                          <span
                            className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(entry.player.position).bg} ${positionColor(entry.player.position).text}`}
                          >
                            {entry.player.position}
                          </span>
                          <span className="min-w-0 truncate text-black dark:text-zinc-50">
                            {entry.player.fullName}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">
                            {entry.leagueName}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
