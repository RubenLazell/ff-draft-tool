// Core logic shared by scripts/sync-consensus-rankings.mjs (manual CLI
// run) and the Vercel Cron route (src/app/api/cron/sync-data/route.ts).
// See playersCore.mjs for why this stays plain .mjs instead of .ts.
//
// Source: FantasyFootballCalculator's ADP API (no key required, free for
// personal/commercial use — https://help.fantasyfootballcalculator.com/article/42-adp-rest-api).
// Their data only updates once per day; don't call this more than occasionally.
// Attribution: https://fantasyfootballcalculator.com/

// DB format -> FFC's URL path segment. 2qb is Superflex (verified live:
// QBs rank sharply higher, e.g. Josh Allen #1 overall). dynasty is a
// separate ADP pool entirely (startup dynasty drafts), not a scoring
// variant — verified live: young WR/RB assets (Ja'Marr Chase, Jahmyr
// Gibbs) rank far above veteran QBs, the opposite of redraft.
const FORMATS = {
  PPR: "ppr",
  HALF_PPR: "half-ppr",
  STANDARD: "standard",
  SUPERFLEX: "2qb",
  DYNASTY: "dynasty",
};

const COMBINING_MARKS = /[̀-ͯ]/g;

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "") // strip accents
    .replace(/[^a-z0-9 ]/g, "") // strip punctuation (periods, apostrophes, Jr./Sr.)
    .replace(/\s+(jr|sr|ii|iii|iv)$/, "") // strip trailing suffixes
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(msg: string) => void} [log]
 */
export async function syncConsensusRankings(supabase, log = () => {}) {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, full_name, team, position");
  if (playersError) throw playersError;

  // Index our players by normalized-name+team, and name-only (for cases
  // where FFC's team field is stale/blank) as a fallback. DEF entries are
  // named differently by each source (Sleeper: "Houston Texans", FFC:
  // "Houston Defense") — team code is unambiguous for defenses, so index
  // those by team instead of name.
  const byNameTeam = new Map();
  const byNameOnly = new Map();
  const byTeamDef = new Map();
  for (const p of players) {
    if (p.position === "DEF") {
      if (p.team) byTeamDef.set(p.team, p.id);
      continue;
    }
    const key = normalizeName(p.full_name);
    byNameOnly.set(key, p.id);
    if (p.team) byNameTeam.set(`${key}|${p.team}`, p.id);
  }

  // Bye week is a player attribute, not a per-format one — FFC returns the
  // same value regardless of which format's ADP endpoint surfaced it, so
  // just collect it once per player across whichever format hits it first.
  const byeWeeks = new Map();
  const formatSummaries = {};

  for (const [format, path] of Object.entries(FORMATS)) {
    const res = await fetch(
      `https://fantasyfootballcalculator.com/api/v1/adp/${path}?teams=12&year=2026`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; ff-draft-tool/1.0)" } }
    );
    if (!res.ok) throw new Error(`FFC fetch failed for ${format}: ${res.status}`);
    const { players: adpPlayers } = await res.json();

    const rows = [];
    const unmatched = [];
    for (const p of adpPlayers) {
      const playerId =
        p.position === "DST" || p.position === "DEF"
          ? byTeamDef.get(p.team)
          : byNameTeam.get(`${normalizeName(p.name)}|${p.team}`) ??
            byNameOnly.get(normalizeName(p.name));
      if (!playerId) {
        unmatched.push(`${p.name} (${p.position}, ${p.team})`);
        continue;
      }
      rows.push({ player_id: playerId, format, consensus_rank: p.adp });
      if (typeof p.bye === "number") byeWeeks.set(playerId, p.bye);
    }

    log(
      `${format}: matched ${rows.length}/${adpPlayers.length} players` +
        (unmatched.length ? `, ${unmatched.length} unmatched` : "")
    );
    formatSummaries[format] = { matched: rows.length, total: adpPlayers.length, unmatched: unmatched.length };

    if (rows.length > 0) {
      const { error } = await supabase
        .from("consensus_rankings")
        .upsert(rows, { onConflict: "player_id,format" });
      if (error) throw error;
    }
  }

  // Plain UPDATE, not upsert — every id here already exists (we only ever
  // matched against players already in the table), and upserting a
  // partial row (just id + bye_week) would hit the NOT NULL constraints on
  // full_name/position if PostgREST ever takes the insert path instead of
  // the update-on-conflict path for a given row.
  const byeWeekEntries = [...byeWeeks.entries()];
  const BYE_BATCH_SIZE = 50;
  for (let i = 0; i < byeWeekEntries.length; i += BYE_BATCH_SIZE) {
    const batch = byeWeekEntries.slice(i, i + BYE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(([id, bye_week]) => supabase.from("players").update({ bye_week }).eq("id", id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
  log(`Updated bye_week for ${byeWeekEntries.length} players.`);

  return { formats: formatSummaries, byeWeeksUpdated: byeWeekEntries.length };
}
