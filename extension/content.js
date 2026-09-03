// Injected on ESPN's draft room / mock draft lobby. Pulls the user's
// rankings once via the background worker, then filters locally against
// whatever ESPN's DOM reports as drafted — no network call per pick.
(function () {
  const PANEL_ID = "fftool-panel";

  // Same fixed hue-per-position palette as the web app's cheat sheet
  // (src/app/rankings/CheatsheetView.tsx) — kept consistent rather than
  // inventing a second color scheme for the same identity encoding.
  const POSITION_COLORS = {
    QB: "#3b82f6",
    RB: "#f97316",
    WR: "#14b8a6",
    TE: "#eab308",
    K: "#ec4899",
    DEF: "#22c55e",
  };

  let rankings = [];
  let draftedNames = new Set();
  let settings = {
    format: "PPR",
    topOverall: DEFAULT_TOP_OVERALL,
    topPerPosition: DEFAULT_TOP_PER_POSITION,
  };
  let hideKDef = false;
  let collapsed = false;
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
    return rankings
      .filter((p) => !draftedNames.has(normalizeName(p.fullName)))
      .filter((p) => !hideKDef || (p.position !== "K" && p.position !== "DEF"));
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.className = "fftool-panel";
      document.body.appendChild(panel);
      panel.addEventListener("click", handlePanelClick);
    }
    return panel;
  }

  function handlePanelClick(e) {
    if (e.target.closest(".fftool-collapse-toggle")) {
      collapsed = !collapsed;
      renderPanel();
    } else if (e.target.closest(".fftool-toggle-kdef")) {
      hideKDef = !hideKDef;
      chrome.storage.sync.set({ hideKDef });
      renderPanel();
    }
  }

  function renderHeader(count) {
    return `
      <div class="fftool-header">
        <button class="fftool-collapse-toggle" aria-label="${collapsed ? "Expand" : "Collapse"}">
          ${collapsed ? "▸" : "▾"}
        </button>
        <span class="fftool-title">FF Draft Tool</span>
        ${count != null ? `<span class="fftool-count">${count} left</span>` : ""}
      </div>
    `;
  }

  function renderMessage(message) {
    const panel = ensurePanel();
    panel.innerHTML = `
      ${renderHeader(null)}
      <div class="fftool-error">${escapeHtml(message)}</div>
    `;
  }

  function renderSection(title, players, posKey) {
    if (!players.length) return "";
    const color = POSITION_COLORS[posKey];
    const swatch = color ? `<span class="fftool-swatch" style="background:${color}"></span>` : "";
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
    return `<div class="fftool-section"><div class="fftool-section-title">${swatch}${escapeHtml(
      title
    )}</div>${rows}</div>`;
  }

  function renderPanel() {
    const panel = ensurePanel();
    const available = computeAvailable();

    if (collapsed) {
      panel.innerHTML = renderHeader(available.length);
      return;
    }

    const overall = available.slice(0, settings.topOverall);
    const sections = [renderSection("Overall", overall, null)];
    for (const pos of POSITION_ORDER) {
      if (hideKDef && (pos === "K" || pos === "DEF")) continue;
      const byPos = available.filter((p) => p.position === pos).slice(0, settings.topPerPosition);
      sections.push(renderSection(pos, byPos, pos));
    }

    panel.innerHTML = `
      ${renderHeader(available.length)}
      <div class="fftool-toolbar">
        <button class="fftool-toggle-kdef ${hideKDef ? "fftool-toggle-active" : ""}">
          ${hideKDef ? "K/DEF hidden" : "Hide K/DEF"}
        </button>
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
      {
        format: "PPR",
        topOverall: DEFAULT_TOP_OVERALL,
        topPerPosition: DEFAULT_TOP_PER_POSITION,
        hideKDef: false,
      },
      (stored) => {
        settings = stored;
        hideKDef = stored.hideKDef;
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
