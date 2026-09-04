// Core logic shared by scripts/seed-players.mjs (manual CLI run) and the
// Vercel Cron route (src/app/api/cron/sync-data/route.ts) — kept as plain
// .mjs rather than .ts so scripts/seed-players.mjs can still import it
// directly with no build step (TypeScript's `allowJs` lets the Next.js
// side import this same file too). Takes an already-constructed Supabase
// client rather than building its own, so both callers stay in charge of
// where their service-role key comes from.
//
// Safe to re-run (upserts by id). Only ever upserts, never deletes —
// public.user_rankings.player_id has ON DELETE CASCADE from players, so a
// future "prune stale players" job would silently wipe affected users'
// saved ranks. Don't add deletes here without accounting for that.

const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K"]);
const SKILL_PLAYER_COUNT = 500;
// Sleeper player_ids to include regardless of the top-N cutoff below —
// requested one-off adds who don't crack search_rank 500 on their own.
const ALWAYS_INCLUDE_IDS = new Set([
  "8127", // Charlie Kolar, TE, LAC
]);
// Players who retire directly off a roster (rather than being released
// first) keep team/status/active frozen at their last "still playing"
// values forever — Sleeper never nulls them out, unlike released free
// agents. news_updated is the tell: a genuinely rostered player gets at
// least occasional news mentions, so a multi-year silence means the
// record is just stale, not that the player is actually on this team.
const STALE_NEWS_MONTHS = 18;

function isStale(player) {
  if (!player.news_updated) return false; // no signal either way; don't exclude on absence alone
  const ageMonths = (Date.now() - player.news_updated) / (1000 * 60 * 60 * 24 * 30);
  return ageMonths > STALE_NEWS_MONTHS;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(msg: string) => void} [log]
 */
export async function syncPlayers(supabase, log = () => {}) {
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) throw new Error(`Sleeper fetch failed: ${res.status}`);
  const raw = await res.json();

  const defRows = [];
  const skillPlayers = [];

  for (const player of Object.values(raw)) {
    const fullName =
      player.full_name ??
      [player.first_name, player.last_name].filter(Boolean).join(" ");
    if (!fullName) continue;

    if (player.position === "DEF") {
      defRows.push({
        id: player.player_id,
        full_name: fullName,
        position: player.position,
        team: player.team ?? null,
        // DEF has no search_rank; push them to the bottom of the default
        // seed order (still fully draggable by the user afterward).
        search_rank: SKILL_PLAYER_COUNT + 100,
        injury_status: player.injury_status ?? null,
        injury_body_part: player.injury_body_part ?? null,
        injury_notes: player.injury_notes ?? null,
        practice_participation: player.practice_participation ?? null,
      });
      continue;
    }

    // `status`/`active` are stale for long-retired players (e.g. Julian
    // Edelman shows status "Injured Reserve", active: true years after
    // retiring). `team` catches most of these (nulled out for released
    // free agents), but players who retired directly off a roster (e.g.
    // Ben Roethlisberger) keep a stale `team` too — the `isStale` news
    // check catches that remaining case.
    if (
      FANTASY_POSITIONS.has(player.position) &&
      typeof player.search_rank === "number" &&
      player.team != null &&
      !isStale(player)
    ) {
      skillPlayers.push(player);
    }
  }

  // search_rank has many ties (e.g. several players sharing rank 367), so
  // filtering by "search_rank <= N" pulls in far more than N players.
  // Sort and slice to an actual count instead, breaking ties by player_id
  // for a deterministic order.
  skillPlayers.sort(
    (a, b) => a.search_rank - b.search_rank || a.player_id.localeCompare(b.player_id)
  );
  const topSkillPlayers = skillPlayers.slice(0, SKILL_PLAYER_COUNT);

  const includedIds = new Set(topSkillPlayers.map((p) => p.player_id));
  for (const player of skillPlayers) {
    if (ALWAYS_INCLUDE_IDS.has(player.player_id) && !includedIds.has(player.player_id)) {
      topSkillPlayers.push(player);
    }
  }

  const rows = [
    ...topSkillPlayers.map((player) => ({
      id: player.player_id,
      full_name:
        player.full_name ??
        [player.first_name, player.last_name].filter(Boolean).join(" "),
      position: player.position,
      team: player.team ?? null,
      search_rank: player.search_rank,
      injury_status: player.injury_status ?? null,
      injury_body_part: player.injury_body_part ?? null,
      injury_notes: player.injury_notes ?? null,
      practice_participation: player.practice_participation ?? null,
    })),
    ...defRows,
  ];

  log(`Prepared ${rows.length} players to upsert.`);

  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("players").upsert(batch, { onConflict: "id" });
    if (error) throw error;
    log(`Upserted ${i + batch.length}/${rows.length}`);
  }

  return { total: rows.length };
}
