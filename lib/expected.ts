import { forecast, type ForecastStage } from "./forecast";

/**
 * Promised against expected, for the one person who needs to see both.
 *
 * "Promised" is the date he gave the owner. "Expected" is where the build will
 * really land if it carries on from where it is now, worked out by the forecast
 * engine: stage by stage, skipping weekends, NSW public holidays, the Christmas
 * shutdown, and allowing for the days this house has already lost to rain.
 *
 * The expected figure is a WINDOW and never a single day. Owners treat a single
 * date as a promise and diarise it, and he is better served by "14 to 28 Feb"
 * than by a precision the building does not have.
 *
 * It is private. It is worked out fresh whenever a page opens and never stored,
 * and nothing here changes what an owner sees — telling an owner the date has
 * moved is a decision he takes himself, from the forecast panel.
 *
 * Honest about its limit: it runs on typical stage durations, not on how fast
 * his own jobs have actually gone. It is an estimate, labelled as one.
 */

export type ExpectedInput = {
  startDate: Date | null;
  /** The date promised to the owner: the contract date, else the end of the window he gave. */
  promised: Date | null;
  wetDaysLost: number;
  stages: ForecastStage[];
  today?: Date;
};

export type ExpectedState = "late" | "tight" | "on_track" | "no_promise";

export type Expected = {
  from: Date;
  to: Date;
  promised: Date | null;
  state: ExpectedState;
  /** Calendar days from the promise to the START of the window — only when late. */
  lateDays: number | null;
  /** "14–28 Feb" */
  window: string;
  /** "about 9 weeks late", "inside the window — tight", "on track". */
  verdict: string | null;
  /** "Promised 31 Dec · expected 14–28 Feb · about 9 weeks late" */
  summary: string;
};

const DAY = 86_400_000;

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

/** "14–28 Feb", "28 Feb – 12 Mar", with the year only when it is not this one. */
export function windowText(from: Date, to: Date, today: Date = new Date()): string {
  const year = today.getUTCFullYear();
  const showYear = to.getUTCFullYear() !== year || from.getUTCFullYear() !== year;
  const sameMonth =
    from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  const tail = showYear ? ` ${to.getUTCFullYear()}` : "";
  return sameMonth
    ? `${from.getUTCDate()}–${fmt(to, { day: "numeric", month: "short" })}${tail}`
    : `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short" })}${tail}`;
}

function dateText(d: Date, today: Date): string {
  return fmt(d, {
    day: "numeric",
    month: "short",
    ...(d.getUTCFullYear() !== today.getUTCFullYear() ? { year: "numeric" } : {}),
  });
}

/** Null when there is nothing left before handover to forecast. */
export function computeExpected(input: ExpectedInput): Expected | null {
  const today = input.today ?? new Date();
  const result = forecast({
    startDate: input.startDate,
    stages: input.stages,
    wetDaysLost: input.wetDaysLost,
    today,
  });
  if (!result.handoverFrom || !result.handoverTo) return null;

  const { handoverFrom: from, handoverTo: to } = result;
  const promised = input.promised;
  const window = windowText(from, to, today);

  if (!promised) {
    return {
      from, to, promised: null, state: "no_promise", lateDays: null, window, verdict: null,
      summary: `Expected ${window}`,
    };
  }

  // Late only when even the best case misses it. Inside the window is tight, not
  // late: the window already says the date is uncertain by that much.
  let state: ExpectedState;
  let lateDays: number | null = null;
  let verdict: string;

  if (from.getTime() > promised.getTime()) {
    state = "late";
    lateDays = Math.ceil((from.getTime() - promised.getTime()) / DAY);
    verdict =
      lateDays < 7
        ? `${lateDays} day${lateDays === 1 ? "" : "s"} late`
        : `about ${Math.round(lateDays / 7)} week${Math.round(lateDays / 7) === 1 ? "" : "s"} late`;
  } else if (to.getTime() > promised.getTime()) {
    state = "tight";
    verdict = "inside the window — tight";
  } else {
    state = "on_track";
    verdict = "on track";
  }

  return {
    from, to, promised, state, lateDays, window, verdict,
    summary: `Promised ${dateText(promised, today)} · expected ${window} · ${verdict}`,
  };
}
