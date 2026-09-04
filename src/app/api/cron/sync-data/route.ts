// Vercel Cron hits this on a schedule (see vercel.json) — runs the same
// player/injury and consensus-rankings sync the manual npm scripts do,
// via the shared core in src/lib/sync/. Guarded by CRON_SECRET, which
// Vercel automatically sends as `Authorization: Bearer <CRON_SECRET>` for
// its own scheduled invocations once that env var is set; without a
// matching header this refuses to run, so a random visitor can't trigger
// (or spam) a resync.
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { syncPlayers } from "@/lib/sync/playersCore.mjs";
import { syncConsensusRankings } from "@/lib/sync/consensusCore.mjs";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const logs: string[] = [];
  const log = (msg: string) => logs.push(msg);

  try {
    const players = await syncPlayers(supabase, log);
    const consensus = await syncConsensusRankings(supabase, log);
    return NextResponse.json({ ok: true, players, consensus, logs });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), logs },
      { status: 500 }
    );
  }
}
