// Injected on ESPN's draft room / mock draft lobby. Pulls the user's
// rankings once via the background worker, then filters locally against
// whatever ESPN's DOM reports as drafted — no network call per pick.
(function () {
  const PANEL_ID = "fftool-panel";

  let rankings = [];
  let draftedNames = new Set();
  let settings = {
    format: "PPR",
    topOverall: DEFAULT_TOP_OVERALL,
    topPerPosition: DEFAULT_TOP_PER_POSITION,
  };
  let observer = null;

  function normalizeName(name) {
    return (name || "")
      .toLowerCase()
      .replace(/[.'-]/g, "")
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
      .replace(/[^a-z ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- ESPN DOM adapter -----------------------------------------------
  // PLACEHOLDER selectors — not verified against a live ESPN draft page.
  // ESPN's markup is private/unversioned, so these are a best guess based
  // on typical naming, not a confirmed fact. If they don't match, the
  // panel below shows an explicit "couldn't read the draft board" state
  // instead of silently displaying wrong data. Test against
  // fantasy.espn.com/football/mockdraftlobby (no live draft needed) and
  // fix these two functions against the real DOM.
  function findDraftBoardRoot() {
    return (
      document.querySelector("[class*='DraftBoard']") ||
      document.querySelector("[class*='draftBoard']") ||
      null
    );
  }

  function getDraftedPlayerNames() {
    const nodes = document.querySelectorAll(
      ".playerinfo__playername.drafted, [class*='drafted'] .playerinfo__playername, .player--drafted .player-name"
    );
    return new Set(Array.from(nodes).map((el) => normalizeName(el.textContent)));
  }
  // ----------------------------------------------------------------------

  function computeAvailable() {
    return rankings.filter((p) => !draftedNames.has(normalizeName(p.fullName)));
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.className = "fftool-panel";
      document.body.appendChild(panel);
    }
    return panel;
  }

  function renderMessage(message) {
    const panel = ensurePanel();
    panel.innerHTML = `
      <div class="fftool-header">FF Draft Tool</div>
      <div class="fftool-error">${escapeHtml(message)}</div>
    `;
  }

  function renderSection(title, players) {
    if (!players.length) return "";
    const rows = players
      .map(
        (p) => `
        <div class="fftool-row">
          <span class="fftool-rank">#${p.rank}</span>
          <span class="fftool-name">${escapeHtml(p.fullName)}</span>
          <span class="fftool-meta">${escapeHtml(p.position)} · ${escapeHtml(p.team || "FA")}</span>
        </div>`
      )
      .join("");
    return `<div class="fftool-section"><div class="fftool-section-title">${escapeHtml(
      title
    )}</div>${rows}</div>`;
  }

  function renderPanel() {
    const panel = ensurePanel();
    const available = computeAvailable();
    const overall = available.slice(0, settings.topOverall);

    const sections = [renderSection("Overall", overall)];
    for (const pos of POSITION_ORDER) {
      const byPos = available.filter((p) => p.position === pos).slice(0, settings.topPerPosition);
      sections.push(renderSection(pos, byPos));
    }

    panel.innerHTML = `
      <div class="fftool-header">
        <span>FF Draft Tool</span>
        <span class="fftool-count">${available.length} left</span>
      </div>
      ${sections.join("")}
    `;
  }

  function startObserving() {
    const root = findDraftBoardRoot() || document.body;
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      const names = getDraftedPlayerNames();
      if (names.size !== draftedNames.size) {
        draftedNames = names;
        renderPanel();
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function init() {
    chrome.storage.sync.get(
      { format: "PPR", topOverall: DEFAULT_TOP_OVERALL, topPerPosition: DEFAULT_TOP_PER_POSITION },
      (stored) => {
        settings = stored;
        renderMessage("Loading your rankings…");

        chrome.runtime.sendMessage({ type: "FETCH_RANKINGS", format: settings.format }, (response) => {
          if (!response || response.error === "not_authenticated") {
            renderMessage("Not logged in — open the extension popup to log in.");
            return;
          }
          if (response.error) {
            renderMessage("Couldn't load your rankings — try reloading this page.");
            return;
          }
          if (!response.rankings.length) {
            renderMessage("No rankings found for this format.");
            return;
          }

          rankings = response.rankings;
          draftedNames = getDraftedPlayerNames();
          renderPanel();
          startObserving();
        });
      }
    );
  }

  init();
})();
