import type { Task } from "./today-tasks";

/**
 * The end-of-day message to him, as words.
 *
 * Kept free of the database so it can be tested on its own, and so what the
 * message says is decided in one readable place.
 *
 * Two things go in it, because they are the two things that cost him a day if
 * they are not caught tonight:
 *
 *  - what is late or has somebody waiting on him — the owner who asked a
 *    question and heard nothing, the stage past the date he promised;
 *  - what falls due in the next two days. Nothing in this app knows whether a
 *    trade has been booked for it, so it asks, which is the part of the
 *    evening that used to live in his head.
 *
 * And when neither is true it says nothing. A message that arrives every day
 * regardless is a message that is read on none of them.
 */

const CAP = 8;

export function composeNudge(
  tasks: Task[],
  opts: { origin: string; dateLabel: string }
): { subject: string; body: string; count: number } | null {
  const late = tasks.filter((t) => t.urgency <= 2);
  const soon = tasks.filter((t) => t.kind === "due" && t.days !== undefined && t.days >= 0 && t.days <= 2);
  if (late.length === 0 && soon.length === 0) return null;

  const week = tasks.filter((t) => t.urgency === 3 || t.urgency === 4).length;

  const list = (items: Task[]) => {
    const lines = items.slice(0, CAP).map((t) => {
      const head = `• ${t.label} — ${t.address}`;
      // An owner's own words are worth reading; a stage's explanation is not.
      return t.kind === "report" ? `${head}\n   "${t.detail}"` : head;
    });
    if (items.length > CAP) lines.push(`+ ${items.length - CAP} more in the app`);
    return lines.join("\n");
  };

  const sections: string[] = [];
  if (late.length > 0) sections.push(`LATE, OR WAITING ON YOU (${late.length})\n${list(late)}`);
  if (soon.length > 0)
    sections.push(`DUE IN THE NEXT TWO DAYS — IS IT BOOKED? (${soon.length})\n${list(soon)}`);

  const count = late.length + soon.length;
  const body = [
    `${opts.dateLabel} — here's what needs you.`,
    "",
    sections.join("\n\n"),
    "",
    week > 0 ? `Also this week: ${week} to close out.` : "",
    `Open it: ${opts.origin}/admin`,
  ]
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n");

  return { subject: `Evening check — ${count} need${count === 1 ? "s" : ""} you`, body, count };
}
