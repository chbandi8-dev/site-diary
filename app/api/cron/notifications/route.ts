import { NextRequest, NextResponse } from "next/server";
import { flush } from "@/lib/notify";
import { sendNudge } from "@/lib/nudge";

export const dynamic = "force-dynamic";

/**
 * Drains the notification queue.
 *
 * Runs on a schedule and is safe to run more often than needed — every row is
 * deduped and only leaves `queued` once the provider has accepted it. Authorised
 * by a shared secret rather than a session, since no human calls it.
 *
 * It also queues his end-of-day message first, so it leaves in the same run. See
 * lib/nudge.ts for why it lives here and not in a job of its own.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Never allowed to stop the queue draining: owners' updates matter more than
  // a message to him, and one failing must not take the other with it.
  let nudge: Awaited<ReturnType<typeof sendNudge>> | null = null;
  try {
    nudge = await sendNudge();
  } catch (cause) {
    console.error("evening message failed", cause);
  }

  const { sent, failed } = await flush();
  return NextResponse.json({ sent, failed, nudge });
}

/**
 * Both verbs. Vercel Cron issues GET; Supabase pg_net is usually POST. Exposing
 * only one of them fails silently forever — the queue simply never drains and
 * nothing anywhere says so.
 */
export const GET = run;
export const POST = run;
