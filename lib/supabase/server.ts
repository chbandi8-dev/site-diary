import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for the OWNER side of the app.
 *
 * Uses the anon key plus the signed-in homeowner's JWT, so every query is
 * subject to row-level security. This is the only client that should ever
 * touch a request made by a homeowner — see supabase/migrations/0001_rls.sql.
 */
export function createOwnerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled in middleware instead.
          }
        },
      },
    }
  );
}
