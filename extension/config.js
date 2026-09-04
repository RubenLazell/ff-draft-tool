// Shared constants across popup.js, background.js, and content.js. Loaded
// as a plain classic script before the others (see manifest.json /
// popup.html), so these top-level consts are just available globally in
// whichever context includes it — no bundler, no imports.
//
// SUPABASE_URL / SUPABASE_ANON_KEY are the same public values already
// shipped in the web app's browser bundle (NEXT_PUBLIC_-prefixed there) —
// safe to embed here for the same reason.
const SUPABASE_URL = "https://oyfaaevlfhpklpqltbhr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_u8kvLJbGR1zNFX2NmMas9g_kxdczole";

// Mirrors src/lib/rankings.ts — duplicated here since this extension has
// no build step and can't import from the Next.js TS project.
const FORMATS = ["PPR", "HALF_PPR", "STANDARD", "SUPERFLEX", "DYNASTY"];
const FORMAT_LABELS = {
  PPR: "PPR",
  HALF_PPR: "Half-PPR",
  STANDARD: "Standard",
  SUPERFLEX: "Superflex",
  DYNASTY: "Dynasty",
};

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

const DEFAULT_TOP_OVERALL = 15;
const DEFAULT_TOP_PER_POSITION = 5;

// Shared by content.js and every site adapter (adapters/*.js) for matching
// a drafted-player name from the page against a fullName from our data —
// moved here rather than duplicated per-adapter since it's not site-specific.
function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[.'-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
