/**
 * When will my house be finished?
 *
 * The question every owner asks monthly, that he currently answers from
 * memory — which is why the answer changes depending on who asks and when.
 *
 * Nothing here is typed in. The estimate is computed from what is already
 * known: when the build started, which stages are actually finished, how long
 * each remaining stage normally takes, and the days that cannot be worked.
 * That last part is most of the value. A "twelve week" programme run against a
 * plain calendar lands a fortnight early every time, because it silently
 * assumes work happens on Christmas Day and in the rain.
 *
 * Excluded from the working calendar:
 *   - weekends
 *   - NSW public holidays
 *   - the industry Christmas shutdown, which is close to universal in
 *     residential construction and is three weeks nobody programmes for
 *   - an allowance for weather, taken from THIS house's own observed rate of
 *     lost days rather than a rule of thumb, once there is enough of it
 *
 * The output is a forecast, not a promise, and the wording everywhere it is
 * shown says so. It exists to make his answer consistent, and to make a moved
 * date explainable — "lock-up moved three weeks, here are the six wet days and
 * the shutdown" is a conversation; "it's running late" is an argument.
 */

export type ForecastStage = {
  id: string;
  name: string;
  position: number;
  status: string;
  plannedDays: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  estimatedEnd: Date | null;
};

export type StageForecast = {
  id: string;
  name: string;
  /** Null for stages that are finished or do not apply. */
  estimatedEnd: Date | null;
  /** Non-null when this differs from what was previously stored. */
  movedFrom: Date | null;
};

export type Forecast = {
  stages: StageForecast[];
  /** The handover window, or null when there is nothing left to forecast. */
  handoverFrom: Date | null;
  handoverTo: Date | null;
  /** Plain-English account of what drove the numbers. Shown to him, not owners. */
  basis: string[];
};

const DAY = 86_400_000;

/** Midnight UTC, so date-only maths never drifts across a Sydney evening. */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Easter Sunday, Anonymous Gregorian algorithm.
 *
 * Needed because Good Friday and Easter Monday are both public holidays and
 * both move — they are the only holidays that cannot simply be listed.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** A weekend holiday is observed on the following Monday, as NSW does it. */
function observed(d: Date): Date {
  const shifted = new Date(d);
  const dow = shifted.getUTCDay();
  if (dow === 6) shifted.setUTCDate(shifted.getUTCDate() + 2);
  if (dow === 0) shifted.setUTCDate(shifted.getUTCDate() + 1);
  return shifted;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

/** NSW public holidays for one year, as ISO date strings. */
function nswHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter.getTime() - 2 * DAY);
  const easterSaturday = new Date(easter.getTime() - DAY);
  const easterMonday = new Date(easter.getTime() + DAY);

  const days = [
    observed(new Date(Date.UTC(year, 0, 1))), // New Year's Day
    observed(new Date(Date.UTC(year, 0, 26))), // Australia Day
    goodFriday,
    easterSaturday,
    easter,
    easterMonday,
    observed(new Date(Date.UTC(year, 3, 25))), // Anzac Day
    nthWeekdayOfMonth(year, 5, 1, 2), // King's Birthday — second Monday in June
    nthWeekdayOfMonth(year, 9, 1, 1), // Labour Day — first Monday in October
    observed(new Date(Date.UTC(year, 11, 25))), // Christmas Day
    observed(new Date(Date.UTC(year, 11, 26))), // Boxing Day
  ];

  return new Set(days.map(iso));
}

/**
 * The industry Christmas shutdown.
 *
 * Residential sites in NSW close from a few days before Christmas until the
 * second week of January. It is not a public holiday and no contract programme
 * mentions it, but it is three working weeks that reliably do not happen — and
 * it is the single biggest reason a spring forecast lands wrong.
 */
function inChristmasShutdown(d: Date): boolean {
  const month = d.getUTCMonth();
  const date = d.getUTCDate();
  if (month === 11 && date >= 22) return true;
  if (month === 0 && date <= 8) return true;
  return false;
}

const holidayCache = new Map<number, Set<string>>();

function isWorkingDay(d: Date): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (inChristmasShutdown(d)) return false;

  const year = d.getUTCFullYear();
  let holidays = holidayCache.get(year);
  if (!holidays) {
    holidays = nswHolidays(year);
    holidayCache.set(year, holidays);
  }
  return !holidays.has(iso(d));
}

/** Walks the calendar forward, skipping anything that cannot be worked. */
function addWorkingDays(from: Date, days: number): Date {
  const cursor = utcDay(from);
  let remaining = Math.max(Math.round(days), 0);
  // Guarded rather than unbounded: a corrupt plannedDays should not spin.
  let guard = 0;
  while (remaining > 0 && guard < 5000) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDay(cursor)) remaining--;
    guard++;
  }
  return cursor;
}

function workingDaysBetween(from: Date, to: Date): number {
  const cursor = utcDay(from);
  const end = utcDay(to);
  let count = 0;
  let guard = 0;
  while (cursor < end && guard < 5000) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDay(cursor)) count++;
    guard++;
  }
  return count;
}

/**
 * How much to inflate remaining durations to allow for weather.
 *
 * Taken from this house's own record where there is enough of it. A house on an
 * exposed block through a wet autumn genuinely loses more days than one that
 * started in March, and its forecast should say so rather than being corrected
 * by a national average.
 */
function weatherAllowance(
  wetDaysLost: number,
  workingDaysElapsed: number
): { factor: number; note: string } {
  const DEFAULT_RATE = 0.08;

  if (workingDaysElapsed < 20) {
    return {
      factor: 1 / (1 - DEFAULT_RATE),
      note: "Weather allowance 8% — the usual Sydney figure, until this house has enough history of its own.",
    };
  }

  // Capped: a fortnight of rain early in a build would otherwise project a
  // third of the remaining year away.
  const rate = Math.min(wetDaysLost / workingDaysElapsed, 0.25);
  return {
    factor: 1 / (1 - rate),
    note: `Weather allowance ${Math.round(rate * 100)}% — this house has lost ${wetDaysLost} of ${workingDaysElapsed} working days to weather so far.`,
  };
}

export function forecast(input: {
  startDate: Date | null;
  stages: ForecastStage[];
  wetDaysLost: number;
  today?: Date;
}): Forecast {
  const today = utcDay(input.today ?? new Date());
  const basis: string[] = [];

  const ordered = [...input.stages].sort((a, b) => a.position - b.position);
  const remaining = ordered.filter(
    (s) => s.status !== "complete" && s.status !== "not_applicable"
  );

  if (remaining.length === 0) {
    return { stages: [], handoverFrom: null, handoverTo: null, basis: ["Every stage is complete."] };
  }

  const lastCompleted = ordered
    .filter((s) => s.status === "complete" && s.completedAt)
    .map((s) => utcDay(s.completedAt!))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const elapsedFrom = input.startDate ? utcDay(input.startDate) : lastCompleted ?? today;
  const workingDaysElapsed = workingDaysBetween(elapsedFrom, today);
  const weather = weatherAllowance(input.wetDaysLost, workingDaysElapsed);
  basis.push(weather.note);

  if (input.startDate) {
    basis.push(
      `${workingDaysElapsed} working days since start, after weekends, public holidays and the Christmas shutdown.`
    );
  } else {
    basis.push("No start date on this house, so the forecast runs from today.");
  }

  // Work never resumes before today, even if the last completion was months
  // ago — a stalled build forecast from its last completed stage would quietly
  // report dates already in the past.
  let cursor = new Date(Math.max(today.getTime(), (lastCompleted ?? today).getTime()));

  const stages: StageForecast[] = [];
  let missingDurations = 0;

  for (const stage of remaining) {
    const planned = stage.plannedDays ?? 0;
    if (!stage.plannedDays) missingDurations++;

    if (stage.status === "in_progress" && stage.startedAt) {
      // Already running: measure from when it actually started rather than
      // from the end of the stage before it, which it clearly did not wait for.
      const from = utcDay(stage.startedAt);
      const done = workingDaysBetween(from, today);
      const left = Math.max(planned * weather.factor - done, 1);
      cursor = addWorkingDays(new Date(Math.max(cursor.getTime(), today.getTime())), left);
    } else {
      cursor = addWorkingDays(cursor, planned * weather.factor);
    }

    const estimatedEnd = new Date(cursor);
    const previous = stage.estimatedEnd ? utcDay(stage.estimatedEnd) : null;

    stages.push({
      id: stage.id,
      name: stage.name,
      estimatedEnd,
      // Only a real move counts. Re-running the forecast on a quiet day
      // recomputes the same dates, and a "moved" flag on every one of them
      // would make the genuine ones invisible.
      movedFrom:
        previous && previous.getTime() !== estimatedEnd.getTime() ? previous : null,
    });
  }

  if (missingDurations > 0) {
    basis.push(
      `${missingDurations} remaining stage${missingDurations === 1 ? " has" : "s have"} no typical duration set, so ${missingDurations === 1 ? "it adds" : "they add"} nothing to the forecast.`
    );
  }

  // The window, not a date. Owners treat a single day as a promise and diarise
  // it; a fortnight is both honest and how handover actually gets booked.
  const last = stages[stages.length - 1].estimatedEnd!;
  const handoverFrom = new Date(last);
  const handoverTo = addWorkingDays(last, 10);

  return { stages, handoverFrom, handoverTo, basis };
}

/** Walks the calendar backwards, skipping anything that cannot be worked. */
function subWorkingDays(from: Date, days: number): Date {
  const cursor = utcDay(from);
  let remaining = Math.max(Math.round(days), 0);
  let guard = 0;
  while (remaining > 0 && guard < 5000) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (isWorkingDay(cursor)) remaining--;
    guard++;
  }
  return cursor;
}

export type StageTarget = {
  id: string;
  name: string;
  /** When this stage has to finish for the target date to hold. */
  dueBy: Date;
  /** Working days between this target and where the forecast says it lands. */
  slipDays: number | null;
};

export type BackwardPlan = {
  targets: StageTarget[];
  /** Negative when the programme is already behind before it starts. */
  floatDays: number;
  basis: string[];
};

/**
 * Working backwards from a date the contract already committed to.
 *
 * The forward forecast answers "when will this finish". This answers the
 * question a site manager is actually asked, which is the other way round:
 * the date is fixed, so what has to be true in August for March to hold.
 *
 * Both together are the useful thing. A stage carries a date it SHOULD finish
 * and a date it WILL finish, and the gap between them is the slip — which is
 * the only number worth putting in front of him, because it is the one he can
 * still do something about.
 *
 * It will happily produce dates in the past. That is not a failure: it means
 * the target was never achievable at these durations, and he is better off
 * seeing that in week one than in month eight.
 */
export function backwardPlan(input: {
  target: Date;
  stages: ForecastStage[];
  /** Forward estimates, to measure the gap against. */
  forecast?: StageForecast[];
  wetDaysLost?: number;
  workingDaysElapsed?: number;
  today?: Date;
}): BackwardPlan {
  const today = utcDay(input.today ?? new Date());
  const basis: string[] = [];

  const ordered = [...input.stages].sort((a, b) => a.position - b.position);
  const remaining = ordered.filter(
    (s) => s.status !== "complete" && s.status !== "not_applicable"
  );

  if (remaining.length === 0) {
    return { targets: [], floatDays: 0, basis: ["Every stage is complete."] };
  }

  // The same weather allowance the forward pass uses. A backward plan built on
  // perfect weather would set targets he can only hit in a dry winter, and a
  // target nobody can hit is one he stops reading.
  const weather = weatherAllowance(
    input.wetDaysLost ?? 0,
    input.workingDaysElapsed ?? 0
  );
  basis.push(weather.note);

  // Handover is excluded from the walk: the target date IS handover, so the
  // stage before it must finish on the target, not a fortnight earlier.
  const targets: StageTarget[] = [];
  let cursor = utcDay(input.target);

  for (let i = remaining.length - 1; i >= 0; i--) {
    const stage = remaining[i];
    targets.unshift({
      id: stage.id,
      name: stage.name,
      dueBy: new Date(cursor),
      slipDays: null,
    });

    // A stage already underway only has its remaining days left to find. The
    // forward pass has always done this; the backward pass charging the full
    // duration made the two disagree — float reporting "behind" while every
    // stage reported "spare", which is the fastest way to make him stop
    // believing either number.
    let cost = (stage.plannedDays ?? 0) * weather.factor;
    if (stage.status === "in_progress" && stage.startedAt) {
      const done = workingDaysBetween(utcDay(stage.startedAt), today);
      cost = Math.max(cost - done, 1);
    }

    cursor = subWorkingDays(cursor, cost);
  }

  // Everything left has to start by this date. Float is what is spare between
  // now and then — negative means the run is already longer than the time.
  const mustStartBy = cursor;
  const floatDays =
    mustStartBy >= today
      ? workingDaysBetween(today, mustStartBy)
      : -workingDaysBetween(mustStartBy, today);

  basis.push(
    floatDays >= 0
      ? `${floatDays} working days spare against the target date.`
      : `The remaining stages need ${Math.abs(floatDays)} more working days than there are before the target date.`
  );

  if (input.forecast) {
    const landing = new Map(input.forecast.map((f) => [f.id, f.estimatedEnd]));
    for (const target of targets) {
      const willBe = landing.get(target.id);
      if (!willBe) continue;
      const end = utcDay(willBe);
      target.slipDays =
        end > target.dueBy
          ? workingDaysBetween(target.dueBy, end)
          : -workingDaysBetween(end, target.dueBy);
    }
  }

  return { targets, floatDays, basis };
}

export const forecastInternals = {
  addWorkingDays,
  subWorkingDays,
  workingDaysBetween,
  isWorkingDay,
  nswHolidays,
};
