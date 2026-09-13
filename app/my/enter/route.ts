import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

/**
 * Where an access link lands.
 *
 * Exchanges the one-time token for a session and sends them to their house. The
 * session that results is long-lived — they stay signed in on that device until
 * they clear their browsing data — which is the whole point: a homeowner should
 * tap the link once, months ago, and still be able to open their build today.
 *
 * The cookies Supabase sets during the exchange must ride on the response that
 * is actually returned, so the redirect is built first and handed to the client
 * rather than created afterwards.
 */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");

  const failed = NextResponse.redirect(new URL("/my/sign-in?expired=1", req.url));
  if (!tokenHash) return failed;

  const response = NextResponse.redirect(new URL("/my", req.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === "invite" ? "invite" : "magiclink",
  });

  // Almost always a link that was already used — commonly by a mail scanner
  // following it before the person did. The sign-in page explains that and
  // offers the code instead, rather than showing a dead end.
  if (error) return failed;

  return response;
}
