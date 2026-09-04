import type { Format, RankedPlayer } from "@/lib/rankings";

// Guest mode's entire persistence layer: no account, no Supabase writes —
// just the ordered list of player ids for this format, kept in this
// browser's localStorage. Ranks themselves are never stored; they're always
// recomputed as a clean 1..N sequence from array position on load, so there's
// no fractional-rank/renormalize concern the way there is for signed-in
// drag-and-drop.
const STORAGE_PREFIX = "ff_guest_rankings_";

function storageKey(format: Format): string {
  return `${STORAGE_PREFIX}${format}`;
}

export function loadGuestOrder(format: Format): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(format));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGuestOrder(format: Format, players: RankedPlayer[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(format),
      JSON.stringify(players.map((p) => p.playerId))
    );
  } catch {
    // Private browsing / storage full / disabled — guest board still works
    // for the rest of this session, it just won't persist across reloads.
  }
}

// Reorders `defaultPlayers` (the consensus seed order) to match a
// previously saved guest order. Any player not in the saved order (added to
// the pool since the guest last visited) is appended at the end in its
// default order — mirrors appendMissingPlayers's behavior for signed-in
// users. Ranks are recomputed fresh from final position.
export function applyGuestOrder(defaultPlayers: RankedPlayer[], order: string[]): RankedPlayer[] {
  const byId = new Map(defaultPlayers.map((p) => [p.playerId, p]));
  const ordered: RankedPlayer[] = [];
  for (const id of order) {
    const player = byId.get(id);
    if (player) {
      ordered.push(player);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());
  return ordered.map((p, index) => ({ ...p, rank: index + 1 }));
}
