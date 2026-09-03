// Injected on ESPN and Sleeper draft rooms (see manifest.json's `matches`
// and the adapter selection below). Pulls the user's rankings once via the
// background worker, then filters locally against whatever the active
// site's DOM reports as drafted — no network call per pick.
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Picked once per page load by hostname — content.js has no per-site
  // knowledge beyond this, everything else (rendering, filtering, hide/
  // collapse/expand, K/DEF toggle) works identically regardless of which
  // adapter is active.
  const adapter = location.hostname.includes("sleeper.com") ? SleeperAdapter : EspnAdapter;
  const findDraftBoardRoot = () => adapter.findDraftBoardRoot();
  const getDraftedPlayerNames = () => adapter.getDraftedPlayerNames();

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
      // Only `.fftool-content` gets replaced by each render — the panel
      // element itself, and its size/position, persist across re-renders
      // (and across drags/resizes) since those only ever touch innerHTML.
      panel.innerHTML = '<div class="fftool-content"></div>';
      document.body.appendChild(panel);
      panel.addEventListener("click", handlePanelClick);
      panel.addEventListener("pointerdown", handlePanelPointerDown);
      initPanelBox(panel);
    }
    return panel;
  }

  function getContentEl() {
    return ensurePanel().querySelector(".fftool-content");
  }

  // A dragged-up panel must never get closer to the top than this — it's
  // the same 160px the CSS default uses to clear ESPN/Sleeper's own fixed
  // header. Without this floor, dragging the panel up even slightly slides
  // its own header behind the site's header: invisible, and thus
  // impossible to grab to drag back down — which is exactly the bug this
  // fixes, both live while dragging and by self-correcting a bad value
  // already saved from before this existed.
  const MIN_TOP = 160;

  // Keeps the whole box on-screen — including its bottom-right corner,
  // where the native resize grip lives. The previous version only bounded
  // `top`/`left` with a fixed margin, which still let `left + width` or
  // `top + height` run off the visible viewport (further right/down than
  // the screen, or literally past the browser window into the OS taskbar
  // area) — putting the resize handle out of reach. Bounding by the
  // panel's actual width/height instead guarantees the corner stays put.
  function clampPosition(left, top, width, height) {
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(MIN_TOP, window.innerHeight - height);
    return {
      left: Math.min(Math.max(left, 0), maxLeft),
      top: Math.min(Math.max(top, MIN_TOP), maxTop),
    };
  }

  // Restores a saved position/size, or — if there's none yet — pins the
  // CSS-default right-anchored position to an explicit `left` instead.
  // That's needed purely so the native resize handle (bottom-right corner,
  // from `resize: both` in content.css) grows the box towards the cursor:
  // with `right` still set, growing `width` would keep the right edge
  // fixed and push the left edge further left, which looks broken.
  function initPanelBox(panel) {
    chrome.storage.local.get("panelBox", ({ panelBox }) => {
      if (panelBox) {
        Object.assign(panel.style, panelBox, { right: "auto", bottom: "auto" });
        const rect = panel.getBoundingClientRect();
        const clamped = clampPosition(rect.left, rect.top, rect.width, rect.height);
        panel.style.left = `${clamped.left}px`;
        panel.style.top = `${clamped.top}px`;
      } else {
        const rect = panel.getBoundingClientRect();
        panel.style.left = `${rect.left}px`;
        panel.style.right = "auto";
      }
      // ResizeObserver always fires once immediately on observe(), before
      // any real user resize — saving that passive callback would record
      // an incomplete box (e.g. no explicit height yet) and, on the next
      // load, permanently lose the adaptive top+bottom sizing that clears
      // ESPN's chat bar. Only persist from genuine subsequent callbacks.
      let skipFirstResizeCallback = true;
      new ResizeObserver(() => {
        if (skipFirstResizeCallback) {
          skipFirstResizeCallback = false;
          return;
        }
        savePanelBox(panel);
      }).observe(panel);
    });
  }

  function savePanelBox(panel) {
    chrome.storage.local.set({
      panelBox: {
        left: panel.style.left,
        top: panel.style.top,
        width: panel.style.width,
        height: panel.style.height,
      },
    });
  }

  function handlePanelPointerDown(e) {
    if (e.target.closest(".fftool-header") && !e.target.closest("button")) {
      beginDrag(e);
    }
  }

  function beginDrag(e) {
    e.preventDefault();
    const panel = ensurePanel();
    const rect = panel.getBoundingClientRect();
    // Fix height and clear `bottom` too — otherwise, since `bottom` stays
    // anchored while `top` moves during the drag, the box's height would
    // keep changing to stay fitted between them instead of staying put.
    panel.style.top = `${rect.top}px`;
    panel.style.height = `${rect.height}px`;
    panel.style.bottom = "auto";

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    function onMove(moveEvent) {
      const rawLeft = startLeft + (moveEvent.clientX - startX);
      const rawTop = startTop + (moveEvent.clientY - startY);
      const clamped = clampPosition(rawLeft, rawTop, rect.width, rect.height);
      panel.style.left = `${clamped.left}px`;
      panel.style.top = `${clamped.top}px`;
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      savePanelBox(panel);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
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
      <div class="fftool-header" title="Drag to move">
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
    getContentEl().innerHTML = `
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
    const content = getContentEl();
    const available = computeAvailable();

    if (collapsed) {
      content.innerHTML = renderHeader(available.length);
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

    content.innerHTML = `
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
