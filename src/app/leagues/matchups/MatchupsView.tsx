"use client";

import { useMemo, useState } from "react";
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

function EntryRow({ entry, showLeague }: { entry: GamePlayerEntry; showLeague: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`shrink-0 rounded px-1 text-[10px] font-bold ${positionColor(entry.player.position).bg} ${positionColor(entry.player.position).text}`}
      >
        {entry.player.position}
      </span>
      <span className="min-w-0 truncate text-black dark:text-zinc-50">{entry.player.fullName}</span>
      {showLeague && (
        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">{entry.leagueName}</span>
      )}
    </div>
  );
}

// One side (mine or theirs) of one league's players within a game.
// Deliberately has no league header of its own — the caller renders one
// league block spanning both sides at once, so "your players" and
// "opponents' players" for that league land in the same row and stay
// aligned regardless of how many starters/bench each side has.
function LeagueSide({ entries }: { entries: GamePlayerEntry[] }) {
  const starters = entries.filter((e) => e.isStarter);
  const bench = entries.filter((e) => !e.isStarter);
  return (
    <div className="flex flex-col gap-1">
      {starters.length === 0 ? (
        <p className="text-sm italic text-zinc-400 dark:text-zinc-600">No starters</p>
      ) : (
        starters.map((entry, i) => <EntryRow key={`${entry.player.playerId}-${i}`} entry={entry} showLeague={false} />)
      )}
      {bench.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">+{bench.length} bench</summary>
          <div className="mt-1 flex flex-col gap-1">
            {bench.map((entry, i) => (
              <EntryRow key={`${entry.player.playerId}-${i}`} entry={entry} showLeague={false} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export type LeagueOrderEntry = {
  leagueRowId: string;
  leagueName: string;
  myTeamName: string;
  opponentTeamName: string;
};

// One game's full body: one row per league (in the same order as the
// Leagues filter pills) with both sides side by side, headed by the
// actual team names for that league (not a generic "opponents' players"
// label — a different game can mean a different opponent per league). A
// league label spans the row, and each side below it is independent, so
// leagues stay lined up between columns even when one side has more
// starters/bench than the other.
function GameBody({
  entries,
  leagueOrder,
}: {
  entries: GamePlayerEntry[];
  leagueOrder: LeagueOrderEntry[];
}) {
  const presentLeagueIds = new Set(entries.map((e) => e.leagueRowId));
  const leaguesInGame = leagueOrder.filter((l) => presentLeagueIds.has(l.leagueRowId));
  const multiLeague = leaguesInGame.length > 1;

  return (
    <div className="flex flex-col gap-4">
      {leaguesInGame.map(({ leagueRowId, leagueName, myTeamName, opponentTeamName }) => {
        const mine = entries.filter((e) => e.leagueRowId === leagueRowId && e.role === "mine");
        const theirs = entries.filter((e) => e.leagueRowId === leagueRowId && e.role === "opponent");
        return (
          <div key={leagueRowId}>
            {multiLeague && (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {leagueName}
              </p>
            )}
            <div className="mb-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <p className="truncate text-xs font-semibold text-zinc-500 dark:text-zinc-400">{myTeamName}</p>
              <p className="truncate text-xs font-semibold text-zinc-500 dark:text-zinc-400">{opponentTeamName}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LeagueSide entries={mine} />
              <LeagueSide entries={theirs} />
            </div>
          </div>
        );
      })}
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
  const [enabledLeagueIds, setEnabledLeagueIds] = useState<Set<string>>(
    () => new Set(cards.map((c) => c.leagueRowId))
  );

  function toggleLeague(leagueRowId: string) {
    setEnabledLeagueIds((prev) => {
      const next = new Set(prev);
      if (next.has(leagueRowId)) next.delete(leagueRowId);
      else next.add(leagueRowId);
      return next;
    });
  }

  const filteredCards = cards.filter((c) => enabledLeagueIds.has(c.leagueRowId));
  // Same order as the Leagues filter pills, so a game spanning multiple
  // leagues always lists them in one consistent order across every card.
  const leagueOrder: LeagueOrderEntry[] = cards
    .filter((c) => c.result.error === null && c.result.opponent)
    .map((c) => {
      const result = c.result as Extract<MatchupResult, { error: null }>;
      return {
        leagueRowId: c.leagueRowId,
        leagueName: c.leagueName,
        myTeamName: result.myTeam.teamName,
        opponentTeamName: result.opponent!.teamName,
      };
    });

  const filteredGameGroups = useMemo(() => {
    return gameGroups
      .map((group) => ({
        game: group.game,
        entries: group.entries.filter((e) => enabledLeagueIds.has(e.leagueRowId)),
      }))
      .filter((group) => group.entries.length > 0);
  }, [gameGroups, enabledLeagueIds]);

  // gameGroups (and filteredGameGroups, since filtering preserves order)
  // is already sorted by kickoff time, so consecutive entries sharing a
  // slate are already contiguous — no separate sort needed.
  const slateGroups: { slate: string; games: GameGroup[] }[] = [];
  for (const group of filteredGameGroups) {
    const last = slateGroups[slateGroups.length - 1];
    if (last && last.slate === group.game.slate) last.games.push(group);
    else slateGroups.push({ slate: group.game.slate, games: [group] });
  }

  return (
    <div className="flex flex-col gap-4">
      {cards.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Leagues:
          </span>
          {cards.map((c) => (
            <button
              key={c.leagueRowId}
              type="button"
              onClick={() => toggleLeague(c.leagueRowId)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                enabledLeagueIds.has(c.leagueRowId)
                  ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/[.08] text-zinc-400 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-500 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {c.leagueName}
            </button>
          ))}
        </div>
      )}

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
          {filteredCards.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No leagues selected.</p>
          ) : (
            filteredCards.map((card) => (
              <MatchupCard key={card.leagueRowId} leagueName={card.leagueName} result={card.result} rankings={rankings} />
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {scheduleError && <p className="text-sm text-red-600 dark:text-red-400">{scheduleError}</p>}
          {slateGroups.length === 0 && !scheduleError && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No games with your rostered players found this week.
            </p>
          )}
          {slateGroups.map(({ slate, games }) => (
            <div key={slate} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">{slate}</h2>
              <div className="flex flex-col gap-3">
                {games.map((group) => {
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
                      <GameBody entries={group.entries} leagueOrder={leagueOrder} />
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
