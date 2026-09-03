const loginView = document.getElementById("loginView");
const settingsView = document.getElementById("settingsView");
const loggedInAs = document.getElementById("loggedInAs");
const loginError = document.getElementById("loginError");
const saveStatus = document.getElementById("saveStatus");
const formatSelect = document.getElementById("format");
const topOverallInput = document.getElementById("topOverall");
const topPerPositionInput = document.getElementById("topPerPosition");

for (const f of FORMATS) {
  const opt = document.createElement("option");
  opt.value = f;
  opt.textContent = FORMAT_LABELS[f];
  formatSelect.appendChild(opt);
}

async function loadSettings() {
  const { format, topOverall, topPerPosition } = await chrome.storage.sync.get({
    format: "PPR",
    topOverall: DEFAULT_TOP_OVERALL,
    topPerPosition: DEFAULT_TOP_PER_POSITION,
  });
  formatSelect.value = format;
  topOverallInput.value = topOverall;
  topPerPositionInput.value = topPerPosition;
}

async function refreshView() {
  const status = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" });
  if (status?.loggedIn) {
    loginView.hidden = true;
    settingsView.hidden = false;
    loggedInAs.textContent = `Logged in as ${status.email}`;
  } else {
    loginView.hidden = false;
    settingsView.hidden = true;
  }
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  loginError.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) {
    loginError.textContent = "Enter email and password.";
    return;
  }
  const result = await chrome.runtime.sendMessage({ type: "LOGIN", email, password });
  if (result?.error) {
    loginError.textContent = result.error;
    return;
  }
  await refreshView();
});

document.getElementById("showPanelBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "SHOW_PANEL" }, () => {
    // No content script on this tab (not an ESPN or Sleeper draft page) —
    // nothing to do, but read lastError so Chrome doesn't log an unchecked error.
    void chrome.runtime.lastError;
  });
});

document.getElementById("resetPositionBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "RESET_PANEL_POSITION" }, () => {
    void chrome.runtime.lastError;
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "LOGOUT" });
  await refreshView();
});

document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    format: formatSelect.value,
    topOverall: Number(topOverallInput.value) || DEFAULT_TOP_OVERALL,
    topPerPosition: Number(topPerPositionInput.value) || DEFAULT_TOP_PER_POSITION,
  });
  saveStatus.textContent = "Saved — refresh the ESPN or Sleeper tab to apply.";
  setTimeout(() => (saveStatus.textContent = ""), 2500);
});

loadSettings();
refreshView();
