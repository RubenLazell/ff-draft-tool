"use client";

import { useMemo, useState } from "react";
import type { RankedPlayer } from "@/lib/rankings";
import { gradeForDelta, type TeamResult, type PositionRanked } from "@/lib/leagueScoring";
import {
  suggestTrades,
  TRADE_FINDER_POSITIONS,
  type TradeFinderPosition,
  type TradeSuggestion,
} from "@/lib/tradeSuggestions";
import { POSITION_COLORS, FALLBACK_POSITION_COLOR } from "@/lib/playerDisplay";
import { fullRoster, type TradePreset } from "./TradeCalculator";

function positionColor(position: string) {
  return POSITION_COLORS[position as keyof typeof POSITION_COLORS] ?? FALLBACK_POSITION_COLOR;
}

function formatDelta(delta: number): string {
  const rounded = delta.toFixed(1);
  return delta > 0 ? `+${rounded}` : rounded;
}

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "border-transparent bg-emerald-700 text-white"
      : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
  }`;

export function TradeFinder({
  results,
  rankings,
  league,
  myRosterId,
  onOpenInCalculator,
}: {
  results: TeamResult[];
  rankings: RankedPlayer[];
  league: { rosterPositions: string[]; totalRosters: number };
  myRosterId: number | null;
  onOpenInCalculator: (trade: TradePreset) => void;
}) {
  const [myTeamId, setMyTeamId] = useState<number | null>(myRosterId);
  const [position, setPosition] = useState<TradeFinderPosition | null>(null);
  const [allowTwoForOne, setAllowTwoForOne] = useState(true);

  const teams = useMemo(
    () =>
      results.map((t) => ({
        rosterId: t.rosterId,
        teamName: t.teamName,
        playerIds: fullRoster(t).map((p) => p.playerId),
      })),
    [results]
  );

  const suggestions = useMemo(() => {
    if (myTeamId == null || position == null) return null;
    return suggestTrades({
      league,
      rankings,
      teams,
      myRosterId: myTeamId,
      position,
      maxGive: allowTwoForOne ? 2 : 1,
    });
  }, [league, rankings, teams, myTeamId, position, allowTwoForOne]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-black/[.08] bg-white p-4 sm:p-5 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="font-semibold text-black dark:text-zinc-50">Find a trade</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pick the position you need. You&apos;ll get deals that make your team better by your own rankings and
          still look fair to the other manager by market ADP, so they&apos;re worth sending.
        </p>

        {myRosterId == null && (
          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Which team is yours?
            </legend>
            <div className="flex flex-wrap gap-2">
              {results.map((t) => (
                <button
                  key={t.rosterId}
                  type="button"
                  aria-pressed={myTeamId === t.rosterId}
                  onClick={() => setMyTeamId(t.rosterId)}
                  className={chipClass(myTeamId === t.rosterId)}
                >
                  {t.teamName}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            I want a
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            {TRADE_FINDER_POSITIONS.map((pos) => (
              <button
                key={pos}
                type="button"
                aria-pressed={position === pos}
                onClick={() => setPosition(pos)}
                className={`${chipClass(position === pos)} min-w-14`}
              >
                {pos}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={allowTwoForOne}
            onChange={(e) => setAllowTwoForOne(e.target.checked)}
            className="h-4 w-4 accent-emerald-700"
          />
          Include 2-for-1 deals (you send two players for one)
        </label>
      </div>

      {myTeamId == null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Pick your team above to get started.</p>
      ) : suggestions == null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Pick a position to see trade ideas.</p>
      ) : suggestions.length === 0 ? (
        <p role="status" className="rounded-2xl border border-dashed border-black/[.12] p-5 text-sm text-zinc-600 dark:border-white/[.2] dark:text-zinc-400">
          No deals found for a {position} that improve your team and still look fair to the other manager.{" "}
          {allowTwoForOne ? "Try a different position." : "Try including 2-for-1 deals, or a different position."}
        </p>
      ) : (
        <section aria-label={`${position} trade ideas`} className="flex flex-col gap-3">
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            {suggestions.length} {suggestions.length === 1 ? "idea" : "ideas"} for a {position}, best first.
          </p>
          <ol className="flex flex-col gap-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={`${s.partnerRosterId}:${s.get[0].playerId}`}
                suggestion={s}
                onOpen={() =>
                  onOpenInCalculator({
                    teamAId: myTeamId,
                    teamBId: s.partnerRosterId,
                    awayFromA: s.give.map((p) => p.playerId),
                    awayFromB: s.get.map((p) => p.playerId),
                  })
                }
              />
            ))}
          </ol>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            &ldquo;Your team&rdquo; is scored with your rankings. &ldquo;Their team&rdquo; is scored with market ADP,
            since that&apos;s closer to how the other manager values players. When a deal sends them more players
            than they send you, their weakest player is assumed to be dropped.
          </p>
        </section>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  onOpen,
}: {
  suggestion: TradeSuggestion;
  onOpen: () => void;
}) {
  const theirGrade = gradeForDelta(s.partnerMarketGain);
  const theirLabel = s.partnerMarketGain >= 0 ? "They gain too" : theirGrade.label;

  return (
    <li className="rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Trade with <span className="font-semibold text-black dark:text-zinc-50">{s.partnerTeamName}</span>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <PlayerGroup label="You give" players={s.give} />
        <span aria-hidden="true" className="hidden text-xl text-zinc-400 sm:block dark:text-zinc-600">
          ⇄
        </span>
        <PlayerGroup label="You get" players={s.get} highlight />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/[.06] pt-3 text-sm dark:border-white/[.08]">
        <span>
          <span className="text-zinc-500 dark:text-zinc-400">Your team: </span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatDelta(s.myGain)}</span>
        </span>
        <span>
          <span className="text-zinc-500 dark:text-zinc-400">Their team: </span>
          <span
            className={`font-semibold ${
              s.partnerMarketGain >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {formatDelta(s.partnerMarketGain)}
          </span>
          <span className="ml-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {theirLabel}
          </span>
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto rounded-full border border-black/[.12] px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          Open in calculator
        </button>
      </div>
    </li>
  );
}

function PlayerGroup({ label, players, highlight }: { label: string; players: PositionRanked[]; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl p-2.5 ${
        highlight ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-zinc-50 dark:bg-zinc-900"
      }`}
    >
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <ul className="flex flex-col gap-1.5">
        {players.map((p) => (
          <PlayerRow key={p.playerId} player={p} />
        ))}
      </ul>
    </div>
  );
}

function PlayerRow({ player }: { player: PositionRanked }) {
  const [imgError, setImgError] = useState(false);
  const color = positionColor(player.position);
  return (
    <li className="flex items-center gap-2">
      {!imgError ? (
        <img
          src={`https://sleepercdn.com/content/nfl/players/thumb/${player.playerId}.jpg`}
          alt=""
          onError={() => setImgError(true)}
          className="h-8 w-8 shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-800"
        />
      ) : (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${color.bg} ${color.text}`}>
          {player.position}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-black dark:text-zinc-50">{player.fullName}</span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${color.bg} ${color.text}`}>
        {player.position}
        {player.positionRank}
      </span>
    </li>
  );
}
