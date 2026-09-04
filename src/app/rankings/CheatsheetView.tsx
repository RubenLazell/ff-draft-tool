"use client";

import { useState } from "react";
import Link from "next/link";
import type { RankedPlayer, Format } from "@/lib/rankings";
import { loadGuestOrder, applyGuestOrder } from "@/lib/guestRankings";
import { GuestBanner } from "./GuestBanner";
import {
  getDeltaBucket,
  DELTA_TEXT_CLASSES,
  formatDelta,
  getInjuryBadge,
  POSITION_ORDER,
  POSITION_COLORS,
  FALLBACK_POSITION_COLOR,
} from "@/lib/playerDisplay";

// 30 rows/page, forced via a hard page-break rather than relying on
// whatever happens to fit — that's the only way to guarantee it exactly
// rather than approximately. Row height is sized conservatively (compact)
// so 30 of them plus the header comfortably clear one physical page; exact
// fit depends on the browser's print renderer, so this is a best-effort
// estimate — check a real print preview and it can be tuned from there.
const ROWS_PER_PAGE = 30;

type DisplayPlayer = RankedPlayer & { overallRank: number; positionRank: number };

export function CheatsheetView({
  players,
  formatLabel,
  guestMode = false,
  format,
}: {
  players: RankedPlayer[];
  formatLabel: string;
  guestMode?: boolean;
  format?: Format;
}) {
  const [top200Only, setTop200Only] = useState(false);
  // Same lazy-initializer pattern as RankingsBoard/CompareView — reads
  // localStorage once on the client's first render rather than in an
  // effect, since this page's data never changes shape after mount.
  const [effectivePlayers] = useState(() => {
    if (!guestMode || !format) return players;
    const order = loadGuestOrder(format);
    return order ? applyGuestOrder(players, order) : players;
  });

  const positionCounters: Record<string, number> = {};
  const withRanks: DisplayPlayer[] = effectivePlayers.map((p, i) => {
    positionCounters[p.position] = (positionCounters[p.position] ?? 0) + 1;
    return { ...p, overallRank: i + 1, positionRank: positionCounters[p.position] };
  });

  // Truncating just cuts the list rather than renumbering it — overallRank
  // and positionRank stay anchored to the full board, so "top 200" always
  // means the same 200 players regardless of this toggle.
  const visibleRanks = top200Only ? withRanks.slice(0, 200) : withRanks;

  // Legend only lists positions actually present in what's visible — if a
  // position is filtered out upstream (e.g. K/DEF skipped on the cheat
  // sheet) or truncated out by the top-200 cutoff, it shouldn't still show
  // up in the color key.
  const visiblePositionCounts: Record<string, number> = {};
  for (const p of visibleRanks) {
    visiblePositionCounts[p.position] = (visiblePositionCounts[p.position] ?? 0) + 1;
  }
  const positionsPresent = POSITION_ORDER.filter((pos) => visiblePositionCounts[pos] > 0);

  return (
    <div className="mx-auto max-w-4xl bg-zinc-50 px-3 py-4 sm:px-4 sm:py-8 dark:bg-black print:bg-white print:px-0 print:py-0">
      {/* Most browsers strip background colors by default when printing.
          This forces the position-color tints to actually appear in the
          printout instead of silently rendering as plain white rows. */}
      <style>{`
        @media print {
          * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
          @page { size: letter; margin: 0.5in; }
        }
      `}</style>

      {guestMode && (
        <div className="print:hidden">
          <GuestBanner />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={guestMode ? "/rankings/guest" : "/rankings"}
          className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Back to rankings
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTop200Only((v) => !v)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              top200Only
                ? "border-transparent bg-foreground text-background"
                : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
            }`}
          >
            {top200Only ? "Top 200 only" : "Show all"}
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Print
          </button>
        </div>
      </div>

      <h1 className="mb-1 text-2xl font-bold text-black dark:text-zinc-50 print:mb-0.5 print:text-lg">
        Draft Cheat Sheet — {formatLabel}
      </h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400 print:hidden">
        {visibleRanks.length} players
      </p>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 print:mb-1">
        {positionsPresent.map((pos) => (
          <span key={pos} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${POSITION_COLORS[pos].swatch}`} />
            {pos}
          </span>
        ))}
      </div>

      {/* This layout is print-first (fixed-width columns sized for a
          letter-size page), so on a narrow phone screen it scrolls
          horizontally instead of crushing columns illegibly. Printing
          always uses the page's physical width regardless of viewport, so
          the scroll wrapper is disabled for print rather than affecting it. */}
      <div className="overflow-x-auto print:overflow-visible">
        <div className="min-w-[560px] print:min-w-0">
          {chunk(visibleRanks, ROWS_PER_PAGE).map((pageRows, pageIndex, pages) => (
            <div
              key={pageIndex}
              className={`flex flex-col gap-1 print:gap-0 ${
                pageIndex < pages.length - 1 ? "print:break-after-page" : ""
              }`}
            >
              {pageRows.map((player) => (
                <CheatsheetRow key={player.playerId} player={player} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

function CheatsheetRow({ player }: { player: DisplayPlayer }) {
  const delta =
    player.consensusRank != null ? player.overallRank - player.consensusRank : null;
  const bucket = delta != null ? getDeltaBucket(delta) : "neutral";
  const injuryBadge = getInjuryBadge(player.injuryStatus);
  const posColor =
    POSITION_COLORS[player.position as (typeof POSITION_ORDER)[number]] ?? FALLBACK_POSITION_COLOR;

  return (
    <div
      className={`flex items-center gap-3 rounded border border-black/[.06] px-3 py-1.5 text-sm dark:border-white/[.08] ${posColor.bg} print:break-inside-avoid print:rounded-none print:border-x-0 print:border-t-0 print:px-1 print:py-0 print:text-xs print:leading-tight`}
    >
      <span className="w-10 shrink-0 font-medium text-zinc-500 dark:text-zinc-400">
        #{player.overallRank}
      </span>
      <span className="flex flex-1 items-center gap-2 font-medium text-black dark:text-zinc-50">
        {player.fullName}
        {injuryBadge && (
          <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${injuryBadge.className}`}>
            {injuryBadge.label}
          </span>
        )}
      </span>
      <span className={`w-14 shrink-0 font-semibold ${posColor.text}`}>
        {player.position}
        {player.positionRank}
      </span>
      <span className="w-10 shrink-0 text-zinc-500 dark:text-zinc-400">
        {player.team ?? "FA"}
      </span>
      <span className="w-16 shrink-0 text-zinc-500 dark:text-zinc-400">
        {player.byeWeek != null ? `Bye ${player.byeWeek}` : "—"}
      </span>
      <span className="w-20 shrink-0 text-zinc-500 dark:text-zinc-400">
        {player.consensusRank != null ? `ADP ${player.consensusRank.toFixed(1)}` : "—"}
      </span>
      {delta != null ? (
        <span
          className={`w-10 shrink-0 text-right font-semibold tabular-nums ${DELTA_TEXT_CLASSES[bucket]}`}
        >
          {formatDelta(delta)}
        </span>
      ) : (
        <span className="w-10 shrink-0" />
      )}
    </div>
  );
}
