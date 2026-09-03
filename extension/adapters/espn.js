// ESPN Fantasy Football draft-room adapter. Verified against a live ESPN
// mock draft's "Board" tab: each pick is a `.draft-board-grid-pick-cell`,
// carrying `.completedPick` once filled (vs. `.upcomingPick` beforehand)
// with `.playerFirstName` / `.playerLastName` spans inside. This is
// specific to the Board tab — switching to the "Players" or "Pick
// History" tab may remove these cells from the DOM, which would just make
// getDraftedPlayerNames() return an empty set (nothing newly "undrafted",
// so the last known state simply stops updating rather than showing
// anything wrong).
const EspnAdapter = {
  findDraftBoardRoot() {
    const cell = document.querySelector(".draft-board-grid-pick-cell");
    return cell ? cell.parentElement : null;
  },

  getDraftedPlayerNames() {
    const cells = document.querySelectorAll(".draft-board-grid-pick-cell.completedPick");
    const names = [];
    for (const cell of cells) {
      const first = cell.querySelector(".playerFirstName")?.textContent ?? "";
      const last = cell.querySelector(".playerLastName")?.textContent ?? "";
      const full = `${first} ${last}`.trim();
      if (full) names.push(normalizeName(full));
    }
    return new Set(names);
  },
};
