import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { money } from "@/lib/money";
import {
  HardHat, Inbox, Clock, FileSignature, CloudRain, CalendarCheck,
  ArrowRight, Check, CircleAlert, PencilLine, EyeOff, CalendarClock,
} from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * What needs him today.
 *
 * This screen replaced a marketing dashboard that counted projects and
 * testimonials — numbers nobody acts on, on the first page he sees every
 * morning. A builder running twenty-five houses opens this to answer one
 * question: who is about to ring me, and why.
 *
 * So everything here is either something he must do, or something an owner
 * owes him. Counts that imply no action have no place on it.
 */

const DAYS_QUIET_BEFORE_FLAG = 5;

type Task = {
  houseId: string;
  address: string;
  urgency: number;
  label: string;
  detail: string;
  icon: typeof Inbox;
};

export default async function Today() {
  await requireStaff();

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  // Ten days, not seven: a Friday glance should still catch the start of the
  // week after, which is when a booking would have to be made.
  const horizon = new Date(Date.now() + 10 * 86_400_000);

  const houses = await prisma.house.findMany({
    where: { status: { not: "handed_over" } },
    select: {
      id: true,
      address: true,
      suburb: true,
      waitingOn: true,
      nextWeek: true,
      nextWeekSetAt: true,
      stages: {
        where: { status: "in_progress" },
        select: { name: true },
        orderBy: { position: "asc" },
      },
      updates: {
        where: { publishedAt: { not: null }, deletedAt: null },
        select: { occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
      decisions: {
        where: { status: "open" },
        select: { id: true, question: true, dueDate: true },
      },
      variations: {
        where: { status: "sent" },
        select: { id: true, reference: true, amountCents: true },
      },
      ownerReports: {
        where: { status: { in: ["submitted", "acknowledged"] } },
        select: { id: true, body: true, owner: { select: { name: true } } },
      },
      weatherDays: {
        where: { workLost: true, date: { gte: weekAgo } },
        select: { id: true },
      },
      owners: {
        where: { revokedAt: null },
        select: { lastSeenAt: true, owner: { select: { name: true, email: true } } },
      },
      _count: {
        select: {
          updates: { where: { publishedAt: null, deletedAt: null } },
          owners: { where: { revokedAt: null } },
        },
      },
    },
    orderBy: { address: "asc" },
  });

  const now = Date.now();

  const [updatesThisWeek, dueSoon] = await Promise.all([
    prisma.update.count({ where: { publishedAt: { gte: weekAgo }, deletedAt: null } }),
    // What the programme says is due shortly, read from the stored due dates
    // rather than recomputed: twenty-five forecasts on a dashboard render is
    // not a dashboard. One query across every house, not one per house.
    prisma.houseStage.findMany({
      where: {
        dueBy: { not: null, lte: horizon },
        status: { notIn: ["complete", "not_applicable"] },
        house: { status: { not: "handed_over" } },
      },
      select: {
        id: true,
        name: true,
        dueBy: true,
        houseId: true,
        house: { select: { address: true, lotNumber: true } },
      },
      orderBy: { dueBy: "asc" },
      take: 40,
    }),
  ]);

  // Everything that wants him. Built per house, then flattened and sorted, so
  // the list reads as a to-do rather than a directory he has to scan.
  const tasks: Task[] = [];

  for (const h of houses) {
    for (const r of h.ownerReports) {
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 1,
        label: `${r.owner.name} is waiting on an answer`,
        detail: r.body.length > 90 ? `${r.body.slice(0, 90)}…` : r.body,
        icon: Inbox,
      });
    }

    for (const d of h.decisions) {
      const overdue = d.dueDate && d.dueDate.getTime() < now;
      if (!overdue) continue;
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 2,
        label: "A decision is overdue",
        detail: `${d.question} — chase them`,
        icon: CircleAlert,
      });
    }

    if (h._count.updates > 0) {
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 3,
        label: `${h._count.updates} update${h._count.updates === 1 ? "" : "s"} never sent`,
        detail: "Written but still sitting as a draft",
        icon: PencilLine,
      });
    }

    // Somebody he has been writing to who has stopped reading. Ranked below
    // his own overdue work: it is a nudge, not a job, and an owner who is not
    // looking is a phone call he can get ahead of rather than one he has caused.
    for (const link of h.owners) {
      if (!link.owner.email) continue;
      const days = link.lastSeenAt
        ? Math.floor((now - link.lastSeenAt.getTime()) / 86_400_000)
        : null;
      if (days !== null && days < 21) continue;
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 5,
        label:
          days === null
            ? `${link.owner.name} has never opened their page`
            : `${link.owner.name} hasn't looked in ${Math.floor(days / 7)} weeks`,
        detail: "Worth a call or a photo — they may not know what's happening",
        icon: EyeOff,
      });
    }

    const last = h.updates[0]?.occurredAt;
    const daysQuiet = last ? Math.floor((now - last.getTime()) / 86_400_000) : null;
    if (daysQuiet === null || daysQuiet >= DAYS_QUIET_BEFORE_FLAG) {
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 4,
        label: daysQuiet === null ? "Never updated" : `Quiet for ${daysQuiet} days`,
        detail:
          h._count.owners > 0
            ? "The owners have heard nothing"
            : "No owners registered on this house yet",
        icon: Clock,
      });
    }
  }

  // The programme's own to-do list. Derived rather than kept by hand: a manual
  // list is one more thing to feed and goes stale in a fortnight like every
  // other one. These cannot, because they come from dates already held.
  for (const stage of dueSoon) {
    if (!stage.dueBy) continue;
    const days = Math.round((stage.dueBy.getTime() - now) / 86_400_000);
    tasks.push({
      houseId: stage.houseId,
      address: stage.house.lotNumber ? `Lot ${stage.house.lotNumber}` : stage.house.address,
      // Past its promised date ranks with his own overdue work. Merely coming
      // up sits below it — that is a heads-up, not a job.
      urgency: days < 0 ? 2 : 6,
      label:
        days < 0
          ? `${stage.name} is ${Math.abs(days)} days past due`
          : days === 0
            ? `${stage.name} is due today`
            : `${stage.name} due in ${days} day${days === 1 ? "" : "s"}`,
      detail:
        days < 0
          ? "Behind the date you promised — this is where the slip is"
          : "To hold the handover date you've given them",
      icon: CalendarClock,
    });
  }

  tasks.sort((a, b) => a.urgency - b.urgency || a.address.localeCompare(b.address));

  // Things owners owe him. Separate from his own list on purpose: mixing them
  // makes his to-do look longer than it is, and these need a nudge, not work.
  const waitingOnOwners = houses.flatMap((h) => [
    ...h.decisions
      .filter((d) => !d.dueDate || d.dueDate.getTime() >= now)
      .map((d) => ({
        houseId: h.id,
        address: h.address,
        what: d.question,
        note: d.dueDate
          ? `due ${d.dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`
          : "no date set",
      })),
    ...h.variations.map((v) => ({
      houseId: h.id,
      address: h.address,
      what: `${v.reference} — ${money(v.amountCents)}`,
      note: "not approved yet",
    })),
  ]);

  const wetThisWeek = houses.reduce((n, h) => n + h.weatherDays.length, 0);
  const lookAheadCutoff = now - 10 * 86_400_000;
  const nextWeekWritten = houses.filter(
    (h) => h.nextWeek && h.nextWeekSetAt && h.nextWeekSetAt.getTime() >= lookAheadCutoff
  ).length;

  const needsHim = new Set(tasks.map((t) => t.houseId)).size;

  const tiles = [
    { label: "Active houses", value: houses.length, icon: HardHat, href: "/admin/houses", tone: "plain" },
    { label: "Need you", value: needsHim, icon: CircleAlert, href: "/admin/houses", tone: needsHim > 0 ? "alert" : "plain" },
    { label: "Owner questions", value: houses.reduce((n, h) => n + h.ownerReports.length, 0), icon: Inbox, href: "/admin/reports", tone: "plain" },
    { label: "Waiting on owners", value: waitingOnOwners.length, icon: FileSignature, href: "/admin/houses", tone: "plain" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-white">Today</h1>
        <p className="mt-1 text-white/45">
          {tasks.length === 0
            ? "Nothing outstanding. Every house is up to date."
            : `${tasks.length} thing${tasks.length === 1 ? "" : "s"} want you, across ${needsHim} house${needsHim === 1 ? "" : "s"}.`}
        </p>
      </header>

      <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, href, tone }) => (
          <Link
            key={label}
            href={href}
            className={
              "group rounded-lg border p-5 transition-colors " +
              (tone === "alert" && value > 0
                ? "border-gold/25 bg-gold/[0.06] hover:border-gold/50"
                : "border-white/5 bg-dark-card hover:border-white/15")
            }
          >
            <Icon
              size={16}
              aria-hidden="true"
              className={tone === "alert" && value > 0 ? "text-gold" : "text-white/30"}
            />
            <p
              className={
                "mt-3 font-display text-3xl " +
                (tone === "alert" && value > 0 ? "text-gold" : "text-white")
              }
            >
              {value}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-white/40 group-hover:text-white/60">
              {label}
              <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
            </p>
          </Link>
        ))}
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Needs you
        </h2>

        {tasks.length > 0 ? (
          <ul className="flex flex-col">
            {tasks.map((t, i) => (
              <li key={`${t.houseId}-${i}`}>
                <Link
                  href={`/admin/houses/${t.houseId}`}
                  className="group flex items-start gap-3 border-t border-white/5 py-3.5 transition-colors hover:bg-white/[0.02]"
                >
                  <t.icon
                    size={15}
                    aria-hidden="true"
                    className={
                      "mt-0.5 flex-none " + (t.urgency <= 2 ? "text-gold" : "text-white/30")
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/85">
                      {t.label}
                      <span className="text-white/35"> · {t.address}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/40">{t.detail}</p>
                  </div>
                  <ArrowRight
                    size={14}
                    aria-hidden="true"
                    className="mt-0.5 flex-none text-white/0 transition-colors group-hover:text-white/40"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-white/5 bg-dark-card px-5 py-4 text-sm text-white/45">
            <Check size={14} aria-hidden="true" className="text-gold" />
            Nothing outstanding. Every owner has heard from you recently.
          </p>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
            Waiting on owners
          </h2>
          {waitingOnOwners.length > 0 ? (
            <ul className="flex flex-col">
              {waitingOnOwners.map((w, i) => (
                <li key={`${w.houseId}-${i}`}>
                  <Link
                    href={`/admin/houses/${w.houseId}`}
                    className="block border-t border-white/5 py-3 transition-colors hover:bg-white/[0.02]"
                  >
                    <p className="truncate text-sm text-white/80">{w.what}</p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {w.address} · {w.note}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-4 text-sm text-white/45">
              Nothing outstanding from any owner.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
            This week
          </h2>
          <dl className="flex flex-col">
            <div className="flex items-baseline justify-between border-t border-white/5 py-3">
              <dt className="text-sm text-white/60">Updates sent</dt>
              <dd className="font-display text-xl text-white">{updatesThisWeek}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-white/5 py-3">
              <dt className="flex items-center gap-2 text-sm text-white/60">
                <CloudRain size={13} aria-hidden="true" className="text-white/30" />
                Days lost to weather
              </dt>
              <dd className="font-display text-xl text-white">{wetThisWeek}</dd>
            </div>
            <Link
              href="/admin/friday"
              className="group flex items-baseline justify-between border-t border-white/5 py-3 transition-colors hover:bg-white/[0.02]"
            >
              <span className="flex items-center gap-2 text-sm text-white/60">
                <CalendarCheck size={13} aria-hidden="true" className="text-white/30" />
                Next week written
              </span>
              <span
                className={
                  "font-display text-xl " +
                  (nextWeekWritten === houses.length ? "text-gold" : "text-white")
                }
              >
                {nextWeekWritten}
                <span className="text-sm text-white/35"> / {houses.length}</span>
              </span>
            </Link>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-white/30">
            The Friday email goes out either way. The look-ahead is the part owners
            can&apos;t see for themselves.
          </p>
        </section>
      </div>
    </div>
  );
}
