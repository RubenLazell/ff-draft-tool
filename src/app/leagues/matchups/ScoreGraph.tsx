"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMatchupSnapshots, type MatchupSnapshot } from "./actions";

// A point delta between two consecutive snapshots at/above this is treated
// as a "big play" worth celebrating — tuned to catch most TDs without
// firing on routine yardage gains. Not a claim of knowing exactly what
// happened (this app only ever sees point totals, not play-by-play), just
// a fun, honestly-approximate heuristic.
const BIG_PLAY_THRESHOLD = 4;
const PLAY_DURATION_MS = 9000; // slow, deliberate replay — not a race
const PAUSE_MS = 1800; // playback freezes on a big play so there's time to actually read it
const OVERLAY_MS = PAUSE_MS; // the celebration stays up for exactly the pause, then playback resumes as it fades

const VIEW_W = 600;
const VIEW_H = 240;
const PAD_LEFT = 34;
const PAD_RIGHT = 14;
const PAD_TOP = 20;
const PAD_BOTTOM = 34;

// Win-probability strip below the points chart — same width/horizontal
// padding as the chart above (so the shared time axis lines up visually),
// its own small vertical scale.
const WIN_VIEW_H = 64;
const WIN_PAD_TOP = 10;
const WIN_PAD_BOTTOM = 10;

// A matchup week spans Thursday through Monday — the real gaps between
// games (hours, sometimes days) would otherwise swallow almost all the
// chart's width, squeezing each actual game's action into a sliver. Any
// gap between consecutive snapshots beyond this cap only "counts" as this
// many ms of chart space (with a dashed marker + timestamp drawn at the
// cut, same idea as a stock chart skipping over a weekend) — real
// within-game gaps (normally ~30s, this app's poll interval) are always
// far under the cap and render at their true relative spacing.
const GAP_CAP_MS = 10 * 60_000;

type ChartEvent = {
  side: "mine" | "theirs";
  playerId: string;
  fullName: string;
  delta: number;
  fraction: number;
  description: string; // e.g. "TD catch", "42-yd run", or a generic point-jump fallback
  isTouchdown: boolean;
};
type GapMarker = { position: number; label: string };

// Guesses what actually happened from which raw stat category moved
// between two snapshots — not confirmed play-by-play (this app only ever
// sees point-in-time stat totals), just a best-effort label. Falls back to
// a generic point jump when raw stats aren't available (older snapshots)
// or nothing recognizable changed enough to describe.
const TOUCHDOWN_KEYS: [key: string, label: string][] = [
  ["rec_td", "TD catch"],
  ["rush_td", "TD run"],
  ["pass_td", "TD pass"],
];
const YARDAGE_KEYS: [key: string, label: string][] = [
  ["rec_yd", "catch"],
  ["rush_yd", "run"],
  ["pass_yd", "pass"],
];
const BIG_YARDAGE_THRESHOLD = 15;

function describePlay(
  prevRaw: Record<string, number> | undefined,
  currRaw: Record<string, number> | undefined,
  delta: number
): { description: string; isTouchdown: boolean } {
  const prev = prevRaw ?? {};
  const curr = currRaw ?? {};
  for (const [key, label] of TOUCHDOWN_KEYS) {
    if ((curr[key] ?? 0) - (prev[key] ?? 0) >= 1) return { description: label, isTouchdown: true };
  }
  let best: { label: string; gain: number } | null = null;
  for (const [key, label] of YARDAGE_KEYS) {
    const gain = (curr[key] ?? 0) - (prev[key] ?? 0);
    if (gain > 0 && (!best || gain > best.gain)) best = { label, gain };
  }
  if (best && best.gain >= BIG_YARDAGE_THRESHOLD) {
    return { description: `${Math.round(best.gain)}-yd ${best.label}`, isTouchdown: false };
  }
  return { description: `+${delta.toFixed(1)} pts`, isTouchdown: false };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function headshotUrl(playerId: string) {
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

function formatTick(ms: number) {
  return new Date(ms).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

// Compressed x-domain: each snapshot's "chart position" is the sum of the
// (capped) gaps before it, rather than its raw timestamp — see GAP_CAP_MS.
function buildPositions(times: number[]): number[] {
  const positions = [0];
  for (let i = 1; i < times.length; i++) {
    positions.push(positions[i - 1] + Math.min(times[i] - times[i - 1], GAP_CAP_MS));
  }
  return positions;
}

function buildGapMarkers(times: number[], positions: number[]): GapMarker[] {
  const markers: GapMarker[] = [];
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > GAP_CAP_MS) {
      markers.push({ position: positions[i], label: formatTick(times[i]) });
    }
  }
  return markers;
}

// Value interpolated at a given 0..1 progress along the compressed
// timeline (xs) — shared by the score readout, the win-probability
// readout, the moving dots, and big-play overlay positioning.
function interpolateSeries(xs: number[], values: number[], progress: number): number {
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const targetX = lerp(xMin, xMax, progress);
  let i = 0;
  while (i < xs.length - 1 && xs[i + 1] < targetX) i++;
  const a = values[i];
  const b = values[Math.min(i + 1, values.length - 1)];
  const span = xs[Math.min(i + 1, xs.length - 1)] - xs[i];
  const localT = span > 0 ? (targetX - xs[i]) / span : 0;
  return lerp(a, b, Math.max(0, Math.min(1, localT)));
}

function interpolateAt(snapshots: MatchupSnapshot[], xs: number[], progress: number, key: "myTotal" | "opponentTotal") {
  return interpolateSeries(xs, snapshots.map((s) => s[key]), progress);
}

function buildEvents(snapshots: MatchupSnapshot[], xs: number[]): ChartEvent[] {
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const span = xMax - xMin || 1;
  const events: ChartEvent[] = [];

  function diffSide(side: "mine" | "theirs", key: "myPlayers" | "opponentPlayers") {
    for (let i = 1; i < snapshots.length; i++) {
      const prevById = new Map(snapshots[i - 1][key].map((p) => [p.playerId, p]));
      for (const player of snapshots[i][key]) {
        const prev = prevById.get(player.playerId);
        const delta = player.points - (prev?.points ?? 0);
        if (delta >= BIG_PLAY_THRESHOLD) {
          const { description, isTouchdown } = describePlay(prev?.raw, player.raw, delta);
          events.push({
            side,
            playerId: player.playerId,
            fullName: player.fullName,
            delta,
            fraction: (xs[i] - xMin) / span,
            description,
            isTouchdown,
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
  const [paused, setPaused] = useState(false); // mid-replay freeze on a big play, distinct from the play/pause button
  const [visibleEvents, setVisibleEvents] = useState<(ChartEvent & { key: number })[]>([]);
  const shownFractions = useRef<Set<number>>(new Set());
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const pauseUntilRef = useRef<number | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);
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
  const positions = useMemo(() => buildPositions(times), [times]);
  const gapMarkers = useMemo(() => buildGapMarkers(times, positions), [times, positions]);
  const events = useMemo(
    () => (snapshots && snapshots.length >= 2 ? buildEvents(snapshots, positions) : []),
    [snapshots, positions]
  );

  useEffect(() => {
    if (!playing || !snapshots || snapshots.length < 2) return;

    function tick(now: number) {
      if (startRef.current == null) startRef.current = now;

      // Mid-replay freeze from a previous big play: hold progress exactly
      // where it was until the pause elapses, then shift startRef forward
      // by the paused duration so elapsed time doesn't include the freeze
      // — playback resumes smoothly from where it left off.
      if (pauseUntilRef.current != null) {
        if (now < pauseUntilRef.current) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        startRef.current += pauseUntilRef.current - pauseStartedAtRef.current!;
        pauseUntilRef.current = null;
        pauseStartedAtRef.current = null;
        setPaused(false);
      }

      const elapsed = now - startRef.current;
      const next = Math.min(1, elapsed / PLAY_DURATION_MS);
      setProgress(next);

      const newEventIdx = events.findIndex((ev, idx) => ev.fraction <= next && !shownFractions.current.has(idx));
      if (newEventIdx !== -1) {
        shownFractions.current.add(newEventIdx);
        const ev = events[newEventIdx];
        const key = overlayKeyRef.current++;
        setVisibleEvents((prev) => [...prev, { ...ev, key }]);
        setTimeout(() => {
          setVisibleEvents((prev) => prev.filter((e) => e.key !== key));
        }, OVERLAY_MS);

        pauseStartedAtRef.current = now;
        pauseUntilRef.current = now + PAUSE_MS;
        setPaused(true);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

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
    pauseUntilRef.current = null;
    pauseStartedAtRef.current = null;
    setPaused(false);
    setProgress(0);
    setPlaying(true);
  }

  const hasEnoughData = snapshots != null && snapshots.length >= 2;

  const yMax = useMemo(() => {
    if (!snapshots) return 10;
    const max = Math.max(1, ...snapshots.flatMap((s) => [s.myTotal, s.opponentTotal]));
    return max * 1.15;
  }, [snapshots]);

  function scaleX(x: number) {
    const xMin = positions[0];
    const xMax = positions[positions.length - 1];
    const span = xMax - xMin || 1;
    return PAD_LEFT + ((x - xMin) / span) * (VIEW_W - PAD_LEFT - PAD_RIGHT);
  }
  function scaleY(v: number) {
    return VIEW_H - PAD_BOTTOM - (v / yMax) * (VIEW_H - PAD_TOP - PAD_BOTTOM);
  }

  function pathFor(key: "myTotal" | "opponentTotal") {
    if (!snapshots) return "";
    return snapshots
      .map((s, i) => `${i === 0 ? "M" : "L"} ${scaleX(positions[i]).toFixed(1)} ${scaleY(s[key]).toFixed(1)}`)
      .join(" ");
  }

  const yTicks = [0, yMax / 2, yMax];

  // Win-probability strip below the points chart — shares scaleX/positions
  // (same time domain) with its own small vertical scale, 0-100%. Snapshots
  // written before this was tracked have myWinProbability: null; treated
  // as 50/50 rather than breaking the line.
  function winScaleY(pct: number) {
    return WIN_VIEW_H - WIN_PAD_BOTTOM - (pct / 100) * (WIN_VIEW_H - WIN_PAD_TOP - WIN_PAD_BOTTOM);
  }
  const winProbSeries = useMemo(() => (snapshots ?? []).map((s) => s.myWinProbability ?? 0.5), [snapshots]);
  function winPathFor() {
    if (!snapshots) return "";
    return snapshots
      .map((_, i) => `${i === 0 ? "M" : "L"} ${scaleX(positions[i]).toFixed(1)} ${winScaleY(winProbSeries[i] * 100).toFixed(1)}`)
      .join(" ");
  }

  const myPathRef = useRef<SVGPathElement | null>(null);
  const oppPathRef = useRef<SVGPathElement | null>(null);
  const winPathRef = useRef<SVGPathElement | null>(null);
  const [pathLengths, setPathLengths] = useState<{ mine: number; theirs: number; win: number }>({
    mine: 0,
    theirs: 0,
    win: 0,
  });

  useEffect(() => {
    if (!hasEnoughData) return;
    setPathLengths({
      mine: myPathRef.current?.getTotalLength() ?? 0,
      theirs: oppPathRef.current?.getTotalLength() ?? 0,
      win: winPathRef.current?.getTotalLength() ?? 0,
    });
  }, [hasEnoughData, snapshots]);

  const myNow = hasEnoughData ? interpolateAt(snapshots!, positions, progress, "myTotal") : 0;
  const oppNow = hasEnoughData ? interpolateAt(snapshots!, positions, progress, "opponentTotal") : 0;
  const winProbNow = hasEnoughData ? interpolateSeries(positions, winProbSeries, progress) : 0.5;
  const playheadX = hasEnoughData ? scaleX(lerp(positions[0], positions[positions.length - 1], progress)) : 0;

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
            <div className="mb-1 flex items-center justify-center gap-3">
              <span className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {myNow.toFixed(1)}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-600">vs</span>
              <span className="text-xl font-semibold tabular-nums text-zinc-500 dark:text-zinc-300">
                {oppNow.toFixed(1)}
              </span>
            </div>
            <p className="mb-2 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {winProbNow >= 0.5
                ? `You: ${Math.round(winProbNow * 100)}% to win`
                : `Opponent: ${Math.round((1 - winProbNow) * 100)}% to win`}
            </p>

            <div className="relative">
              <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label="Score over time">
                {/* y-axis gridlines + point labels */}
                {yTicks.map((v) => (
                  <g key={v}>
                    <line
                      x1={PAD_LEFT}
                      x2={VIEW_W - PAD_RIGHT}
                      y1={scaleY(v)}
                      y2={scaleY(v)}
                      className="stroke-black/[.06] dark:stroke-white/[.1]"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_LEFT - 6}
                      y={scaleY(v)}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="fill-zinc-400 text-[9px] dark:fill-zinc-600"
                    >
                      {v.toFixed(0)}
                    </text>
                  </g>
                ))}

                {/* gap markers — a real-time skip (different day/slate), see GAP_CAP_MS */}
                {gapMarkers.map((m, i) => (
                  <g key={i}>
                    <line
                      x1={scaleX(m.position)}
                      x2={scaleX(m.position)}
                      y1={PAD_TOP}
                      y2={VIEW_H - PAD_BOTTOM}
                      className="stroke-black/[.15] dark:stroke-white/[.2]"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <text
                      x={scaleX(m.position)}
                      y={VIEW_H - PAD_BOTTOM + 12}
                      textAnchor="middle"
                      className="fill-zinc-400 text-[9px] dark:fill-zinc-600"
                    >
                      {m.label}
                    </text>
                  </g>
                ))}

                {/* start/end time labels */}
                <text
                  x={scaleX(positions[0])}
                  y={VIEW_H - PAD_BOTTOM + 12}
                  textAnchor="start"
                  className="fill-zinc-400 text-[9px] dark:fill-zinc-600"
                >
                  {formatTick(times[0])}
                </text>
                <text
                  x={scaleX(positions[positions.length - 1])}
                  y={VIEW_H - PAD_BOTTOM + 12}
                  textAnchor="end"
                  className="fill-zinc-400 text-[9px] dark:fill-zinc-600"
                >
                  {formatTick(times[times.length - 1])}
                </text>

                <line
                  x1={PAD_LEFT}
                  x2={VIEW_W - PAD_RIGHT}
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
                <circle cx={playheadX} cy={scaleY(myNow)} r={paused ? 5.5 : 4} fill="#10b981" className="transition-[r] duration-300" />
                <circle cx={playheadX} cy={scaleY(oppNow)} r={paused ? 5.5 : 4} fill="#71717a" className="transition-[r] duration-300" />
              </svg>

              {/* Spotlight — dims the chart itself while a big play is on screen, drawing focus to the callout. */}
              <div
                className={`pointer-events-none absolute inset-0 rounded-md bg-black transition-opacity duration-300 ${paused ? "opacity-10 dark:opacity-40" : "opacity-0"}`}
              />

              {visibleEvents.map((ev) => {
                const evValue = interpolateAt(
                  snapshots!,
                  positions,
                  ev.fraction,
                  ev.side === "mine" ? "myTotal" : "opponentTotal"
                );
                const evX = scaleX(lerp(positions[0], positions[positions.length - 1], ev.fraction));
                const evY = scaleY(evValue);
                return (
                <div
                  key={ev.key}
                  className="animate-big-play-pop pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5"
                  style={{
                    left: `${(evX / VIEW_W) * 100}%`,
                    top: `${(evY / VIEW_H) * 100}%`,
                  }}
                >
                  <span
                    className={`text-xs font-extrabold tracking-wide uppercase drop-shadow-sm ${
                      ev.isTouchdown ? "text-amber-500" : ev.side === "mine" ? "text-emerald-500" : "text-zinc-500"
                    }`}
                  >
                    {ev.isTouchdown ? "🏈 Touchdown!" : "💥 Big play!"}
                  </span>
                  <div className="relative">
                    <div
                      className={`animate-glow-pulse absolute inset-0 rounded-full blur-md ${ev.isTouchdown ? "bg-amber-400" : ev.side === "mine" ? "bg-emerald-400" : "bg-zinc-400"}`}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={headshotUrl(ev.playerId)}
                      alt={ev.fullName}
                      className={`relative h-16 w-16 rounded-full border-2 object-cover shadow-lg ${ev.side === "mine" ? "border-emerald-500" : "border-zinc-400"}`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = "hidden";
                      }}
                    />
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold text-black dark:text-zinc-50">
                    {ev.fullName}
                  </span>
                  <span className="whitespace-nowrap rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-black">
                    {ev.description} · +{ev.delta.toFixed(1)}
                  </span>
                </div>
                );
              })}
            </div>

            <div className="mt-3">
              <p className="mb-1 text-[10px] font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-600">
                Win probability
              </p>
              <svg viewBox={`0 0 ${VIEW_W} ${WIN_VIEW_H}`} className="w-full" role="img" aria-label="Win probability over time">
                <line
                  x1={PAD_LEFT}
                  x2={VIEW_W - PAD_RIGHT}
                  y1={winScaleY(50)}
                  y2={winScaleY(50)}
                  className="stroke-black/[.1] dark:stroke-white/[.15]"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {[0, 50, 100].map((v) => (
                  <text
                    key={v}
                    x={PAD_LEFT - 6}
                    y={winScaleY(v)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-zinc-400 text-[9px] dark:fill-zinc-600"
                  >
                    {v}%
                  </text>
                ))}
                <path
                  ref={winPathRef}
                  d={winPathFor()}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={pathLengths.win || undefined}
                  strokeDashoffset={pathLengths.win ? pathLengths.win * (1 - progress) : undefined}
                />
                <circle cx={playheadX} cy={winScaleY(winProbNow * 100)} r={paused ? 4.5 : 3.5} fill="#6366f1" className="transition-[r] duration-300" />
              </svg>
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
              A sped-up replay of your recorded snapshots, not real time — it pauses briefly on every big play.
              Descriptions are a best guess from which stat moved between snapshots, not confirmed play-by-play.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
