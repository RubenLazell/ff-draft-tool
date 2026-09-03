// Sleeper draft-room adapter — PLACEHOLDER, not verified against a live
// Sleeper draft page. Sleeper's frontend is React with what looks like
// CSS-module-generated class names (less predictable/stable than ESPN's
// human-readable ones), so these selectors are a rough guess, not a
// confirmed fact. If they don't match, content.js's existing fallback
// messaging handles it (no picks ever register as drafted rather than
// showing wrong data) — the concrete next step is inspecting a real
// Sleeper draft page's DOM (right-click a drafted player → Inspect →
// copy outer HTML) and correcting the two functions below against it.
const SleeperAdapter = {
  findDraftBoardRoot() {
    return (
      document.querySelector("[class*='draftBoard']") ||
      document.querySelector("[class*='DraftBoard']") ||
      document.querySelector("[class*='draft-board']") ||
      null
    );
  },

  getDraftedPlayerNames() {
    const cells = document.querySelectorAll(
      "[class*='pick'][class*='drafted'], [class*='slot'][class*='filled'], [data-testid*='draft-pick'][class*='filled']"
    );
    const names = [];
    for (const cell of cells) {
      const nameEl =
        cell.querySelector("[class*='playerName']") ||
        cell.querySelector("[class*='player-name']") ||
        cell.querySelector("[class*='name']");
      const full = (nameEl?.textContent ?? "").trim();
      if (full) names.push(normalizeName(full));
    }
    return new Set(names);
  },
};
