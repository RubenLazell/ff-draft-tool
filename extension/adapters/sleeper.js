// Sleeper draft-room adapter. Verified against a live Sleeper mock draft:
// each filled pick cell carries a `bg-dls-picked-<position>` class (e.g.
// `bg-dls-picked-rb`) on its outer div, and contains an `<img alt="...">`
// whose alt text is the player's full name — simpler and more reliable
// than reconstructing first/last name spans.
const SleeperAdapter = {
  findDraftBoardRoot() {
    // No confidently-identifiable board-wide container from the DOM
    // inspected so far — each pick cell's own parent looks like it could
    // be scoped to just one team's column. Returning null here means
    // content.js falls back to observing document.body instead, which is
    // safe (if slightly broader than strictly necessary) rather than
    // risking a too-narrow root that misses picks in other teams' columns.
    return null;
  },

  getDraftedPlayerNames() {
    const cells = document.querySelectorAll("[class*='bg-dls-picked']");
    const names = [];
    for (const cell of cells) {
      const full = cell.querySelector("img[alt]")?.getAttribute("alt")?.trim() ?? "";
      if (full) names.push(normalizeName(full));
    }
    return new Set(names);
  },
};
