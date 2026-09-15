import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The append-only record behind the two things that end up in a dispute:
 * variations (money) and decisions (who held the build up).
 *
 * The parent rows carry a current status because that is what a page renders.
 * This carries the history, and the history is the part with value — "approved"
 * on its own proves nothing, "approved by Priya at 7:42pm on the 14th from this
 * address, after a code was sent to her own inbox" is an answer.
 *
 * Nothing here is ever updated or deleted. If a variation is superseded, that is
 * another event, not an edit.
 */

type Actor =
  | { type: "owner"; id: string }
  | { type: "staff"; id: string }
  | { type: "system"; id?: undefined };

/**
 * The client address, as far as it can be trusted.
 *
 * Behind Vercel this is a proxy header, so it is spoofable by anyone who cares
 * to. It is recorded because in practice it corroborates — two approvals from
 * the same address as every other visit that owner made is worth something —
 * and never relied on as proof by itself. The code sent to their own inbox is
 * what actually carries the weight.
 */
function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 45) || null;
  return req.headers.get("x-real-ip")?.slice(0, 45) ?? null;
}

export async function recordEvidence(input: {
  subject: "variation" | "decision" | "document";
  subjectId: string;
  event: string;
  actor: Actor;
  req?: NextRequest;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.evidenceEvent.create({
      data: {
        subject: input.subject,
        subjectId: input.subjectId,
        event: input.event,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        ip: input.req ? clientIp(input.req) : null,
        userAgent: input.req?.headers.get("user-agent")?.slice(0, 500) ?? null,
        payload: input.payload ?? undefined,
      },
    });
  } catch {
    // The audit row is valuable, but it is not worth failing an owner's
    // approval over. The parent row still carries the decision and its
    // timestamp; only the corroborating detail is lost.
  }
}

export { clientIp };
