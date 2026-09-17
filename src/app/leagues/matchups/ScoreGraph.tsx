"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMatchupSnapshots, type MatchupSnapshot } from "./actions";

// A point delta between two consecutive snapshots at/above this is treated
// as a "big play" worth celebrating — tuned to catch most TDs without
// firing on routine yardage gains. Not a claim of knowing exactly what
// happened (this app only ever sees point totals, not play-by-play), just
// a fun, honestly-approximate heuristic.
const BIG_PLAY_THRESHOLD = 4;
const PLAY_DURATION_MS = 5000;
const OVERLAY_MS = 1300;

const VIEW_W = 600;
const VIEW_H = 240;
const PAD_X = 16;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;

type ChartEvent = { side: "mine" | "theirs"; playerId: string; fullName: string; delta: number; fraction: number };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function headshotUrl(playerId: string) {
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

// Value + marker position interpolated at a given 0..1 progress along the
// snapshot timeline — shared by the score readout and the moving dot.
function interpolateAt(snapshots: MatchupSnapshot[], times: number[], progress: number, key: "myTotal" | "opponentTotal") {
  const xMin = times[0];
  const xMax = times[times.length - 1];
  const targetT = lerp(xMin, xMax, progress);
  let i = 0;
  while (i < times.length - 1 && times[i + 1] < targetT) i++;
  const a = snapshots[i];
  const b = snapshots[Math.min(i + 1, snapshots.length - 1)];
  const span = times[Math.min(i + 1, times.length - 1)] - times[i];
  const localT = span > 0 ? (targetT - times[i]) / span : 0;
  return lerp(a[key], b[key], Math.max(0, Math.min(1, localT)));
}

function buildEvents(snapshots: MatchupSnapshot[], times: number[]): ChartEvent[] {
  const xMin = times[0];
  const xMax = times[times.length - 1];
  const span = xMax - xMin || 1;
  const events: ChartEvent[] = [];

  function diffSide(side: "mine" | "theirs", key: "myPlayers" | "opponentPlayers") {
    for (let i = 1; i < snapshots.length; i++) {
      const prevById = new Map(snapshots[i - 1][key].map((p) => [p.playerId, p]));
      for (const player of snapshots[i][key]) {
        const prev = prevById.get(player.playerId);
        const delta = player.points - (prev?.points ?? 0);
        if (delta >= BIG_PLAY_THRESHOLD) {
          events.push({
            side,
            playerId: player.playerId,
            fullName: player.fullName,
            delta,
            fraction: (times[i] - xMin) / span,
          });
        }
      }
    }
  }

  diffSide("mine", "myPlayers");
  diffSide("theirs", "opponentPlayers");
  return events.sort((a, b) => a.fraction - b.fraction);
}

export function ScoreGraph({
  leagueRowId,
  week,
  myTeamName,
  opponentTeamName,
  onClose,
}: {
  leagueRowId: string;
  week: number;
  myTeamName: string;
  opponentTeamName: string;
  onClose: () => void;
}) {
  const [snapshots, setSnapshots] = useState<MatchupSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Defaults to fully drawn (latest totals) so opening the graph shows
  // something useful immediately — Play resets to 0 and animates back up.
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [visibleEvents, setVisibleEvents] = useState<(ChartEvent & { key: number })[]>([]);
  const shownFractions = useRef<Set<number>>(new Set());
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const overlayKeyRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getMatchupSnapshots(leagueRowId, week).then((res) => {
      if (cancelled) return;
      if (res.error !== null) setError(res.error);
      else setSnapshots(res.snapshots);
    });
    return () => {
      cancelled = true;
    };
  }, [leagueRowId, week]);

  const times = useMemo(() => (snapshots ?? []).map((s) => new Date(s.capturedAt).getTime()), [snapshots]);
  const events = useMemo(
    () => (snapshots && snapshots.length >= 2 ? buildEvents(snapshots, times) : []),
    [snapshots, times]
  );

  useEffect(() => {
    if (!playing || !snapshots || snapshots.length < 2) return;

    function tick(now: number) {
      if (startRef.current == null) startRef.current = now;
      const elapsed = now - startRef.current;
      const next = Math.min(1, elapsed / PLAY_DURATION_MS);
      setProgress(next);

      events.forEach((ev, idx) => {
        if (ev.fraction <= next && !shownFractions.current.has(idx)) {
          shownFractions.current.add(idx);
          const key = overlayKeyRef.current++;
          setVisibleEvents((prev) => [...prev, { ...ev, key }]);
          setTimeout(() => {
            setVisibleEvents((prev) => prev.filter((e) => e.key !== key));
          }, OVERLAY_MS);
        }
      });

      if (next < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
        startRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function handlePlay() {
    shownFractions.current = new Set();
    setVisibleEvents([]);
    startRef.current = null;
    setProgress(0);
    setPlaying(true);
  }

  const hasEnoughData = snapshots != null && snapshots.length >= 2;

  const yMax = useMemo(() => {
    if (!snapshots) return 10;
    const max = Math.max(1, ...snapshots.flatMap((s) => [s.myTotal, s.opponentTotal]));
    return max * 1.15;
  }, [snapshots]);

  function scaleX(t: number) {
    const xMin = times[0];
    const xMax = times[times.length - 1];
    const span = xMax - xMin || 1;
    return PAD_X + ((t - xMin) / span) * (VIEW_W - PAD_X * 2);
  }
  function scaleY(v: number) {
    return VIEW_H - PAD_BOTTOM - (v / yMax) * (VIEW_H - PAD_TOP - PAD_BOTTOM);
  }

  function pathFor(key: "myTotal" | "opponentTotal") {
    if (!snapshots) return "";
    return snapshots.map((s, i) => `${i === 0 ? "M" : "L"} ${scaleX(times[i]).toFixed(1)} ${scaleY(s[key]).toFixed(1)}`).join(" ");
  }

  const myPathRef = useRef<SVGPathElement | null>(null);
  const oppPathRef = useRef<SVGPathElement | null>(null);
  const [pathLengths, setPathLengths] = useState<{ mine: number; theirs: number }>({ mine: 0, theirs: 0 });

  useEffect(() => {
    if (!hasEnoughData) return;
    setPathLengths({
      mine: myPathRef.current?.getTotalLength() ?? 0,
      theirs: oppPathRef.current?.getTotalLength() ?? 0,
    });
  }, [hasEnoughData, snapshots]);

  const myNow = hasEnoughData ? interpolateAt(snapshots!, times, progress, "myTotal") : 0;
  const oppNow = hasEnoughData ? interpolateAt(snapshots!, times, progress, "opponentTotal") : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="font-medium text-black dark:text-zinc-50">
            {myTeamName} vs {opponentTeamName}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            ✕
          </button>
        </div>

        {error && <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>}

        {!error && snapshots === null && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        )}

        {!error && snapshots !== null && !hasEnoughData && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Still collecting data for this matchup — check back once the game gets going. The graph fills in from
            whenever you first watch a matchup live, so leaving this tab open during the game gives the fullest
            picture.
          </p>
        )}

        {hasEnoughData && (
          <>
            <div className="mb-2 flex items-center justify-center gap-3">
              <span className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {myNow.toFixed(1)}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-600">vs</span>
              <span className="text-xl font-semibold tabular-nums text-zinc-500 dark:text-zinc-300">
                {oppNow.toFixed(1)}
              </span>
            </div>

            <div className="relative">
              <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label="Score over time">
                <line
                  x1={PAD_X}
                  x2={VIEW_W - PAD_X}
                  y1={VIEW_H - PAD_BOTTOM}
                  y2={VIEW_H - PAD_BOTTOM}
                  className="stroke-black/[.08] dark:stroke-white/[.145]"
                  strokeWidth={1}
                />
                <path
                  ref={myPathRef}
                  d={pathFor("myTotal")}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={pathLengths.mine || undefined}
                  strokeDashoffset={pathLengths.mine ? pathLengths.mine * (1 - progress) : undefined}
                />
                <path
                  ref={oppPathRef}
                  d={pathFor("opponentTotal")}
                  fill="none"
                  stroke="#71717a"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={pathLengths.theirs || undefined}
                  strokeDashoffset={pathLengths.theirs ? pathLengths.theirs * (1 - progress) : undefined}
                />
                <circle
                  cx={scaleX(lerp(times[0], times[times.length - 1], progress))}
                  cy={scaleY(myNow)}
                  r={4}
                  fill="#10b981"
                />
                <circle
                  cx={scaleX(lerp(times[0], times[times.length - 1], progress))}
                  cy={scaleY(oppNow)}
                  r={4}
                  fill="#71717a"
                />
              </svg>

              {visibleEvents.map((ev) => {
                const evValue = interpolateAt(
                  snapshots!,
                  times,
                  ev.fraction,
                  ev.side === "mine" ? "myTotal" : "opponentTotal"
                );
                const evX = scaleX(lerp(times[0], times[times.length - 1], ev.fraction));
                const evY = scaleY(evValue);
                return (
                <div
                  key={ev.key}
                  className="animate-big-play-pop pointer-events-none absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1"
                  style={{
                    left: `${(evX / VIEW_W) * 100}%`,
                    top: `${(evY / VIEW_H) * 100}%`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={headshotUrl(ev.playerId)}
                    alt={ev.fullName}
                    className={`h-12 w-12 rounded-full border-2 object-cover shadow-lg ${ev.side === "mine" ? "border-emerald-500" : "border-zinc-400"}`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                  <span className="whitespace-nowrap rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-black">
                    {ev.fullName} +{ev.delta.toFixed(1)}
                  </span>
                </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-center">
              <button
                type="button"
                onClick={handlePlay}
                disabled={playing}
                className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {playing ? "Playing…" : "▶ Play"}
              </button>
            </div>

            <p className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-600">
              A sped-up replay of your recorded snapshots, not real time. Big-play callouts are a guess based on a
              player&apos;s point jump between snapshots — not confirmed play-by-play.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
