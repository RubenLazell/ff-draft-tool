// Replay pacing for the matchup score graph, driven by the real NFL slate
// structure rather than wall-clock time. Each broadcast slate (Thursday
// night, Sunday 1pm, Sunday late, SNF, MNF) gets a fixed share of the
// replay that grows with how many games are in it — more going on, more
// time to watch it unfold — spread linearly across whatever snapshot data
// falls inside it. The dead time between slates (hours, sometimes days)
// gets a small fixed budget no matter how long it really was, so the
// replay skips straight through.
//
// Positions are measured in replay milliseconds, so the final position IS
// the replay's total length. Tuned so a full real week (5 slates, ~16
// games) runs about a minute and a half — e.g. Week 2 2026: Thursday
// 10.8s, Sunday 1pm (8 games) 37.4s, Sunday late (5) 26s, SNF 10.8s.
//
// Pure functions, no React — imported by ScoreGraph.tsx and testable
// directly against real snapshot/schedule data.

export const SLATE_BASE_MS = 7000;
export const PER_GAME_MS = 3800;
export const GAP_BUDGET_MS = 1200;
// A dead stretch shorter than this gets proportionally less than the full
// gap budget (a 5-minute lull between snapshots isn't a "skip").
const GAP_FULL_AFTER_MS = 30 * 60_000;
// No real end time in the schedule data; a generous single-game length.
// Caps each slate's window so e.g. Thursday night doesn't absorb the whole
// two-day gap until Sunday as if it were live time.
const SLATE_DURATION_MS = 4.5 * 60 * 60_000;
const MIN_PLAY_DURATION_MS = 4000;

// Fallback only — if the week's schedule can't be loaded, pace on
// wall-clock time with long gaps capped, over a fixed total length.
const FALLBACK_GAP_CAP_MS = 10 * 60_000;
const FALLBACK_PLAY_DURATION_MS = 9000;

export type SlateGame = { slate: string; kickoff: string };
export type SlateWindow = {
  label: string;
  start: number;
  end: number;
  gameCount: number;
  budgetMs: number;
  dataSpan: number; // real time inside this window actually covered by snapshots
};
export type SlateMarker = { position: number; label: string };

// One window per real broadcast slate that has snapshot data inside it — a
// slate nobody watched (no snapshots) gets no replay time at all.
export function buildSlateWindows(games: SlateGame[], times: number[]): SlateWindow[] {
  if (times.length === 0) return [];
  const bySlate = new Map<string, { start: number; count: number }>();
  for (const g of games) {
    const t = new Date(g.kickoff).getTime();
    const existing = bySlate.get(g.slate);
    if (!existing) bySlate.set(g.slate, { start: t, count: 1 });
    else {
      existing.count += 1;
      existing.start = Math.min(existing.start, t);
    }
  }
  const sorted = [...bySlate.entries()]
    .map(([label, { start, count }]) => ({ label, start, count }))
    .sort((a, b) => a.start - b.start);
  const first = times[0];
  const last = times[times.length - 1];
  return sorted
    .map((w, i) => {
      const end = Math.min(i + 1 < sorted.length ? sorted[i + 1].start : Infinity, w.start + SLATE_DURATION_MS);
      return {
        label: w.label,
        start: w.start,
        end,
        gameCount: w.count,
        budgetMs: SLATE_BASE_MS + w.count * PER_GAME_MS,
        dataSpan: Math.max(0, Math.min(end, last) - Math.max(w.start, first)),
      };
    })
    .filter((w) => w.dataSpan > 0);
}

// Replay position (in replay ms) of a real timestamp, integrated from the
// first snapshot. Walks the windows in order: each dead stretch between
// them contributes at most GAP_BUDGET_MS however long it really was; time
// inside a slate contributes its share of that slate's budget. A gap
// between two snapshots that crosses a slate boundary (common — checking
// in before kickoff, then again mid-game) is split correctly because the
// walk is over real time, not over snapshot pairs.
export function timeToPosition(t: number, from: number, windows: SlateWindow[]): number {
  if (t <= from) return 0;
  const deadWeight = (ms: number) => (Math.min(ms, GAP_FULL_AFTER_MS) / GAP_FULL_AFTER_MS) * GAP_BUDGET_MS;
  let pos = 0;
  let cursor = from;
  for (const w of windows) {
    if (cursor >= t) break;
    if (w.end <= cursor) continue;
    const deadEnd = Math.min(w.start, t);
    if (deadEnd > cursor) {
      pos += deadWeight(deadEnd - cursor);
      cursor = deadEnd;
    }
    const liveEnd = Math.min(w.end, t);
    if (liveEnd > cursor) {
      pos += ((liveEnd - cursor) / w.dataSpan) * w.budgetMs;
      cursor = liveEnd;
    }
  }
  if (t > cursor) pos += deadWeight(t - cursor);
  return pos;
}

export function buildPositions(times: number[], windows: SlateWindow[]): number[] {
  if (windows.length > 0) return times.map((t) => timeToPosition(t, times[0], windows));
  const positions = [0];
  for (let i = 1; i < times.length; i++) {
    positions.push(positions[i - 1] + Math.min(times[i] - times[i - 1], FALLBACK_GAP_CAP_MS));
  }
  return positions;
}

export function playDurationMs(positions: number[], windows: SlateWindow[]): number {
  if (windows.length === 0) return FALLBACK_PLAY_DURATION_MS;
  return Math.max(MIN_PLAY_DURATION_MS, positions[positions.length - 1] ?? 0);
}

// Short axis label for a slate's kickoff, e.g. "Sun 1p" — always Eastern,
// same convention as every other kickoff-time display in this app.
export function formatSlateTick(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: true,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("hour")}${get("dayPeriod").charAt(0).toLowerCase()}`;
}

export function buildSlateMarkers(windows: SlateWindow[], times: number[]): SlateMarker[] {
  if (times.length === 0) return [];
  return windows.map((w) => ({
    position: timeToPosition(Math.max(w.start, times[0]), times[0], windows),
    label: formatSlateTick(w.start),
  }));
}
