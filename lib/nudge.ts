import { queue, staffRecipients, type Recipient } from "@/lib/notify";
import { siteUrl } from "@/lib/site-url";
import { backfillProgrammes } from "@/lib/programme";
import { buildTasks, loadToday } from "@/lib/today";
import { composeNudge } from "@/lib/nudge-text";

const SYDNEY = "Australia/Sydney";

/**
 * The end-of-day message.
 *
 * Every screen in this app waits to be opened, by a man who is flat out and
 * does not open things. This is the one thing that reaches out to him: at the
 * end of a working day, what is late, who is waiting, and what falls due in the
 * next two days and so needs a trade booked tonight.
 *
 * It rides on the existing daily job rather than being a third scheduled one —
 * Vercel's free plan allows two, and a third would stop the whole project
 * deploying. That job fires at 07:00 UTC, which is 5pm in winter and 6pm in
 * Sydney's daylight saving: the right end of the day either way.
 *
 * Weekdays only, judged by the date in Sydney rather than UTC. Sent only when
 * there is something to say. Deduped per person per day, so running the job
 * twice sends one.
 */
export async function sendNudge(now = new Date()): Promise<{ sent: boolean; reason?: string; count: number }> {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") {
    return { sent: false, reason: "weekend", count: 0 };
  }
  const day = `${parts.year}-${parts.month}-${parts.day}`;

  // So tonight's list reflects the corrected due dates even if he has not opened
  // the dashboard since they were rebuilt.
  await backfillProgrammes();

  const { houses, dueSoon } = await loadToday();
  const message = composeNudge(buildTasks(houses, dueSoon, now.getTime()), {
    origin: siteUrl(),
    dateLabel: new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(now),
  });
  if (!message) return { sent: false, reason: "nothing needs him", count: 0 };

  const staff = (await staffRecipients()).filter(
    (r): r is Extract<Recipient, { audience: "staff" }> => r.audience === "staff"
  );
  if (staff.length === 0) return { sent: false, reason: "no staff to send to", count: message.count };

  const created = await queue(
    staff.map((recipient) => ({
      recipient,
      dedupeKey: `nudge:${recipient.userId}:${day}`,
      subject: message.subject,
      body: message.body,
    }))
  );

  // `queue` returns only what it actually created, so a second run on the same
  // day says so rather than claiming a message it did not send.
  return created.length > 0
    ? { sent: true, count: message.count }
    : { sent: false, reason: "already sent today", count: message.count };
}
