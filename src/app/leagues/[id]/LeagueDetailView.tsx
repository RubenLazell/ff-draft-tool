"use client";

import { useState } from "react";
import Link from "next/link";
import type { Format } from "@/lib/rankings";
import type { TeamResult } from "@/lib/leagueScoring";
import { UNRANKED_SLOT_TYPES } from "@/lib/leagueScoring";
import { ESPN_UNMATCHED_PREFIX } from "@/lib/espnMatching";
import { POSITION_ORDER, POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";
import { GuestBanner } from "@/app/rankings/GuestBanner";

function positionColor(position: string) {
  return POSITION_COLORS[position as keyof typeof POSITION_COLORS] ?? FALLBACK_POSITION_COLOR;
}

// Two ways to reach this view: a persisted league (leagueRowId, format
// switch navigates via Link to /leagues/[id]?format=), or a guest's
// stateless preview (onFormatChange, format switch re-runs the preview
// action with nothing to navigate to — see /leagues/guest).
type LeagueDetailViewProps = {
  leagueName: string;
  results: TeamResult[];
  format: Format;
  formats: readonly Format[];
  formatLabels: Record<Format, string>;
} & (
  | { leagueRowId: string; guestMode?: false; onFormatChange?: undefined; onReset?: undefined }
  | { leagueRowId?: undefined; guestMode: true; onFormatChange: (format: Format) => void; onReset: () => void }
);

export function LeagueDetailView(props: LeagueDetailViewProps) {
  const { leagueName, results, format, formats, formatLabels, guestMode } = props;
  const [expandedRosterId, setExpandedRosterId] = useState<number | null>(null);
  const maxScore = Math.max(1, ...results.map((t) => t.score));

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-2 py-4 sm:px-4 sm:py-8 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl">
        {guestMode && <GuestBanner />}
        {guestMode ? (
          <button
            type="button"
            onClick={props.onReset}
            className="mb-4 inline-block text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Search another league
          </button>
        ) : (
          <Link
            href="/leagues"
            className="mb-4 inline-block text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Back to leagues
          </Link>
        )}
        <h1 className="mb-1 text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">
          {leagueName}
        </h1>
        <p className="mb-4 text-sm text-zinc-600 sm:mb-6 dark:text-zinc-400">
          Teams ranked by Value Over Replacement — your rankings applied to each team&apos;s
          optimal starting lineup, plus a discounted bench. IDP/exotic slots aren&apos;t scored
          (no ranking data for them).
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {formats.map((f) =>
            guestMode ? (
              <button
                key={f}
                type="button"
                onClick={() => props.onFormatChange(f)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  format === f
                    ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                    : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
                }`}
              >
                {formatLabels[f]}
              </button>
            ) : (
              <Link
                key={f}
                href={`/leagues/${props.leagueRowId}?format=${f}`}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  format === f
                    ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                    : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
                }`}
              >
                {formatLabels[f]}
              </Link>
            )
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">Bar = strength, colors = where it comes from:</span>
          {POSITION_ORDER.map((pos) => (
            <span key={pos} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${positionColor(pos).swatch}`} />
              {pos}
            </span>
          ))}
        </div>

        <ol className="flex flex-col gap-2">
          {results.map((team, index) => {
            const expanded = expandedRosterId === team.rosterId;
            const barWidthPct = team.score > 0 ? Math.max(4, (team.score / maxScore) * 100) : 0;
            return (
              <li
                key={team.rosterId}
                className="rounded-lg border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950"
              >
                <button
                  type="button"
                  onClick={() => setExpandedRosterId(expanded ? null : team.rosterId)}
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left"
                >
                  <div className="flex items-center justify-between gap-3">
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
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="flex h-full rounded-full" style={{ width: `${barWidthPct}%` }}>
                      {POSITION_ORDER.map((pos) => {
                        const value = team.positionBreakdown[pos] ?? 0;
                        if (value <= 0 || team.score <= 0) return null;
                        const sharePct = (value / team.score) * 100;
                        return (
                          <div
                            key={pos}
                            className={positionColor(pos).swatch}
                            style={{ width: `${sharePct}%` }}
                            title={`${pos}: ${value.toFixed(1)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-black/[.08] px-4 py-3 dark:border-white/[.145]">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Starters
                    </p>
                    <div className="mb-3 flex flex-col gap-1">
                      {team.lineup.starters.map((slot, slotIndex) => (
                        <div key={slotIndex} className="flex items-center gap-2 text-sm">
                          <span className="w-16 shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                            {slot.slotType}
                          </span>
                          {slot.player ? (
                            <>
                              <span
                                className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(slot.player.position).bg} ${positionColor(slot.player.position).text}`}
                              >
                                {slot.player.position}
                                {slot.player.positionRank}
                              </span>
                              <span className="min-w-0 truncate text-black dark:text-zinc-50">
                                {slot.player.fullName}
                              </span>
                            </>
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
                            <div key={player.playerId} className="flex items-center gap-2 text-sm">
                              <span
                                className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(player.position).bg} ${positionColor(player.position).text}`}
                              >
                                {player.position}
                                {player.positionRank}
                              </span>
                              <span className="min-w-0 truncate text-black dark:text-zinc-50">
                                {player.fullName}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {team.unresolvedPlayerIds.length > 0 &&
                      (() => {
                        // ESPN entries carry a readable name (no shared id
                        // space with our players table, matched by name at
                        // import time); Sleeper's are opaque ids not worth
                        // showing raw, so those just get counted.
                        const unmatchedNames = team.unresolvedPlayerIds
                          .filter((id) => id.startsWith(ESPN_UNMATCHED_PREFIX))
                          .map((id) => id.slice(ESPN_UNMATCHED_PREFIX.length));
                        const opaqueCount = team.unresolvedPlayerIds.length - unmatchedNames.length;
                        return (
                          <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
                            {unmatchedNames.length > 0 &&
                              `Not found in your rankings: ${unmatchedNames.join(", ")}. `}
                            {opaqueCount > 0 &&
                              `${opaqueCount} player${opaqueCount === 1 ? "" : "s"} not found in your rankings.`}
                          </p>
                        );
                      })()}
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
