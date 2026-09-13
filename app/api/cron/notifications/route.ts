import { NextRequest, NextResponse } from "next/server";
import { flush } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Drains the notification queue.
 *
 * Runs on a schedule and is safe to run more often than needed — every row is
 * deduped and only leaves `queued` once the provider has accepted it. Authorised
 * by a shared secret rather than a session, since no human calls it.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sent, failed } = await flush();
  return NextResponse.json({ sent, failed });
}
