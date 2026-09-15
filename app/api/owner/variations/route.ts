import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { currentHouse, currentViewer } from "@/lib/owner/session";
import {
  getVariationForDecision,
  storeVariationCode,
  countVariationAttempt,
  decideVariation,
} from "@/lib/db/owner";
import { queue, ownersOf, staffRecipients, deliverNow } from "@/lib/notify";
import { recordEvidence, clientIp } from "@/lib/evidence";
import { wrongOrigin } from "@/lib/owner/guard";
import { money } from "@/lib/money";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * An owner agreeing to spend money.
 *
 * Everything else an owner can do here is guarded by the house link alone,
 * which is the right trade for reading photos and asking questions. It is not
 * the right trade for a variation: the link is shared over WhatsApp on purpose,
 * and it routinely ends up with parents, a broker, and whoever else is in the
 * group. A bare "Approve" button on that link means a $6,000 agreement can be
 * tapped by somebody who is not paying for the house.
 *
 * So a decision needs a code, emailed to the address that person registered.
 *
 * What that buys, honestly:
 *   - It stops a casual tap by someone browsing the link over a shoulder.
 *   - It ties the decision to a named inbox he can produce later, alongside the
 *     time and the address it came from.
 *
 * What it does NOT buy: registration is self-service and the email is
 * unverified at the point of registering, so somebody determined, holding the
 * link, can register their own address and use it. Two things cover that, and
 * they are the reason this is proportionate rather than theatre — every
 * registered person on the house is emailed the moment a decision is made, so a
 * wrongful approval surfaces the same hour instead of at final invoice; and he
 * can see and revoke everyone who has registered, on the house page.
 *
 * A code is not a signature. It is a considerably better record than a phone
 * call, which is what this replaces.
 */

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("code"), variationId: z.string().uuid() }),
  z.object({
    action: z.literal("decide"),
    variationId: z.string().uuid(),
    code: z.string().trim().regex(/^\d{6}$/),
    decision: z.enum(["approve", "decline"]),
    reason: z.string().trim().max(500).optional(),
  }),
]);

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Constant-time, so a wrong code cannot be narrowed down by timing it. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (wrongOrigin(req)) {
    return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  }

  const access = await currentHouse();
  if (!access) {
    return NextResponse.json(
      { error: "That link has expired. Ask your builder for a new one." },
      { status: 401 }
    );
  }

  const viewer = await currentViewer(access.houseId);
  if (!viewer?.email) {
    return NextResponse.json(
      { error: "Add your name and email first — that's where the confirmation code goes." },
      { status: 403 }
    );
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "That didn't look right. Try again." }, { status: 400 });
  }
  // Bound to a const so the discriminated union stays narrowed past the awaits
  // below; narrowing on `parsed.data` is dropped at the first call.
  const input = parsed.data;

  // The house comes from the link, never the request, so no variation from
  // another build can be reached from here.
  const variation = await getVariationForDecision(access.houseId, input.variationId);
  if (!variation) {
    return NextResponse.json(
      { error: "That's already been decided, or it's no longer open." },
      { status: 409 }
    );
  }

  if (input.action === "code") {
    const issuedAt = variation.codeExpiresAt
      ? variation.codeExpiresAt.getTime() - CODE_TTL_MS
      : 0;
    if (Date.now() - issuedAt < RESEND_AFTER_MS) {
      return NextResponse.json(
        { error: "A code is already on its way. Give it a minute, then check your email." },
        { status: 429 }
      );
    }

    // randomInt is the cryptographic generator, not Math.random. Six digits is
    // 1 in a million against five attempts and a fifteen-minute window.
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const stored = await storeVariationCode(access.houseId, variation.id, {
      codeHash: hashCode(code),
      sentTo: viewer.email,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    if (!stored) {
      return NextResponse.json({ error: "That's already been decided." }, { status: 409 });
    }

    await queue([
      {
        recipient: {
          audience: "owner",
          ownerId: viewer.id,
          email: viewer.email,
          name: viewer.name,
        },
        // Deliberately unique per issue: this is the one message that must send
        // again every time it is asked for, so it must not dedupe against an
        // earlier one. The resend throttle above is what bounds it.
        dedupeKey: `variation-code:${variation.id}:${Date.now()}`,
        subject: `Your code for variation ${variation.reference}`,
        body: [
          `Your confirmation code is ${code}`,
          ``,
          `It confirms your decision on ${variation.reference} — ${money(variation.amountCents)} at ${variation.house.address}.`,
          `The code expires in 15 minutes.`,
          ``,
          `If you didn't ask for this, don't enter it, and tell your builder — someone else has your build link.`,
        ].join("\n"),
        houseId: access.houseId,
      },
    ]);

    await deliverNow();

    await recordEvidence({
      subject: "variation",
      subjectId: variation.id,
      event: "code_sent",
      actor: { type: "owner", id: viewer.id },
      req,
      payload: { to: viewer.email },
    });

    // The masked address matters: it is how somebody realises the code went to
    // an address that is not theirs.
    const [user, domain] = viewer.email.split("@");
    return NextResponse.json({
      sentTo: `${user.slice(0, 2)}${"•".repeat(Math.max(user.length - 2, 1))}@${domain}`,
    });
  }

  // --- decide ---------------------------------------------------------------

  if (!variation.codeHash || !variation.codeExpiresAt) {
    return NextResponse.json({ error: "Ask for a code first." }, { status: 409 });
  }
  if (variation.codeExpiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "That code has expired. Ask for a new one." },
      { status: 410 }
    );
  }
  if (variation.codeAttempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many wrong codes. Ask for a new one." },
      { status: 429 }
    );
  }
  if (!sameHash(hashCode(input.code), variation.codeHash)) {
    await countVariationAttempt(access.houseId, variation.id);
    return NextResponse.json(
      { error: "That code doesn't match. Check the email and try again." },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const decided =
    input.decision === "approve"
      ? await decideVariation(access.houseId, variation.id, {
          decision: "approve",
          ownerId: viewer.id,
          ip,
        })
      : await decideVariation(access.houseId, variation.id, {
          decision: "decline",
          ownerId: viewer.id,
          ip,
          reason: input.reason ?? null,
        });

  if (!decided) {
    return NextResponse.json({ error: "That's already been decided." }, { status: 409 });
  }

  await recordEvidence({
    subject: "variation",
    subjectId: variation.id,
    event: input.decision === "approve" ? "approved" : "declined",
    actor: { type: "owner", id: viewer.id },
    req,
    payload: {
      reference: variation.reference,
      amountCents: variation.amountCents,
      by: viewer.name,
      email: viewer.email,
      codeSentTo: variation.codeSentTo,
      reason: input.reason ?? null,
    },
  });

  const verb = input.decision === "approve" ? "approved" : "declined";

  // Everyone on the house hears, not just the person who tapped. This is the
  // control that makes a self-registered approver a same-day problem rather
  // than a final-invoice one.
  const [owners, staff] = await Promise.all([ownersOf(access.houseId), staffRecipients()]);

  await queue([
    ...owners.map((recipient) => ({
      recipient,
      dedupeKey: `variation-decided:${variation.id}:${recipient.ownerId}`,
      subject: `${variation.house.address} — variation ${variation.reference} ${verb}`,
      body: [
        `${variation.reference} — ${money(variation.amountCents)} — was ${verb} by ${viewer.name}.`,
        ``,
        variation.description,
        input.reason ? `\nReason given: ${input.reason}` : "",
        ``,
        `If that wasn't you or someone you'd expect, ring your builder today.`,
      ]
        .filter(Boolean)
        .join("\n"),
      houseId: access.houseId,
    })),
    ...staff.map((recipient) => ({
      recipient,
      dedupeKey: `variation-decided-staff:${variation.id}:${
        recipient.audience === "staff" ? recipient.userId : ""
      }`,
      subject: `${variation.house.address}: ${variation.reference} ${verb}`,
      body: [
        `${viewer.name} (${viewer.email}) ${verb} ${variation.reference} — ${money(variation.amountCents)}.`,
        input.reason ? `\nReason: ${input.reason}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      houseId: access.houseId,
    })),
  ]);

  await deliverNow();

  return NextResponse.json({ ok: true, status: verb });
}
