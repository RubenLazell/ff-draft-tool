// Service worker — owns every network call the extension makes, so ESPN's
// page CSP never comes into play (content scripts inherit the host page's
// CSP; this context doesn't). Auth is a direct Bearer-token flow against
// Supabase's REST API (not the web app's session cookie) — verified during
// planning that user_rankings is RLS-scoped to the caller's own JWT, so
// this is exactly as privileged as the web app's own server-side reads,
// just carried over a header instead of a cookie. That also sidesteps a
// real risk with reusing the site's cookie: it's almost certainly
// SameSite=Lax, which browsers won't attach to a cross-site fetch from an
// extension background context.
importScripts("config.js");

const AUTH_KEYS = ["access_token", "refresh_token", "expires_at", "user_id", "email"];

async function getStoredAuth() {
  const data = await chrome.storage.local.get(AUTH_KEYS);
  return data.access_token ? data : null;
}

async function storeAuth(session) {
  await chrome.storage.local.set({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Date.now() + session.expires_in * 1000,
    user_id: session.user.id,
    email: session.user.email,
  });
}

async function clearAuth() {
  await chrome.storage.local.remove(AUTH_KEYS);
}

async function refreshAuth(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  const session = await res.json();
  await storeAuth(session);
  return session;
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.error_description || data.msg || "Login failed." };
  }
  await storeAuth(data);
  return { error: null };
}

function shapeRankings(rows, format) {
  return rows
    .map((row) => {
      const player = row.players;
      const consensusRows = player?.consensus_rankings ?? [];
      const consensus = consensusRows.find((c) => c.format === format);
      return {
        playerId: row.player_id,
        fullName: player?.full_name ?? "",
        position: player?.position ?? "",
        team: player?.team ?? null,
        rank: row.rank,
        consensusRank: consensus?.consensus_rank ?? null,
        injuryStatus: player?.injury_status ?? null,
        byeWeek: player?.bye_week ?? null,
      };
    })
    .sort((a, b) => a.rank - b.rank)
    // The stored `rank` is fractional (drag-and-drop reorders by computing
    // midpoints between neighbors rather than renumbering everything) — the
    // web app never displays that raw value, only each player's position in
    // the sorted list. Replacing it with a clean sequential integer here
    // matches that, instead of showing e.g. "#52.5" or "#24.484375".
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

async function fetchRankings(format) {
  let auth = await getStoredAuth();
  if (!auth) return { error: "not_authenticated" };

  if (Date.now() > auth.expires_at - 60_000) {
    const refreshed = await refreshAuth(auth.refresh_token);
    if (!refreshed) {
      await clearAuth();
      return { error: "not_authenticated" };
    }
    auth = await getStoredAuth();
  }

  const query =
    `${SUPABASE_URL}/rest/v1/user_rankings` +
    `?select=player_id,rank,players(full_name,position,team,bye_week,injury_status,consensus_rankings(consensus_rank,format))` +
    `&user_id=eq.${auth.user_id}&format=eq.${format}&order=rank.asc`;

  const doFetch = (accessToken) =>
    fetch(query, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });

  let res = await doFetch(auth.access_token);
  if (res.status === 401) {
    const refreshed = await refreshAuth(auth.refresh_token);
    if (!refreshed) {
      await clearAuth();
      return { error: "not_authenticated" };
    }
    res = await doFetch(refreshed.access_token);
  }
  if (!res.ok) return { error: "fetch_failed" };

  const rows = await res.json();
  return { rankings: shapeRankings(rows, format) };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "FETCH_RANKINGS") {
    fetchRankings(message.format)
      .then(sendResponse)
      .catch(() => sendResponse({ error: "network_error" }));
    return true; // keep the message channel open for the async response
  }
  if (message?.type === "LOGIN") {
    login(message.email, message.password)
      .then(sendResponse)
      .catch(() => sendResponse({ error: "Network error." }));
    return true;
  }
  if (message?.type === "LOGOUT") {
    clearAuth().then(() => sendResponse({ error: null }));
    return true;
  }
  if (message?.type === "GET_AUTH_STATUS") {
    getStoredAuth().then((auth) =>
      sendResponse({ loggedIn: !!auth, email: auth?.email ?? null })
    );
    return true;
  }
  return false;
});
