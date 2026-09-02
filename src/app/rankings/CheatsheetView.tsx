"use client";

import Link from "next/link";
import type { RankedPlayer } from "@/lib/rankings";
import { getDeltaBucket, DELTA_TEXT_CLASSES, formatDelta, getInjuryBadge } from "@/lib/playerDisplay";

// Categorical color-by-position, not by ADP delta (that's the interactive
// board's scheme) — fixed hue order, never reassigned, same rule already
// applied to this app's diverging ADP scale. Position text is always shown
// too, so color is never the only signal — matters doubly here since some
// people will print this in black & white.
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;

const POSITION_COLORS: Record<(typeof POSITION_ORDER)[number], { bg: string; text: string; swatch: string }> = {
  QB: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", swatch: "bg-blue-500" },
  RB: { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", swatch: "bg-orange-500" },
  WR: { bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-400", swatch: "bg-teal-500" },
  TE: { bg: "bg-yellow-50 dark:bg-yellow-950/40", text: "text-yellow-800 dark:text-yellow-400", swatch: "bg-yellow-500" },
  K: { bg: "bg-pink-50 dark:bg-pink-950/40", text: "text-pink-700 dark:text-pink-400", swatch: "bg-pink-500" },
  DEF: { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", swatch: "bg-green-500" },
};

const FALLBACK_COLOR = {
  bg: "bg-zinc-50 dark:bg-zinc-900",
  text: "text-zinc-700 dark:text-zinc-300",
  swatch: "bg-zinc-400",
};

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
}: {
  players: RankedPlayer[];
  formatLabel: string;
}) {
  const positionCounters: Record<string, number> = {};
  const withRanks: DisplayPlayer[] = players.map((p, i) => {
    positionCounters[p.position] = (positionCounters[p.position] ?? 0) + 1;
    return { ...p, overallRank: i + 1, positionRank: positionCounters[p.position] };
  });

  // Legend only lists positions actually present — if a position is
  // filtered out upstream (e.g. K/DEF skipped on the cheat sheet), it
  // shouldn't still show up in the color key.
  const positionsPresent = POSITION_ORDER.filter((pos) => positionCounters[pos] > 0);

  return (
    <div className="mx-auto max-w-4xl bg-zinc-50 px-4 py-8 dark:bg-black print:bg-white print:px-0 print:py-0">
      {/* Most browsers strip background colors by default when printing.
          This forces the position-color tints to actually appear in the
          printout instead of silently rendering as plain white rows. */}
      <style>{`
        @media print {
          * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
          @page { size: letter; margin: 0.5in; }
        }
      `}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/rankings"
          className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Back to rankings
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Print
        </button>
      </div>

      <h1 className="mb-1 text-2xl font-bold text-black dark:text-zinc-50 print:mb-0.5 print:text-lg">
        Draft Cheat Sheet — {formatLabel}
      </h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400 print:hidden">
        {players.length} players
      </p>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 print:mb-1">
        {positionsPresent.map((pos) => (
          <span key={pos} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${POSITION_COLORS[pos].swatch}`} />
            {pos}
          </span>
        ))}
      </div>

      {chunk(withRanks, ROWS_PER_PAGE).map((pageRows, pageIndex, pages) => (
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
    POSITION_COLORS[player.position as (typeof POSITION_ORDER)[number]] ?? FALLBACK_COLOR;

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
