import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the homeowner's Supabase session on every owner-portal request.
 *
 * The pattern is finicky and the failure is confusing, so it is worth stating:
 * `createServerClient` writes refreshed auth cookies onto the NextResponse it
 * is given. That exact object must be the one returned. Build a different
 * response afterwards — even a redirect — and the refreshed token is silently
 * dropped, producing intermittent logouts that never reproduce locally.
 *
 * So every branch below either returns `response`, or copies its cookies onto
 * whatever it returns instead.
 */
export async function updateOwnerSession(
  request: NextRequest
): Promise<{ response: NextResponse; signedIn: boolean }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser, not getSession: it revalidates the token against Supabase rather
  // than trusting whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, signedIn: Boolean(user) };
}

/** Carries refreshed auth cookies onto a different response, e.g. a redirect. */
export function withCookiesFrom(source: NextResponse, target: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}
