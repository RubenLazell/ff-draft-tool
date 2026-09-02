"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { updateRank, renormalizeRanks } from "./actions";
import { FORMATS, FORMAT_LABELS, type Format, type RankedPlayer } from "@/lib/rankings";
import {
  getDeltaBucket,
  DELTA_ROW_CLASSES,
  DELTA_TEXT_CLASSES,
  DELTA_SWATCH_CLASSES,
  DELTA_LEGEND,
  formatDelta,
  getInjuryBadge,
} from "@/lib/playerDisplay";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"] as const;
type PositionFilter = (typeof POSITIONS)[number];
type DisplayPlayer = RankedPlayer & { overallRank: number; positionRank: number };

const ROW_HEIGHT = 60;
const PANEL_WIDTH = 320;

type Insight = { strength: string; concern: string };
type InjuryOutlook = { summary: string; expectedReturn: string };
type Rect = { top: number; left: number; right: number; bottom: number };
type PanelState = {
  playerId: string;
  rect: Rect;
  insight: Insight | "loading" | "error";
  injuryOutlook: InjuryOutlook | "loading" | "error" | "none";
};

export function RankingsBoard({
  initialRankings,
  format,
  aiInsightsEnabled,
}: {
  initialRankings: RankedPlayer[];
  format: Format;
  aiInsightsEnabled: boolean;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState(initialRankings); // full order
  const [filter, setFilter] = useState<PositionFilter>("ALL");
  const [hideKDef, setHideKDef] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCheatsheetPicker, setShowCheatsheetPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const pendingScrollIdRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [panel, setPanel] = useState<PanelState | null>(null);
  const insightsCacheRef = useRef<Map<string, Insight | "error">>(new Map());
  const injuryOutlookCacheRef = useRef<Map<string, InjuryOutlook | "error">>(new Map());
  const requestIdRef = useRef(0);

  function fetchInsight(playerId: string, requestId: number) {
    fetch("/api/player-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    })
      .then((res) => res.json())
      .then((data: { strength?: string; concern?: string }) => {
        const result: Insight | "error" =
          data.strength && data.concern
            ? { strength: data.strength, concern: data.concern }
            : "error";
        insightsCacheRef.current.set(playerId, result);
        if (requestId === requestIdRef.current) {
          setPanel((p) => (p && p.playerId === playerId ? { ...p, insight: result } : p));
        }
      })
      .catch(() => {
        insightsCacheRef.current.set(playerId, "error");
        if (requestId === requestIdRef.current) {
          setPanel((p) => (p && p.playerId === playerId ? { ...p, insight: "error" } : p));
        }
      });
  }

  function fetchInjuryOutlook(playerId: string, requestId: number) {
    fetch("/api/injury-outlook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    })
      .then((res) => res.json())
      .then((data: { summary?: string; expectedReturn?: string }) => {
        const result: InjuryOutlook | "error" =
          data.summary && data.expectedReturn
            ? { summary: data.summary, expectedReturn: data.expectedReturn }
            : "error";
        injuryOutlookCacheRef.current.set(playerId, result);
        if (requestId === requestIdRef.current) {
          setPanel((p) =>
            p && p.playerId === playerId ? { ...p, injuryOutlook: result } : p
          );
        }
      })
      .catch(() => {
        injuryOutlookCacheRef.current.set(playerId, "error");
        if (requestId === requestIdRef.current) {
          setPanel((p) =>
            p && p.playerId === playerId ? { ...p, injuryOutlook: "error" } : p
          );
        }
      });
  }

  function handleToggleDetails(playerId: string, rect: Rect) {
    // Reads `panel` directly from this render's closure rather than via a
    // functional setState updater — safe here because this handler is
    // recreated fresh every render and invoked synchronously from the
    // click event, so it can't see a stale value.
    if (panel?.playerId === playerId) {
      setPanel(null); // toggle closed
      return;
    }

    const requestId = ++requestIdRef.current;
    const cachedInsight = insightsCacheRef.current.get(playerId);
    const hasInjury = withRanks.find((p) => p.playerId === playerId)?.injuryStatus != null;
    const cachedOutlook = injuryOutlookCacheRef.current.get(playerId);

    setPanel({
      playerId,
      rect,
      insight: cachedInsight ?? "loading",
      injuryOutlook: !hasInjury ? "none" : (cachedOutlook ?? "loading"),
    });

    if (!cachedInsight) fetchInsight(playerId, requestId);
    if (hasInjury && !cachedOutlook) fetchInjuryOutlook(playerId, requestId);
  }

  function handleClosePanel() {
    setPanel(null);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Overall rank = position in the full order. Position rank = position
  // within the same-position subset of that same order. Both are derived
  // from the single underlying `rank` field, not stored separately.
  const withRanks = useMemo<DisplayPlayer[]>(() => {
    const positionCounters: Record<string, number> = {};
    return players.map((p, i) => {
      positionCounters[p.position] = (positionCounters[p.position] ?? 0) + 1;
      return { ...p, overallRank: i + 1, positionRank: positionCounters[p.position] };
    });
  }, [players]);

  const visible =
    filter === "ALL"
      ? hideKDef
        ? withRanks.filter((p) => p.position !== "K" && p.position !== "DEF")
        : withRanks
      : withRanks.filter((p) => p.position === filter);

  const activePlayer = activeId
    ? withRanks.find((p) => p.playerId === activeId)
    : null;

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return withRanks.filter((p) => p.fullName.toLowerCase().includes(q)).slice(0, 8);
  }, [search, withRanks]);

  function handleSelectSearchResult(player: DisplayPlayer) {
    setSearch("");
    setFilter("ALL");
    setHideKDef(false);
    setHighlightId(player.playerId);
    pendingScrollIdRef.current = player.playerId;
  }

  // Switching the filter to "ALL" (so the searched player is guaranteed to
  // be in `visible`) happens in the same tick as setting the pending scroll
  // target, so `visible` may not include it yet on this render — this
  // effect just re-checks each time `visible` changes until the index is
  // found, then scrolls and clears the pending target.
  useEffect(() => {
    const targetId = pendingScrollIdRef.current;
    if (!targetId) return;
    const idx = visible.findIndex((p) => p.playerId === targetId);
    if (idx === -1) return;
    virtualizer.scrollToIndex(idx, { align: "center" });
    pendingScrollIdRef.current = null;
  }, [visible, virtualizer]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setPanel(null);
  }

  // Shared by drag-end reordering and manual rank entry: `sourceList` gives
  // the order to resolve `movedId`'s neighbors at `newIndex` from (the
  // filtered `visible` list for a drag, since that's what's on screen; the
  // full `players` list for a typed rank, since the number shown next to
  // each player is its overall rank across the whole board regardless of
  // position filter) — the resulting fractional rank is then applied to the
  // full `players` state either way.
  function moveAndPersist(sourceList: RankedPlayer[], movedId: string, newIndex: number) {
    const oldIndex = sourceList.findIndex((p) => p.playerId === movedId);
    if (oldIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(sourceList, oldIndex, newIndex);
    const movedPos = reordered.findIndex((p) => p.playerId === movedId);
    const prevNeighbor = reordered[movedPos - 1];
    const nextNeighbor = reordered[movedPos + 1];

    const newRank = computeMidpointRank(prevNeighbor?.rank, nextNeighbor?.rank);
    const collided =
      (prevNeighbor && newRank === prevNeighbor.rank) ||
      (nextNeighbor && newRank === nextNeighbor.rank);

    const previousPlayers = players; // for rollback
    const nextPlayers = players
      .map((p) => (p.playerId === movedId ? { ...p, rank: newRank } : p))
      .sort((a, b) => a.rank - b.rank);
    setPlayers(nextPlayers); // optimistic update

    startTransition(async () => {
      if (collided) {
        // Fractional rank exhausted between these two neighbors (should be
        // effectively unreachable at this scale) — renormalize instead.
        const result = await renormalizeRanks(
          nextPlayers.map((p) => p.playerId),
          format
        );
        if (result.error) setPlayers(previousPlayers);
        return;
      }
      const result = await updateRank(movedId, newRank, format);
      if (result.error) setPlayers(previousPlayers); // rollback on failure
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const visibleIds = visible.map((p) => p.playerId);
    const newIndex = visibleIds.indexOf(String(over.id));
    moveAndPersist(visible, String(active.id), newIndex);
  }

  function handleSetRank(playerId: string, rawTargetRank: number) {
    const targetIndex =
      Math.min(Math.max(Math.round(rawTargetRank), 1), players.length) - 1;
    moveAndPersist(players, playerId, targetIndex);
  }

  function handleRefresh() {
    setRefreshing(true);
    router.push(`/rankings?format=${format}&t=${Date.now()}`);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <Link
              key={f}
              href={`/rankings?format=${f}`}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                format === f
                  ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {FORMAT_LABELS[f]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowCheatsheetPicker(true)}
            className="rounded-full border border-black/[.08] px-3 py-1 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
          >
            Create printable draft cheatsheet
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-full border border-black/[.08] px-3 py-1 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {showCheatsheetPicker && (
        <CheatsheetFormatPicker onClose={() => setShowCheatsheetPicker(false)} />
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setFilter(pos)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              filter === pos
                ? "border-transparent bg-foreground text-background"
                : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
            }`}
          >
            {pos}
          </button>
        ))}
        {filter === "ALL" && (
          <button
            onClick={() => setHideKDef((v) => !v)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              hideKDef
                ? "border-transparent bg-foreground text-background"
                : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
            }`}
          >
            {hideKDef ? "K/DEF hidden" : "Hide K/DEF"}
          </button>
        )}
      </div>

      <div className="relative mb-4 max-w-xs">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your rankings…"
          className="w-full rounded-full border border-black/[.08] bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/20 dark:border-white/[.145] dark:bg-black dark:text-zinc-50 dark:focus:border-white/30"
        />
        {(searchResults.length > 0 || search.trim()) && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
            {searchResults.length > 0 ? (
              searchResults.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => handleSelectSearchResult(p)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/10"
                >
                  <span className="font-medium text-black dark:text-zinc-50">{p.fullName}</span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    #{p.overallRank} · {p.position}
                    {p.positionRank} · {p.team ?? "FA"}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                No players match &ldquo;{search.trim()}&rdquo;.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium">vs. ADP:</span>
        {DELTA_LEGEND.map(({ bucket, label }) => (
          <span key={bucket} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${DELTA_SWATCH_CLASSES[bucket]}`} />
            {label}
          </span>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visible.map((p) => p.playerId)}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={scrollRef}
            className="max-h-[70vh] overflow-y-auto rounded-lg border border-black/[.08] dark:border-white/[.145]"
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const player = visible[virtualRow.index];
                return (
                  <div
                    key={player.playerId}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <SortableRow
                      player={player}
                      onToggleDetails={aiInsightsEnabled ? handleToggleDetails : undefined}
                      onSetRank={handleSetRank}
                      highlighted={player.playerId === highlightId}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </SortableContext>
        <DragOverlay>
          {activePlayer ? (
            <div
              style={{ height: ROW_HEIGHT }}
              className="rounded-md shadow-lg ring-1 ring-black/10 dark:ring-white/20"
            >
              <RowContent player={activePlayer} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {panel &&
        (() => {
          const panelPlayer = withRanks.find((p) => p.playerId === panel.playerId);
          return panelPlayer ? (
            <PlayerDetailsPanel
              player={panelPlayer}
              rect={panel.rect}
              insight={panel.insight}
              injuryOutlook={panel.injuryOutlook}
              onClose={handleClosePanel}
            />
          ) : null;
        })()}
    </div>
  );
}

function computeMidpointRank(prev?: number, next?: number): number {
  if (prev === undefined && next === undefined) return 0;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

// No transform/transition is applied here from useSortable's "make room"
// shift — with a virtualized list, rows are already absolutely positioned
// by the virtualizer, and layering dnd-kit's own live-shift transform on
// top of that distorts each row's real screen position mid-drag, which
// throws off collision detection (closestCenter resolves the wrong `over`
// neighbor). The dragged item's visual "follow the pointer" feedback comes
// entirely from <DragOverlay>, a separate floating element, instead.
function SortableRow({
  player,
  onToggleDetails,
  onSetRank,
  highlighted,
}: {
  player: DisplayPlayer;
  onToggleDetails?: (playerId: string, rect: Rect) => void;
  onSetRank?: (playerId: string, newRank: number) => void;
  highlighted?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: player.playerId,
  });

  return (
    <div
      ref={setNodeRef}
      className="h-full"
      style={{ touchAction: "none" }}
      {...attributes}
      {...listeners}
    >
      <RowContent
        player={player}
        dragging={isDragging}
        onToggleDetails={onToggleDetails}
        onSetRank={onSetRank}
        highlighted={highlighted}
      />
    </div>
  );
}

function RowContent({
  player,
  dragging,
  onToggleDetails,
  onSetRank,
  highlighted,
}: {
  player: DisplayPlayer;
  dragging?: boolean;
  onToggleDetails?: (playerId: string, rect: Rect) => void;
  onSetRank?: (playerId: string, newRank: number) => void;
  highlighted?: boolean;
}) {
  const delta =
    player.consensusRank != null ? player.overallRank - player.consensusRank : null;
  const bucket = delta != null ? getDeltaBucket(delta) : "neutral";
  const injuryBadge = getInjuryBadge(player.injuryStatus);

  return (
    <div
      className={`flex h-full cursor-grab items-center gap-3 border-b border-black/[.08] px-4 transition-shadow active:cursor-grabbing dark:border-white/[.145] ${DELTA_ROW_CLASSES[bucket]} ${
        dragging ? "opacity-50" : ""
      } ${highlighted ? "ring-2 ring-inset ring-blue-500" : ""}`}
    >
      {onSetRank ? (
        <RankCell
          overallRank={player.overallRank}
          onSubmit={(newRank) => onSetRank(player.playerId, newRank)}
        />
      ) : (
        <span className="w-14 shrink-0 text-sm font-medium text-zinc-400 dark:text-zinc-500">
          #{player.overallRank}
        </span>
      )}
      <span className="flex flex-1 items-center gap-2 font-medium text-black dark:text-zinc-50">
        {player.fullName}
        {injuryBadge && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDetails?.(player.playerId, e.currentTarget.getBoundingClientRect());
            }}
            className={`rounded px-1.5 py-0.5 text-xs font-bold ${injuryBadge.className}`}
            title={`${player.injuryStatus} — click for injury outlook`}
          >
            {injuryBadge.label}
          </button>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        {player.position}
        {player.positionRank} · {player.team ?? "FA"}
        {player.consensusRank != null && delta != null && (
          <>
            <span>· ADP {player.consensusRank.toFixed(1)}</span>
            <span className={`font-semibold tabular-nums ${DELTA_TEXT_CLASSES[bucket]}`}>
              {formatDelta(delta)}
            </span>
          </>
        )}
      </span>
      {onToggleDetails && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDetails(player.playerId, e.currentTarget.getBoundingClientRect());
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/[.08] text-xs font-bold text-zinc-500 hover:bg-black/[.06] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/10"
          aria-label={`View details for ${player.fullName}`}
        >
          i
        </button>
      )}
    </div>
  );
}

// Double-click the rank number to jump a player straight to a spot without
// dragging. Commits only through onBlur (Enter just blurs the input) so a
// single Enter press can't double-submit from both the keydown and the
// blur it triggers; Escape sets a flag so the resulting blur is a no-op.
function RankCell({
  overallRank,
  onSubmit,
}: {
  overallRank: number;
  onSubmit: (newRank: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const cancelRef = useRef(false);

  if (editing) {
    return (
      <input
        type="number"
        min={1}
        defaultValue={overallRank}
        autoFocus
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            cancelRef.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          setEditing(false);
          if (cancelRef.current) {
            cancelRef.current = false;
            return;
          }
          const next = parseInt(e.currentTarget.value, 10);
          if (!Number.isNaN(next) && next !== overallRank) onSubmit(next);
        }}
        className="w-14 shrink-0 rounded border border-black/20 bg-white px-1 py-0.5 text-sm font-medium text-black dark:border-white/20 dark:bg-zinc-900 dark:text-zinc-50"
      />
    );
  }

  return (
    <span
      className="w-14 shrink-0 cursor-text text-sm font-medium text-zinc-400 dark:text-zinc-500"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Double-click to jump to a rank"
    >
      #{overallRank}
    </span>
  );
}

// Portal to document.body — the row list sits inside an overflow-y-auto
// scroll container (see the virtualized list above), which would clip a
// panel positioned relative to it. Same pattern as <DragOverlay>. A
// full-viewport transparent backdrop below the panel closes it on an
// outside click, since this is now an explicit click-to-open panel rather
// than a hover tooltip that disappears on its own.
function PlayerDetailsPanel({
  player,
  rect,
  insight,
  injuryOutlook,
  onClose,
}: {
  player: DisplayPlayer;
  rect: Rect;
  insight: Insight | "loading" | "error";
  injuryOutlook: InjuryOutlook | "loading" | "error" | "none";
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  const GAP = 8;
  const MARGIN = 8;
  // Anchor on whichever side of the row has more room, and cap the panel's
  // height to whatever actually fits there — content that's still too long
  // (e.g. a full injury writeup) scrolls inside the panel instead of
  // overflowing past the edge of the screen.
  const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN;
  const spaceAbove = rect.top - GAP - MARGIN;
  const showAbove = spaceBelow < spaceAbove;
  const maxHeight = Math.max(120, showAbove ? spaceAbove : spaceBelow);
  const left = Math.min(Math.max(rect.right - PANEL_WIDTH, MARGIN), window.innerWidth - PANEL_WIDTH - MARGIN);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{
          position: "fixed",
          top: showAbove ? rect.top - GAP : rect.bottom + GAP,
          left,
          width: PANEL_WIDTH,
          maxHeight,
          transform: showAbove ? "translateY(-100%)" : undefined,
          zIndex: 50,
        }}
        className="overflow-y-auto rounded-lg border border-black/[.08] bg-white p-3 text-sm shadow-xl ring-1 ring-black/5 dark:border-white/[.145] dark:bg-zinc-900 dark:ring-white/10"
      >
        <div className="sticky top-0 mb-2 flex items-center justify-between gap-2 bg-white dark:bg-zinc-900">
          <p className="font-semibold text-black dark:text-zinc-50">{player.fullName}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-black/[.06] hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="rounded-md bg-green-50 p-2 dark:bg-green-950/40">
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
              Strength
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">
              {insight === "loading" ? "Thinking…" : insight === "error" ? "Unavailable" : insight.strength}
            </p>
          </div>
          <div className="rounded-md bg-red-50 p-2 dark:bg-red-950/40">
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
              Concern
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">
              {insight === "loading" ? "Thinking…" : insight === "error" ? "Unavailable" : insight.concern}
            </p>
          </div>
          <div className="rounded-md bg-zinc-100 p-2 dark:bg-zinc-800">
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Injury
            </p>
            {injuryOutlook === "none" ? (
              <p className="text-zinc-700 dark:text-zinc-300">No injury designation</p>
            ) : (
              <div className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-300">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {player.injuryStatus}
                  {player.injuryBodyPart ? ` (${player.injuryBodyPart})` : ""}
                </p>
                {injuryOutlook === "loading" ? (
                  <p>Researching…</p>
                ) : injuryOutlook === "error" ? (
                  <p>Unable to research this injury right now.</p>
                ) : (
                  <>
                    <p>{injuryOutlook.summary}</p>
                    <p className="font-semibold">Expected return: {injuryOutlook.expectedReturn}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function CheatsheetFormatPicker({ onClose }: { onClose: () => void }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-black/[.08] bg-white p-4 shadow-xl dark:border-white/[.145] dark:bg-zinc-900"
        role="dialog"
        aria-label="Choose a format for your printable cheat sheet"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="font-semibold text-black dark:text-zinc-50">Which format?</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-black/[.06] hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {FORMATS.map((f) => (
            <Link
              key={f}
              href={`/rankings/cheatsheet?format=${f}`}
              className="rounded-md border border-black/[.08] px-3 py-2 text-center text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/10"
            >
              {FORMAT_LABELS[f]}
            </Link>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}
