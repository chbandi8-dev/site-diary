import { prisma } from "@/lib/prisma";
import type { NotifyAudience, NotifyChannel } from "@prisma/client";
import { sendEmail } from "./email";

/**
 * Notifications, in both directions.
 *
 * Owners hear when something happens at their house. He hears when an owner
 * raises something — otherwise a report sits unread, which is worse than the
 * WhatsApp thread this replaces.
 *
 * Queue first, send second, always. A send that fails must leave a row behind
 * saying so: an owner whose address bounces silently is an owner who "never
 * gets told anything", which is the exact complaint this exists to fix.
 *
 * `dedupeKey` is built from what is being said and who to — never from a
 * timestamp. A retried job must not text twenty-five owners a second time.
 */

export type Recipient =
  | { audience: "owner"; ownerId: string; email: string; name: string }
  | { audience: "staff"; userId: string; email: string; name: string };

export type QueuedNotification = {
  recipient: Recipient;
  dedupeKey: string;
  subject: string;
  body: string;
  houseId?: string;
  updateId?: string;
  reportId?: string;
  channel?: NotifyChannel;
};

/**
 * Records intent to notify, and returns the rows that were newly created.
 * Rows that already existed are skipped, so calling this twice is harmless.
 */
export async function queue(notifications: QueuedNotification[]): Promise<string[]> {
  const created: string[] = [];

  for (const n of notifications) {
    const existing = await prisma.notificationLog.findUnique({
      where: { dedupeKey: n.dedupeKey },
      select: { id: true },
    });
    if (existing) continue;

    const row = await prisma.notificationLog.create({
      data: {
        audience: n.recipient.audience as NotifyAudience,
        ownerId: n.recipient.audience === "owner" ? n.recipient.ownerId : undefined,
        userId: n.recipient.audience === "staff" ? n.recipient.userId : undefined,
        houseId: n.houseId,
        updateId: n.updateId,
        reportId: n.reportId,
        channel: n.channel ?? "email",
        dedupeKey: n.dedupeKey,
        subject: n.subject,
        body: n.body || null,
        status: "queued",
      },
      select: { id: true },
    });
    created.push(row.id);
  }

  return created;
}

/**
 * Attempts delivery of everything still queued, composing each message from the
 * row it is attached to. Safe to call repeatedly and safe to call from a cron:
 * a row only leaves `queued` once the provider has accepted it.
 *
 * Returns counts rather than throwing, so one bad address cannot stall the
 * other twenty-four.
 */
export async function flush(limit = 100): Promise<{ sent: number; failed: number }> {
  const pending = await prisma.notificationLog.findMany({
    where: { status: "queued", channel: "email" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      audience: true,
      subject: true,
      body: true,
      owner: { select: { email: true, name: true } },
      user: { select: { email: true, name: true } },
      update: { select: { body: true } },
      report: { select: { body: true, replyBody: true, kind: true } },
      house: { select: { address: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const to = row.owner?.email ?? row.user?.email;
    if (!to) {
      await markFailed(row.id, "No email address on the recipient");
      failed++;
      continue;
    }

    try {
      const providerId = await sendEmail({
        to,
        subject: row.subject ?? "An update on your build",
        body: compose(row),
      });
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date(), providerId },
      });
      sent++;
    } catch (cause) {
      await markFailed(row.id, cause instanceof Error ? cause.message : "Unknown send failure");
      failed++;
    }
  }

  return { sent, failed };
}

function markFailed(id: string, error: string) {
  return prisma.notificationLog.update({ where: { id }, data: { status: "failed", error } });
}

type PendingRow = {
  audience: NotifyAudience;
  body: string | null;
  update: { body: string } | null;
  report: { body: string; replyBody: string | null; kind: string } | null;
  house: { address: string } | null;
  owner: { name: string } | null;
};

/**
 * The email body. Deliberately plain text for now — it renders identically
 * everywhere, never lands in a promotions tab, and reads fine on a phone.
 */
function compose(row: PendingRow): string {
  const link = `${process.env.NEXTAUTH_URL ?? ""}/my`;

  // Anything composed at queue time carries its own text.
  if (row.body) return `${row.body}\n\nSee the photos and full history: ${link}`;

  if (row.audience === "staff" && row.report) {
    const who = row.owner?.name ?? "An owner";
    return [
      `${who} raised something at ${row.house?.address ?? "one of your houses"}:`,
      "",
      row.report.body,
      "",
      `Open it here: ${link}`,
    ].join("\n");
  }

  if (row.report?.replyBody) {
    return [
      row.report.replyBody,
      "",
      "— in reply to:",
      row.report.body,
      "",
      `Your build: ${link}`,
    ].join("\n");
  }

  return [row.update?.body ?? "", "", `See the photos and full history: ${link}`].join("\n");
}

/** Everyone who should hear about something at this house. */
export async function ownersOf(houseId: string): Promise<Recipient[]> {
  const links = await prisma.houseOwner.findMany({
    where: { houseId, revokedAt: null },
    select: { owner: { select: { id: true, name: true, email: true, notifyByEmail: true } } },
  });

  // Plenty of people open the link and never register, which is fine — they
  // simply check the page. Only those who gave us an address get emailed.
  return links
    .filter((l) => l.owner.notifyByEmail && Boolean(l.owner.email))
    .map((l) => ({
      audience: "owner" as const,
      ownerId: l.owner.id,
      email: l.owner.email!,
      name: l.owner.name,
    }));
}

/** Staff who should hear when an owner raises something. */
export async function staffRecipients(): Promise<Recipient[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["admin", "pm"] } },
    select: { id: true, name: true, email: true },
  });

  return users.map((u) => ({
    audience: "staff" as const,
    userId: u.id,
    email: u.email,
    name: u.name ?? "there",
  }));
}
