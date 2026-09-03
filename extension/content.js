// Injected on ESPN's draft room / mock draft lobby. Pulls the user's
// rankings once via the background worker, then filters locally against
// whatever ESPN's DOM reports as drafted — no network call per pick.
(function () {
  const PANEL_ID = "fftool-panel";
  // Clicking a position (or "Overall") section expands it to this many,
  // regardless of the configured default — a quick "show me more here"
  // without changing settings for every other section too.
  const EXPANDED_TOP_PER_POSITION = 10;
  const EXPANDED_TOP_OVERALL = 10;
  // Not a real position — reuses the same expandedPositions Set/click
  // handling as QB/RB/etc. so "Overall" gets identical expand behavior for
  // free, just with its own count and no color swatch (POSITION_COLORS has
  // no entry for it).
  const OVERALL_KEY = "OVERALL";

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
  let expandedPositions = new Set();
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
  // Verified against a live ESPN mock draft's "Board" tab: each pick is a
  // `.draft-board-grid-pick-cell`, carrying `.completedPick` once filled
  // (vs. `.upcomingPick` beforehand) with `.playerFirstName` /
  // `.playerLastName` spans inside. This is specific to the Board tab —
  // switching to the "Players" or "Pick History" tab may remove these
  // cells from the DOM, which would just make getDraftedPlayerNames()
  // return an empty set (nothing newly "undrafted", so the last known
  // state simply stops updating rather than showing anything wrong).
  function findDraftBoardRoot() {
    const cell = document.querySelector(".draft-board-grid-pick-cell");
    return cell ? cell.parentElement : null;
  }

  function getDraftedPlayerNames() {
    const cells = document.querySelectorAll(".draft-board-grid-pick-cell.completedPick");
    const names = [];
    for (const cell of cells) {
      const first = cell.querySelector(".playerFirstName")?.textContent ?? "";
      const last = cell.querySelector(".playerLastName")?.textContent ?? "";
      const full = `${first} ${last}`.trim();
      if (full) names.push(normalizeName(full));
    }
    return new Set(names);
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
    if (e.target.closest(".fftool-hide-toggle")) {
      // Just a CSS toggle, not a state variable — future renderPanel()
      // calls only replace innerHTML, which leaves style.display alone,
      // so this stays hidden across draft-pick updates until explicitly
      // shown again from the popup.
      ensurePanel().style.display = "none";
      return;
    }
    if (e.target.closest(".fftool-collapse-toggle")) {
      collapsed = !collapsed;
      renderPanel();
      return;
    }
    if (e.target.closest(".fftool-toggle-kdef")) {
      hideKDef = !hideKDef;
      chrome.storage.sync.set({ hideKDef });
      renderPanel();
      return;
    }
    const sectionTitle = e.target.closest(".fftool-section-title-clickable");
    if (sectionTitle) {
      const pos = sectionTitle.dataset.pos;
      if (expandedPositions.has(pos)) {
        expandedPositions.delete(pos);
      } else {
        expandedPositions.add(pos);
      }
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
        <button class="fftool-hide-toggle" aria-label="Hide panel" title="Hide panel — bring it back from the extension popup">×</button>
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

  function renderSection(title, players, posKey, expanded) {
    if (!players.length) return "";
    const color = POSITION_COLORS[posKey];
    const swatch = color ? `<span class="fftool-swatch" style="background:${color}"></span>` : "";
    // Only actual positions toggle expand/collapse — "Overall" (posKey
    // null) always just shows its configured count.
    const clickable = posKey != null;
    const chevron = clickable
      ? `<span class="fftool-chevron">${expanded ? "▾" : "▸"}</span>`
      : "";
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
    return `<div class="fftool-section">
      <div class="fftool-section-title${clickable ? " fftool-section-title-clickable" : ""}"${
      clickable ? ` data-pos="${posKey}"` : ""
    }>
        ${swatch}${escapeHtml(title)}${chevron}
      </div>
      ${rows}
    </div>`;
  }

  function renderPanel() {
    const panel = ensurePanel();
    const available = computeAvailable();

    if (collapsed) {
      panel.innerHTML = renderHeader(available.length);
      return;
    }

    const isOverallExpanded = expandedPositions.has(OVERALL_KEY);
    const overallCount = isOverallExpanded
      ? Math.max(EXPANDED_TOP_OVERALL, settings.topOverall)
      : settings.topOverall;
    const overall = available.slice(0, overallCount);
    const sections = [renderSection("Overall", overall, OVERALL_KEY, isOverallExpanded)];
    for (const pos of POSITION_ORDER) {
      if (hideKDef && (pos === "K" || pos === "DEF")) continue;
      const isExpanded = expandedPositions.has(pos);
      const count = isExpanded
        ? Math.max(EXPANDED_TOP_PER_POSITION, settings.topPerPosition)
        : settings.topPerPosition;
      const byPos = available.filter((p) => p.position === pos).slice(0, count);
      sections.push(renderSection(pos, byPos, pos, isExpanded));
    }

    // Re-checked on every render (not just once at startup) so this stays
    // accurate if ESPN's SPA routes the user into a draft without a full
    // page reload, which wouldn't re-run this content script but would
    // still trigger the MutationObserver watching document.body.
    const inDraft = !!findDraftBoardRoot();

    panel.innerHTML = `
      ${renderHeader(available.length)}
      ${
        inDraft
          ? ""
          : `<div class="fftool-notice">Not in a draft — showing your full rankings.</div>`
      }
      <div class="fftool-toolbar">
        <button class="fftool-toggle-kdef ${hideKDef ? "fftool-toggle-active" : ""}">
          ${hideKDef ? "K/DEF hidden" : "Hide K/DEF"}
        </button>
      </div>
      ${sections.join("")}
    `;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SHOW_PANEL") {
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.style.display = "";
    }
  });

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
