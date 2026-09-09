"use client";

import { useState } from "react";
import type { RankedPlayer } from "@/lib/rankings";
import type { MatchupResult } from "@/lib/leagueImport";
import type { GameGroup, GamePlayerEntry } from "@/lib/matchupsByGame";
import { POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";
import { MatchupCard } from "./MatchupCard";

function positionColor(position: string) {
  return POSITION_COLORS[position as keyof typeof POSITION_COLORS] ?? FALLBACK_POSITION_COLOR;
}

const TABS = ["league", "game"] as const;
type Tab = (typeof TABS)[number];

function EntryRow({ entry }: { entry: GamePlayerEntry }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(entry.player.position).bg} ${positionColor(entry.player.position).text}`}
      >
        {entry.player.position}
      </span>
      <span className="min-w-0 truncate text-black dark:text-zinc-50">{entry.player.fullName}</span>
      <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">{entry.leagueName}</span>
    </div>
  );
}

// Defaults to starters only — bench players tucked behind a dropdown,
// same pattern as MatchupCard's roster lists.
function EntryColumn({ title, entries }: { title: string; entries: GamePlayerEntry[] }) {
  const starters = entries.filter((e) => e.isStarter);
  const bench = entries.filter((e) => !e.isStarter);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm italic text-zinc-400 dark:text-zinc-600">None</p>
      ) : (
        <>
          {starters.length === 0 ? (
            <p className="text-sm italic text-zinc-400 dark:text-zinc-600">No starters</p>
          ) : (
            starters.map((entry, i) => <EntryRow key={`${entry.player.playerId}-${i}`} entry={entry} />)
          )}
          {bench.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
                +{bench.length} bench
              </summary>
              <div className="mt-1 flex flex-col gap-1.5">
                {bench.map((entry, i) => (
                  <EntryRow key={`${entry.player.playerId}-${i}`} entry={entry} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

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

  // gameGroups is already sorted by kickoff time, so consecutive entries
  // sharing a slate are already contiguous — no separate sort needed.
  const slateGroups: { slate: string; games: GameGroup[] }[] = [];
  for (const group of gameGroups) {
    const last = slateGroups[slateGroups.length - 1];
    if (last && last.slate === group.game.slate) last.games.push(group);
    else slateGroups.push({ slate: group.game.slate, games: [group] });
  }

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
        <div className="flex flex-col gap-6">
          {scheduleError && <p className="text-sm text-red-600 dark:text-red-400">{scheduleError}</p>}
          {gameGroups.length === 0 && !scheduleError && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No games with your rostered players found this week.
            </p>
          )}
          {slateGroups.map(({ slate, games }) => (
            <div key={slate} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">{slate}</h2>
              <div className="flex flex-col gap-3">
                {games.map((group) => {
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
                        <EntryColumn title="Your players" entries={mine} />
                        <EntryColumn title="Opponents' players" entries={theirs} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
