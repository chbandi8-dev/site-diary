"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser-side owner client. Anon key only — RLS does the protecting. */
export function createOwnerBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
