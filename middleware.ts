import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Only the staff side is gated here.
 *
 * Owner pages are not: access comes from the house link, which is checked in
 * the page itself against a live, unrevoked record. There is no owner session to
 * refresh and no second auth system to keep apart from this one.
 */
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  const login = new URL("/admin/login", request.url);
  login.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // "/admin" itself, NOT just "/admin/*". The previous pattern required the
    // trailing slash, so the dashboard — which renders customer names, emails
    // and message bodies — was served to anyone who asked.
    "/admin",
    "/admin/((?!login).*)",
  ],
};
