// Standalone script — never import this from src/. It uses the
// service-role key, which must never reach the browser bundle.
// Run via: npm run sync:consensus
//
// Just the CLI entrypoint now — the actual logic lives in
// src/lib/sync/consensusCore.mjs, shared with the Vercel Cron route that
// runs this automatically (src/app/api/cron/sync-data/route.ts).

import { createClient } from "@supabase/supabase-js";
import { syncConsensusRankings } from "../src/lib/sync/consensusCore.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

syncConsensusRankings(supabase, console.log)
  .then(() => console.log("Done."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
