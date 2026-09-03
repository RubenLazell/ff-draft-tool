// Sleeper draft-room adapter. Sleeper actually ships (at least) two
// different draft board layouts depending on the URL:
//  - "beta" (/beta/draft/nfl/<id>): each filled pick is
//    `.bg-dls-picked-<position>`, with an `<img alt="Full Name">` inside.
//  - "legacy" (/draft/nfl/<id>): each filled pick is `.cell.drafted`, with
//    a `.player-name` div holding an ABBREVIATED name ("B. Robinson", not
//    "Bijan Robinson") — matching that against our full-name rankings
//    needs fuzzy initial+lastname matching (see content.js), not exact
//    string equality. This layout's avatar image is better anyway: its
//    src embeds Sleeper's own player id (.../players/thumb/9509.jpg),
//    which is exactly what our players.id column already stores (both
//    sourced from Sleeper's player API) — an exact match, not a guess.
const SleeperAdapter = {
  // Used only for the "not in a draft" notice — findDraftBoardRoot()
  // always returns null (see below), so that can't double as this check.
  // The URL is a much more reliable signal than any DOM probe here: a
  // real or mock Sleeper draft always lives under /draft/nfl/<id>
  // (including the /beta/draft/nfl/<id> variant).
  isDraftPageActive() {
    return location.pathname.includes("/draft/nfl/");
  },

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
    const cells = document.querySelectorAll("[class*='bg-dls-picked'], .cell.drafted");
    const names = [];
    for (const cell of cells) {
      const full =
        cell.querySelector("img[alt]")?.getAttribute("alt")?.trim() ||
        cell.querySelector(".player-name")?.textContent?.trim() ||
        "";
      if (full) names.push(normalizeName(full));
    }
    return new Set(names);
  },

  // Precise id-based match — see the file header comment. Only implemented
  // for the legacy layout, since the beta layout's avatar src format
  // wasn't confirmed against a live page; getDraftedPlayerNames() (via its
  // alt-text full names) already covers that one reliably on its own.
  getDraftedPlayerIds() {
    const cells = document.querySelectorAll(".cell.drafted");
    const ids = [];
    for (const cell of cells) {
      const src = cell.querySelector(".player-avatar-container img")?.getAttribute("src") ?? "";
      const match = src.match(/\/players\/thumb\/(\d+)\./);
      if (match) ids.push(match[1]);
    }
    return new Set(ids);
  },
};
