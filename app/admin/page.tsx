import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { money } from "@/lib/money";
import { currentPhase, hasProgramme, overdueStages, phaseOrder } from "@/lib/phases";
import {
  HardHat, Inbox, Clock, FileSignature, CloudRain, CalendarCheck,
  ArrowRight, Check, CircleAlert, PencilLine, EyeOff, CalendarClock,
  TrendingUp, Layers, MessageSquare, Plus, ClipboardCheck,
} from "lucide-react";
import { backfillProgrammes } from "@/lib/programme";
import { buildTasks, loadToday, type Task, type TaskKind } from "@/lib/today";
import { composeNudge } from "@/lib/nudge-text";
import { siteUrl } from "@/lib/site-url";
import ShareList from "@/components/admin/ShareList";

export const dynamic = "force-dynamic";

/**
 * What needs him today, and where the whole portfolio has got to.
 *
 * This screen replaced a marketing dashboard that counted projects and
 * testimonials — numbers nobody acts on, on the first page he sees every
 * morning. A builder running twenty-five houses opens this to answer one
 * question: who is about to ring me, and why.
 *
 * Three rules hold this layout together:
 *
 * 1. Every number on it is a link, and the link lands on the page where that
 *    number can be acted on. A count that leads nowhere is decoration.
 * 2. Nothing is a count for its own sake. The lead figure is the size of his
 *    to-do list; the bars are the shape of his portfolio; the rest is either
 *    something he must do or something an owner owes him.
 * 3. Empty is not blank. Every section that can be empty says what to do next
 *    instead of showing nothing, because on day one all of them are.
 */

/**
 * Two fills, both stepped for the #1C1C1E surface and validated together
 * (lightness band, chroma floor, CVD separation, contrast): deutan ΔE 8.4,
 * normal-vision ΔE 18.8, both clear of 3:1 on the surface. `ON_PROGRAMME` is a
 * darker step of the brand gold — #C9A84C itself is too light for a fill this
 * size on a near-black surface, and glares. Do not substitute either by eye;
 * re-run the palette validator if they ever change.
 */
const ON_PROGRAMME = "#B08F3E";
const BEHIND = "#d03b3b";
const NO_DATES = "rgba(255,255,255,0.10)";

const TASK_ICON: Record<TaskKind, typeof Inbox> = {
  report: Inbox,
  decision: CircleAlert,
  draft: PencilLine,
  unseen: EyeOff,
  quiet: Clock,
  due: CalendarClock,
  inspection: ClipboardCheck,
};

type Band = { title: string; note: string; tasks: Task[]; show: number };

export default async function Today() {
  await requireStaff();

  const now = Date.now();

  // The one read the page cannot draw without. The two update counts and the
  // catch-up for older houses used to ride along here and hold the whole page
  // back; they now arrive behind it (see UpdatesTile and CatchUp), so the page
  // shows after this single read.
  const { houses, dueSoon, pace } = await loadToday();

  // ── The portfolio, rolled up ────────────────────────────────────────────
  // One row per phase of the build, split by whether the house is holding the
  // dates he promised. This is the only thing on the screen that answers "how
  // is the whole book going" rather than "what do I do next", and it is a bar
  // chart because the shape — everything bunched at frame, nothing at fit-out —
  // is the part he reads in half a second.

  const order = phaseOrder(houses.flatMap((h) => h.stages));
  const buckets = new Map<string, { onTrack: number; behind: number; noDates: number }>();
  let behindTotal = 0;
  let onTrackTotal = 0;

  for (const h of houses) {
    const phase = currentPhase(h.stages);
    if (!phase) continue;
    const bucket = buckets.get(phase) ?? { onTrack: 0, behind: 0, noDates: 0 };
    if (!hasProgramme(h.stages)) bucket.noDates += 1;
    else if (overdueStages(h.stages, now).length > 0) {
      bucket.behind += 1;
      behindTotal += 1;
    } else {
      bucket.onTrack += 1;
      onTrackTotal += 1;
    }
    buckets.set(phase, bucket);
  }

  const phaseRows = order
    .map((name) => {
      const b = buckets.get(name) ?? { onTrack: 0, behind: 0, noDates: 0 };
      return { name, ...b, total: b.onTrack + b.behind + b.noDates };
    })
    .filter((row) => row.total > 0);

  const widest = Math.max(1, ...phaseRows.map((r) => r.total));
  const onProgramme = onTrackTotal + behindTotal;

  // ── Everything that wants him ───────────────────────────────────────────
  // One definition, shared with the evening message — see lib/today.ts.
  const tasks = buildTasks(houses, dueSoon, now, pace);
  // The same list the evening email carries, so it can go out by WhatsApp when
  // the email does not arrive. Null when nothing is late or due.
  const shareable = composeNudge(tasks, {
    origin: siteUrl(),
    dateLabel: new Date().toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Australia/Sydney",
    }),
  });

  // Three bands rather than one long list. Twenty-two rows in a flat column all
  // look equally urgent, so the list stops being read at about row six; split
  // by when it has to happen, the top band is short enough to actually clear.
  const bands: Band[] = [
    {
      title: "Today",
      note: "Late, or somebody is waiting on you",
      // Uncapped on purpose. This is the band he is meant to clear, and a
      // "+4 more" on it would hide the exact four that matter.
      tasks: tasks.filter((t) => t.urgency <= 2),
      show: Number.POSITIVE_INFINITY,
    },
    {
      title: "This week",
      note: "Yours to close out before Friday",
      tasks: tasks.filter((t) => t.urgency === 3 || t.urgency === 4),
      show: 6,
    },
    {
      title: "Coming up",
      note: "Nothing to do yet — worth knowing about",
      tasks: tasks.filter((t) => t.urgency >= 5),
      // Five. Across twenty-five houses this band runs to thirty rows, and a
      // thirty-row list of things that need nothing today is how the two rows
      // above it stop being read.
      show: 5,
    },
  ].filter((b) => b.tasks.length > 0);

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
  const questions = houses.reduce((n, h) => n + h.ownerReports.length, 0);
  const oldestQuestion = houses
    .flatMap((h) => h.ownerReports.map((r) => r.createdAt.getTime()))
    .sort((a, b) => a - b)[0];
  const oldestQuestionDays =
    oldestQuestion === undefined ? null : Math.floor((now - oldestQuestion) / 86_400_000);

  const estates = new Map<string, { name: string; lots: number }>();
  for (const h of houses) {
    if (!h.development) continue;
    const seen = estates.get(h.development.id) ?? { name: h.development.name, lots: 0 };
    seen.lots += 1;
    estates.set(h.development.id, seen);
  }

  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Sydney",
  });

  if (houses.length === 0) return <FirstRun today={today} />;

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">
            {today}
          </p>
          <h1 className="mt-1 font-display text-3xl text-white">Today</h1>
        </div>
        <Link
          href="/admin/houses"
          className="group inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:border-white/25 hover:text-white"
        >
          All houses
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      {/* ── The lead figure ───────────────────────────────────────────────
          One number, big, in the sans everything else is set in. It is the
          length of his to-do list, because that is the only thing he opens
          this page to find out. The three rows beside it break it down and
          each one jumps to the band below. */}
      <section className="mb-4 grid gap-6 rounded-xl border border-white/[0.07] bg-dark-card p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:p-7">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">
            Needs you
          </p>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="text-[56px] font-semibold leading-none text-white sm:text-[64px]">
              {tasks.length}
            </span>
            {tasks.length > 0 && (
              <span className="text-sm leading-tight text-white/45">
                across {needsHim} house{needsHim === 1 ? "" : "s"}
              </span>
            )}
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/45">
            {tasks.length === 0
              ? "Nothing outstanding. Every house is up to date and every owner has heard from you."
              : "Everything below is either yours to do, or somebody waiting on you."}
          </p>
          {shareable && <ShareList message={shareable.body} />}
        </div>

        <div className="flex flex-col justify-center gap-1 sm:border-l sm:border-white/[0.07] sm:pl-7">
          {bands.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-white/45">
              <Check size={15} aria-hidden="true" style={{ color: ON_PROGRAMME }} />
              Nothing in the diary.
            </p>
          ) : (
            bands.map((band) => (
              <a
                key={band.title}
                href={`#band-${slug(band.title)}`}
                className="group flex min-h-[44px] items-center justify-between gap-4 rounded-lg px-3 transition-colors hover:bg-white/[0.04]"
              >
                <span className="flex items-center gap-2.5 text-sm text-white/70 group-hover:text-white">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 flex-none rounded-full"
                    style={{
                      backgroundColor: band.title === "Today" ? BEHIND : ON_PROGRAMME,
                      opacity: band.title === "Coming up" ? 0.4 : 1,
                    }}
                  />
                  {band.title}
                </span>
                <span className="font-mono text-sm tabular-nums text-white/85">
                  {band.tasks.length}
                </span>
              </a>
            ))
          )}
        </div>
      </section>

      {/* ── The headline numbers ──────────────────────────────────────────
          Four, each a link to the page where it can be acted on. Two are bare
          figures, one is a ratio and so carries a meter, one carries a change
          against last week. None of them is here just to fill a tile. */}
      <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          href="/admin/houses"
          icon={HardHat}
          label="Houses on the go"
          value={houses.length}
          foot={
            estates.size > 0
              ? `${estates.size} estate${estates.size === 1 ? "" : "s"} · ${houses.length - Array.from(estates.values()).reduce((n, e) => n + e.lots, 0)} standalone`
              : "All standalone"
          }
        />

        <Tile
          href={behindTotal > 0 ? "/admin/houses?behind=1" : "/admin/houses"}
          icon={TrendingUp}
          label="Holding their dates"
          value={onProgramme === 0 ? "—" : `${onTrackTotal}/${onProgramme}`}
          alert={behindTotal > 0}
          foot={
            onProgramme === 0
              ? "No handover dates set yet"
              : behindTotal === 0
                ? "Every programme on track"
                : `${behindTotal} slipping`
          }
          meter={onProgramme === 0 ? null : { filled: onTrackTotal, total: onProgramme }}
        />

        <Tile
          href="/admin/reports"
          icon={MessageSquare}
          label="Owner questions"
          value={questions}
          alert={questions > 0}
          foot={
            questions === 0
              ? "Nobody waiting on a reply"
              : oldestQuestionDays === 0
                ? "Oldest came in today"
                : `Oldest is ${oldestQuestionDays} day${oldestQuestionDays === 1 ? "" : "s"} old`
          }
        />

        <Suspense
          fallback={
            <Tile href="/admin/friday" icon={CalendarCheck} label="Updates sent" value="—" foot="Counting…" />
          }
        >
          <UpdatesTile />
        </Suspense>
      </div>

      {/* Draws nothing. Brings houses given a handover before due dates built
          themselves up to date, after everything above is already on screen. */}
      <Suspense fallback={null}>
        <CatchUp />
      </Suspense>

      {/* ── The portfolio ─────────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
            Where the book is
          </h2>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Key color={ON_PROGRAMME} label="On programme" />
            <Key color={BEHIND} label="Behind" />
            <Key color={NO_DATES} label="No dates set" />
          </ul>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-dark-card px-5 py-1 sm:px-6">
          {phaseRows.map((row) => (
            <Link
              key={row.name}
              href={`/admin/houses?phase=${encodeURIComponent(row.name)}`}
              className="group -mx-3 block rounded-lg px-3 py-3.5 transition-colors hover:bg-white/[0.03] sm:grid sm:grid-cols-[minmax(0,11rem)_1fr_auto] sm:items-center sm:gap-4"
            >
              <span className="block truncate text-sm text-white/80 group-hover:text-white">
                {row.name}
              </span>

              <span className="mt-2 flex items-center gap-3 sm:mt-0">
                {/* The bar. Scaled against the fullest phase, not a fixed
                    width, so the shape of the book is the thing that reads.
                    Every value is printed beside it, so nothing here depends
                    on hovering or on telling two colours apart. */}
                <Bar
                  width={Math.max(6, (row.total / widest) * 100)}
                  segments={[
                    { n: row.onTrack, color: ON_PROGRAMME },
                    { n: row.behind, color: BEHIND },
                    { n: row.noDates, color: NO_DATES },
                  ]}
                />
                {row.behind > 0 && (
                  <span className="flex flex-none items-center gap-1 text-xs text-white/50">
                    <CircleAlert size={11} aria-hidden="true" style={{ color: BEHIND }} />
                    {row.behind} behind
                  </span>
                )}
              </span>

              <span className="mt-1 block font-mono text-xs tabular-nums text-white/45 whitespace-nowrap sm:mt-0 sm:w-[5.5rem] sm:text-right sm:text-sm sm:text-white/70">
                {row.total} house{row.total === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>

        {estates.size > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from(estates.entries()).map(([id, e]) => (
              <Link
                key={id}
                href="/admin/developments"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/[0.07] bg-dark-card px-4 text-sm text-white/65 transition-colors hover:border-white/20 hover:text-white"
              >
                <Layers size={13} aria-hidden="true" className="text-white/30" />
                {e.name}
                <span className="font-mono text-xs tabular-nums text-white/40">{e.lots}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── The to-do list ────────────────────────────────────────────────── */}
      {bands.length > 0 ? (
        <div className="mb-10 flex flex-col gap-8">
          {bands.map((band) => (
            <section key={band.title} id={`band-${slug(band.title)}`} className="scroll-mt-6">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
                  {band.title}
                  <span className="ml-2 text-white/25">{band.tasks.length}</span>
                </h2>
                <p className="hidden truncate text-xs text-white/30 sm:block">{band.note}</p>
              </div>

              <ul className="overflow-hidden rounded-xl border border-white/[0.07] bg-dark-card">
                {band.tasks.slice(0, band.show).map((t, i) => (
                  <li key={`${t.houseId}-${i}`}>
                    <Link
                      href={`/admin/houses/${t.houseId}`}
                      className={
                        "group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-white/[0.03] " +
                        (i > 0 ? "border-t border-white/[0.06]" : "")
                      }
                    >
                      <TaskIcon kind={t.kind} hot={t.urgency <= 2} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-white/85">
                          {t.label}
                          <span className="text-white/35"> · {t.address}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-white/40">
                          {t.detail}
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        aria-hidden="true"
                        className="mt-0.5 flex-none text-white/0 transition-colors group-hover:text-white/40"
                      />
                    </Link>
                  </li>
                ))}
                {band.tasks.length > band.show && (
                  <li>
                    <Link
                      href="/admin/houses"
                      className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3.5 text-xs text-white/40 transition-colors hover:bg-white/[0.03] hover:text-white/70"
                    >
                      {band.tasks.length - band.show} more
                      <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="mb-10 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-dark-card px-5 py-5 text-sm text-white/45">
          <Check size={15} aria-hidden="true" style={{ color: ON_PROGRAMME }} />
          Nothing outstanding. Every owner has heard from you recently.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
            Waiting on owners
            {waitingOnOwners.length > 0 && (
              <span className="ml-2 text-white/25">{waitingOnOwners.length}</span>
            )}
          </h2>
          {waitingOnOwners.length > 0 ? (
            <ul className="overflow-hidden rounded-xl border border-white/[0.07] bg-dark-card">
              {waitingOnOwners.slice(0, 6).map((w, i) => (
                <li key={`${w.houseId}-${i}`}>
                  <Link
                    href={`/admin/houses/${w.houseId}`}
                    className={
                      "block px-5 py-3.5 transition-colors hover:bg-white/[0.03] " +
                      (i > 0 ? "border-t border-white/[0.06]" : "")
                    }
                  >
                    <span className="block truncate text-sm text-white/80">{w.what}</span>
                    <span className="mt-0.5 block text-xs text-white/40">
                      {w.address} · {w.note}
                    </span>
                  </Link>
                </li>
              ))}
              {waitingOnOwners.length > 6 && (
                <li>
                  <Link
                    href="/admin/houses"
                    className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3.5 text-xs text-white/40 transition-colors hover:bg-white/[0.03] hover:text-white/70"
                  >
                    {waitingOnOwners.length - 6} more
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </li>
              )}
            </ul>
          ) : (
            <p className="rounded-xl border border-white/[0.07] bg-dark-card px-5 py-5 text-sm text-white/45">
              Nothing outstanding from any owner.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
            This week
          </h2>
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-dark-card">
            <div className="flex items-baseline justify-between px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm text-white/60">
                <CloudRain size={13} aria-hidden="true" className="text-white/30" />
                Days lost to weather
              </span>
              <span className="font-mono text-lg tabular-nums text-white">{wetThisWeek}</span>
            </div>

            <Link
              href="/admin/friday"
              className="group block border-t border-white/[0.06] px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
            >
              <span className="flex items-baseline justify-between">
                <span className="flex items-center gap-2 text-sm text-white/60 group-hover:text-white/80">
                  <CalendarCheck size={13} aria-hidden="true" className="text-white/30" />
                  Next week written
                </span>
                <span className="font-mono text-lg tabular-nums text-white">
                  {nextWeekWritten}
                  <span className="text-sm text-white/35"> / {houses.length}</span>
                </span>
              </span>
              <span className="mt-2.5 block">
                <Meter filled={nextWeekWritten} total={houses.length} />
              </span>
            </Link>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/30">
            The Friday email goes out either way. The look-ahead is the part owners
            can&apos;t see for themselves.
          </p>
        </section>
      </div>
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function TaskIcon({ kind, hot }: { kind: TaskKind; hot: boolean }) {
  const Icon = TASK_ICON[kind];
  return (
    <Icon
      size={15}
      aria-hidden="true"
      className="mt-0.5 flex-none"
      style={{ color: hot ? BEHIND : "rgba(255,255,255,0.3)" }}
    />
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function signed(n: number) {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * One phase's bar. Segments sit side by side with a 2px gap in the surface
 * colour doing the separating — no stroke around the fills — and the data end
 * is rounded on whichever segment actually comes last, which is why the whole
 * row is built here rather than segment by segment.
 */
function Bar({
  width,
  segments,
}: {
  width: number;
  segments: { n: number; color: string }[];
}) {
  const shown = segments.filter((seg) => seg.n > 0);
  const total = shown.reduce((n, seg) => n + seg.n, 0);
  if (total === 0) return null;

  return (
    <span aria-hidden="true" className="flex h-2.5 gap-[2px]" style={{ width: `${width}%` }}>
      {shown.map((seg, i) => (
        <span
          key={i}
          className="block h-full min-w-[4px]"
          style={{
            flexGrow: seg.n,
            flexBasis: `${(seg.n / total) * 100}%`,
            backgroundColor: seg.color,
            borderTopRightRadius: i === shown.length - 1 ? 4 : 0,
            borderBottomRightRadius: i === shown.length - 1 ? 4 : 0,
          }}
        />
      ))}
    </span>
  );
}

/** A legend key: a swatch carries the colour, the text stays in ink. */
function Key({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-[11px] text-white/45">
      <span
        aria-hidden="true"
        className="h-2 w-2 flex-none rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      {label}
    </li>
  );
}

/** A ratio against its limit. The track is the fill's own colour, dimmed. */
function Meter({ filled, total }: { filled: number; total: number }) {
  const pct = total === 0 ? 0 : (filled / total) * 100;
  return (
    <span
      className="block h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: "rgba(176,143,62,0.18)" }}
      role="img"
      aria-label={`${filled} of ${total}`}
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: ON_PROGRAMME }}
      />
    </span>
  );
}

async function UpdatesTile() {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now - 14 * 86_400_000);
  const [thisWeek, lastWeek] = await Promise.all([
    prisma.update.count({ where: { publishedAt: { gte: weekAgo }, deletedAt: null } }),
    prisma.update.count({
      where: { publishedAt: { gte: twoWeeksAgo, lt: weekAgo }, deletedAt: null },
    }),
  ]);
  return (
    <Tile
      href="/admin/friday"
      icon={CalendarCheck}
      label="Updates sent"
      value={thisWeek}
      foot={
        lastWeek === 0
          ? "Nothing sent last week"
          : `${signed(thisWeek - lastWeek)} on last week`
      }
    />
  );
}

async function CatchUp() {
  try {
    await backfillProgrammes();
  } catch (cause) {
    console.error("programme catch-up failed", cause);
  }
  return null;
}

function Tile({
  href,
  icon: Icon,
  label,
  value,
  foot,
  alert,
  meter,
}: {
  href: string;
  icon: typeof HardHat;
  label: string;
  value: number | string;
  foot: string;
  alert?: boolean;
  meter?: { filled: number; total: number } | null;
}) {
  return (
    <Link
      href={href}
      className={
        "group flex flex-col rounded-xl border p-4 transition-colors sm:p-5 " +
        (alert
          ? "border-white/[0.07] bg-dark-card hover:border-white/25"
          : "border-white/[0.07] bg-dark-card hover:border-white/20")
      }
    >
      <span className="flex items-center justify-between">
        <Icon
          size={15}
          aria-hidden="true"
          style={{ color: alert ? BEHIND : "rgba(255,255,255,0.3)" }}
        />
        <ArrowRight
          size={13}
          aria-hidden="true"
          className="text-white/0 transition-all group-hover:translate-x-0.5 group-hover:text-white/35"
        />
      </span>
      <span className="mt-3 block text-[30px] font-semibold leading-none text-white">
        {value}
      </span>
      <span className="mt-1.5 block text-xs text-white/55 group-hover:text-white/75">{label}</span>
      {meter && (
        <span className="mt-3 block">
          <Meter filled={meter.filled} total={meter.total} />
        </span>
      )}
      <span className="mt-2 block text-[11px] leading-snug text-white/30">{foot}</span>
    </Link>
  );
}

/**
 * Day one. The old dashboard rendered every section empty here, which reads as
 * a broken app rather than a new one — the complaint that "nothing happens" is
 * mostly this screen. Say what to press instead.
 */
function FirstRun({ today }: { today: string }) {
  const steps = [
    {
      href: "/admin/houses",
      icon: Plus,
      title: "Add your first house",
      body: "Address, owner, and the standard stage list. Or hold the mic and say it.",
    },
    {
      href: "/admin/houses",
      icon: HardHat,
      title: "Drop in the examples",
      body: "Two made-up houses so you can see the whole thing working before it's real.",
    },
    {
      href: "/admin/stages",
      icon: Layers,
      title: "Check the standard stages",
      body: "Thirty-one steps from contract to handover. Add or remove to suit how you build.",
    },
    {
      href: "/admin/developments",
      icon: FileSignature,
      title: "Set up an estate",
      body: "Group lots under one developer so a whole release reads as one job.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <header className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">{today}</p>
        <h1 className="mt-1 font-display text-3xl text-white">Let&apos;s get you set up</h1>
        <p className="mt-2 max-w-lg leading-relaxed text-white/45">
          Nothing here yet. Once there is a house on the books this becomes your morning
          read — what&apos;s late, who&apos;s waiting, and where every build is up to.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.title}>
            <Link
              href={s.href}
              className="group flex h-full flex-col rounded-xl border border-white/[0.07] bg-dark-card p-5 transition-colors hover:border-white/20"
            >
              <s.icon size={16} aria-hidden="true" style={{ color: ON_PROGRAMME }} />
              <span className="mt-3 flex items-center gap-1.5 text-sm font-medium text-white">
                {s.title}
                <ArrowRight
                  size={13}
                  className="text-white/25 transition-transform group-hover:translate-x-0.5"
                />
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-white/40">{s.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
