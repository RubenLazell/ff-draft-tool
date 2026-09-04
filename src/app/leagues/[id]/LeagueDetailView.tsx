"use client";

import { useState } from "react";
import Link from "next/link";
import type { Format } from "@/lib/rankings";
import type { TeamResult } from "@/lib/leagueScoring";
import { UNRANKED_SLOT_TYPES } from "@/lib/leagueScoring";

export function LeagueDetailView({
  leagueRowId,
  leagueName,
  results,
  format,
  formats,
  formatLabels,
}: {
  leagueRowId: string;
  leagueName: string;
  results: TeamResult[];
  format: Format;
  formats: readonly Format[];
  formatLabels: Record<Format, string>;
}) {
  const [expandedRosterId, setExpandedRosterId] = useState<number | null>(null);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/leagues"
          className="mb-4 inline-block text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Back to leagues
        </Link>
        <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">
          {leagueName}
        </h1>
        <p className="mb-4 text-sm text-zinc-600 sm:mb-6 dark:text-zinc-400">
          Teams ranked by Value Over Replacement — your rankings applied to each team&apos;s
          optimal starting lineup, plus a discounted bench. IDP/exotic slots aren&apos;t scored
          (no ranking data for them).
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {formats.map((f) => (
            <Link
              key={f}
              href={`/leagues/${leagueRowId}?format=${f}`}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                format === f
                  ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {formatLabels[f]}
            </Link>
          ))}
        </div>

        <ol className="flex flex-col gap-2">
          {results.map((team, index) => {
            const expanded = expandedRosterId === team.rosterId;
            return (
              <li
                key={team.rosterId}
                className="rounded-lg border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950"
              >
                <button
                  type="button"
                  onClick={() => setExpandedRosterId(expanded ? null : team.rosterId)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-6 shrink-0 text-sm font-semibold text-zinc-400 dark:text-zinc-500">
                      #{index + 1}
                    </span>
                    <span className="min-w-0 truncate font-medium text-black dark:text-zinc-50">
                      {team.teamName}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {team.score.toFixed(1)}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500">{expanded ? "▾" : "▸"}</span>
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-black/[.08] px-4 py-3 dark:border-white/[.145]">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Starters
                    </p>
                    <div className="mb-3 flex flex-col gap-1">
                      {team.lineup.starters.map((slot, slotIndex) => (
                        <div
                          key={slotIndex}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="w-16 shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                            {slot.slotType}
                          </span>
                          {slot.player ? (
                            <span className="min-w-0 truncate text-black dark:text-zinc-50">
                              {slot.player.fullName}{" "}
                              <span className="text-zinc-500 dark:text-zinc-400">
                                ({slot.player.position}
                                {slot.player.positionRank})
                              </span>
                            </span>
                          ) : (
                            <span className="text-zinc-400 italic dark:text-zinc-500">
                              {UNRANKED_SLOT_TYPES.has(slot.slotType) ? "unranked" : "empty"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {team.lineup.bench.length > 0 && (
                      <>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Bench
                        </p>
                        <div className="mb-3 flex flex-col gap-1">
                          {team.lineup.bench.map((player) => (
                            <div key={player.playerId} className="text-sm text-black dark:text-zinc-50">
                              {player.fullName}{" "}
                              <span className="text-zinc-500 dark:text-zinc-400">
                                ({player.position}
                                {player.positionRank})
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {team.unresolvedPlayerIds.length > 0 && (
                      <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
                        {team.unresolvedPlayerIds.length} player
                        {team.unresolvedPlayerIds.length === 1 ? "" : "s"} not found in your rankings.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
