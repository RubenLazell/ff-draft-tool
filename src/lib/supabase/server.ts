import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Next.js patches global fetch to cache/dedupe requests within a
      // render. Two identical Supabase reads in the same request (e.g.
      // read-then-write-then-read-again) would otherwise silently return
      // the first (stale) result instead of hitting the DB again.
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component - safe to ignore because
            // middleware refreshes the session on every request.
          }
        },
      },
    }
  );
}
