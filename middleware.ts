import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { updateOwnerSession, withCookiesFrom } from "@/lib/supabase/middleware";

/**
 * Next allows exactly one middleware, and this app runs two authentication
 * systems that must not be confused for one another:
 *
 *   /admin/*  staff, NextAuth credentials. Reads via Prisma, which bypasses
 *             row-level security — correct here, catastrophic anywhere else.
 *   /my/*     homeowners, Supabase email OTP. Reads via supabase-js under RLS.
 *
 * Routing is by path prefix only. A handler that accepts either session and
 * takes a house id from the request would be an IDOR for anyone holding any
 * staff session — a one-person risk today, a real vulnerability the moment a
 * second PM or an office account exists.
 *
 * Note for testing: when he is logged into /admin in the same browser, his
 * NextAuth cookie is sent to /my as well. Owner isolation must therefore be
 * checked in a private window, or it appears to work for the wrong reason.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/my")) {
    const { response, signedIn } = await updateOwnerSession(request);

    const isAuthPage = pathname.startsWith("/my/sign-in");
    if (!signedIn && !isAuthPage) {
      const signIn = new URL("/my/sign-in", request.url);
      signIn.searchParams.set("next", pathname);
      return withCookiesFrom(response, NextResponse.redirect(signIn));
    }
    if (signedIn && isAuthPage) {
      return withCookiesFrom(response, NextResponse.redirect(new URL("/my", request.url)));
    }
    return response;
  }

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything under /admin and /my, minus the things that must not pay the
     * cost of a session check: Next's own assets, the auth callbacks, and
     * static files.
     */
    "/admin/:path*",
    "/my/:path*",
  ],
};
