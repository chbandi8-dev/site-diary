import { NextRequest, NextResponse } from "next/server";
import { redeemToken, rememberLink } from "@/lib/owner/session";

export const dynamic = "force-dynamic";

/**
 * Where a house link lands. This is the entire sign-in.
 *
 * The token sits in the path rather than the query string on purpose: query
 * strings reach server logs, analytics and referrer headers far more readily.
 * After redeeming it we redirect to a clean URL, so the token stops showing in
 * the address bar, in screenshots, and in anything shown over a shoulder.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const access = await redeemToken(params.token);
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  if (!access) {
    return NextResponse.redirect(new URL("/my/no-access", base));
  }

  rememberLink(params.token);

  const response = NextResponse.redirect(new URL("/my", base));
  // Stops the token leaking to a third party through an outbound click.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
