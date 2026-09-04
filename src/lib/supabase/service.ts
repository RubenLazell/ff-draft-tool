import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role key bypasses Row Level Security entirely. Only use this for
// reads that are safe regardless of who's asking — currently just guest
// mode's default rankings (players + consensus_rankings), which is locked
// down by RLS like every other table but holds no per-user sensitivity: it's
// the same reference data every signed-in user already sees, and guest mode
// has no session to read it with otherwise. Never pass user-controlled
// filters into a query run through this client beyond a fixed enum like
// Format.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
