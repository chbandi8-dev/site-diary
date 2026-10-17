import { SYDNEY_SUBURBS } from "./suburbs";

/**
 * Turning a list he already keeps — in Notes, in a message to himself, in his
 * head — into houses on the books.
 *
 * Deliberately not AI. The list has a shape he writes every time (an address,
 * Owner, Project status, Next week schedule), a parser reads that for nothing
 * and the same way every time, and a language model reading twenty-five
 * addresses is exactly where a confident wrong guess costs him a house filed
 * under the wrong street. Anything this cannot place is reported back rather
 * than guessed at, and the screen shows the result before anything is saved.
 */

export type ParsedOwner = { name: string; phone: string | null };

export type ParsedHouse = {
  address: string;
  suburb: string | null;
  owners: ParsedOwner[];
  /** Project status lines, as he wrote them. */
  status: string[];
  /** Next week schedule lines, as he wrote them. */
  next: string[];
  storeys: 1 | 2 | null;
  /** What is holding the house up, in his words. Owners read this line. */
  waitingOn: string | null;
  /** The window he has promised, as ISO dates. A single date is both ends. */
  handoverFrom: string | null;
  handoverTo: string | null;
};

type Section = "owner" | "status" | "next" | "storeys" | "handover" | "waiting";

// The two newer headers insist on a colon or dash (or standing alone on the
// line). "Handover pack sent" is a status item, not a heading, and must stay one.
const HEADERS: [Section, RegExp][] = [
  ["waiting", /^waiting(?:\s+on)?\b(?:\s*[:\-–—]+\s*(.*)|\s*)$/i],
  ["storeys", /^(?:storeys?|stories|story|levels?)\b(?:\s*[:\-–—]+\s*(.*)|\s*)$/i],
  ["handover", /^(?:hand.?over(?:\s+date)?|completion|practical completion)\b(?:\s*[:\-–—]+\s*(.*)|\s*)$/i],
  ["owner", /^owners?\b\s*[:\-–—]*\s*(.*)$/i],
  ["status", /^(?:project\s+)?status\b\s*[:\-–—]*\s*(.*)$/i],
  ["next", /^next\s+week(?:'s)?(?:\s+schedule)?\b\s*[:\-–—]*\s*(.*)$/i],
];

const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;

/** "pendle hill" -> "Pendle Hill", "d'arcy road" -> "D'Arcy Road". */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
}

function canonicalSuburb(raw: string): string {
  const wanted = raw.trim().toLowerCase();
  return SYDNEY_SUBURBS.find((s) => s.toLowerCase() === wanted) ?? titleCase(raw.trim());
}

function cleanItem(raw: string): string {
  return raw
    .replace(/^[\s\-–—•*·]+/, "")
    .replace(/[\s.,;]+$/, "")
    .trim();
}

function parseOwners(raw: string): ParsedOwner[] {
  return raw
    .split(/\s*&\s*|\s+and\s+|\s*,\s*|\s*\/\s*/i)
    .map((part) => {
      const phone = part.match(PHONE)?.[1].trim() ?? null;
      const name = part.replace(PHONE, "").replace(/[\s()\-:]+$/g, "").trim();
      return name ? { name, phone } : null;
    })
    .filter((o): o is ParsedOwner => o !== null);
}

export function parsePastedHouses(text: string): ParsedHouse[] {
  const houses: ParsedHouse[] = [];
  let cur: ParsedHouse | null = null;
  let section: Section | null = null;
  let sections = 0;
  let prevBlank = true;

  const startHouse = (line: string) => {
    const [street, ...rest] = line.split(",");
    cur = {
      address: titleCase(street.trim()),
      suburb: rest.length ? canonicalSuburb(rest.join(",")) : null,
      owners: [],
      status: [],
      next: [],
      storeys: null,
      waitingOn: null,
      handoverFrom: null,
      handoverTo: null,
    };
    houses.push(cur);
    section = null;
    sections = 0;
  };

  const add = (target: ParsedHouse, kind: Section, value: string) => {
    if (kind === "owner") target.owners.push(...parseOwners(value));
    else if (kind === "storeys") {
      if (/\b(2|two|double)\b/i.test(value)) target.storeys = 2;
      else if (/\b(1|one|single)\b/i.test(value)) target.storeys = 1;
    } else if (kind === "waiting") {
      const item = cleanItem(value);
      // "No" and "nothing" are answers, not something to wait on.
      if (item && !/^(no|none|nothing|nil|n\/a|na)$/i.test(item)) {
        target.waitingOn = (target.waitingOn ? `${target.waitingOn}; ` : "") + item;
        target.waitingOn = target.waitingOn.slice(0, 200);
      }
    } else if (kind === "handover") {
      const window = parseHandover(value);
      if (window) {
        target.handoverFrom = window.from;
        target.handoverTo = window.to;
      }
    } else {
      const item = cleanItem(value);
      if (item) (kind === "status" ? target.status : target.next).push(item);
    }
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) {
      prevBlank = true;
      continue;
    }

    const header = HEADERS.map(([kind, re]) => ({ kind, m: line.match(re) })).find((h) => h.m);
    const looksLikeAddress = /^(lot\s+)?\d/i.test(line);

    if (header) {
      if (cur) {
        section = header.kind;
        sections++;
        if (header.m![1]) add(cur, section, header.m![1]);
      }
    } else if (!cur) {
      // Anything before the first address is a heading, not a house.
      if (looksLikeAddress) startHouse(line);
    } else if (prevBlank && sections > 0 && looksLikeAddress) {
      startHouse(line);
    } else if (section) {
      add(cur, section, line);
    }
    prevBlank = false;
  }

  return houses.filter((h) => h.address.length >= 3);
}

/* ── Which stage a line is about ─────────────────────────────────────────── */

const STAGE_RULES: [RegExp, string][] = [
  [/\b(render|rendering|texture|colour|color|brick|brickwork|cladding)\b/i, "External walls: brick, cladding or render"],
  [/\b(window|windows|external door)/i, "Windows & external doors"],
  [/\b(rough.?in|roughin|electrical|plumbing|aircon|air.?con|duct|ducting|hvac)\b/i, "Rough-ins: plumbing, electrical & HVAC"],
  [/\bwaterproof/i, "Wet-area waterproofing"],
  [/\b(insulation|bulkhead|plasterboard|lining|linings|gyprock|plaster)\b/i, "Insulation & internal linings"],
  [/\b(roof|roofing|truss|trusses|batten|battens)\b/i, "Roof"],
  [/\b(frame|framing)\b/i, "Frame"],
  [/\b(slab|footing|footings)\b/i, "Footings & slab"],
  [/\b(tile|tiles|tiling)\b/i, "Tiling"],
  [/\b(cabinet|cabinets|cabinetry|joinery|stone|benchtop)\b/i, "Cabinetry & stone"],
  [/\b(paint|painting)\b/i, "Painting"],
  [/\b(fix.?out|skirting|architrave)\b/i, "Fix-out carpentry"],
  [/\b(driveway|paving|stormwater)\b/i, "Driveway, paths & stormwater"],
  [/\b(landscaping|fencing)\b/i, "Fencing & landscaping"],
];

const DONE = /\b(done|complete|completed|finished|delivered|installed|passed)\b/i;

// Getting ready for a stage is not the stage. "Roof material delivered" and
// "roofing measurement done" mean the roof is booked, not that anyone is on it —
// and reading them as work started put a roof "underway" that was in fact due
// to begin next week. Unless the line also says something was physically
// finished ("windows delivered and installed").
const PREP = /\b(measure|measured|measurement|measurements|delivered|delivery|ordered|quote|quoted|approved|approval|selected|selections?|submitted|lodged|booked|scheduled|marked)\b/i;
const PHYSICAL = /\b(installed|fitted|laid|poured|finished|completed)\b/i;
const isPrep = (line: string) => PREP.test(line) && !PHYSICAL.test(line);

export type StagePlan = { stage: string; status: "complete" | "in_progress" | "scheduled" };

function stageFor(line: string, known: Set<string>): string | null {
  for (const [re, name] of STAGE_RULES) if (re.test(line) && known.has(name)) return name;
  return null;
}

/**
 * Reading "where it is" and "what's next" together.
 *
 *  - Done and not mentioned next week          → complete
 *  - Mentioned in both (texture done, colour next, or rendering continues)
 *                                              → underway: work has started and
 *                                                is not finished
 *  - Only in next week's list                  → booked, not started
 *  - Stated without "done" and not next week   → underway
 *
 * Whatever precedes the earliest of these is the caller's to mark finished —
 * if the render is on, the frame and roof are not in doubt.
 */
export function planStages(
  status: string[],
  next: string[],
  stageNames: string[]
): { plan: StagePlan[]; unmatched: string[] } {
  const known = new Set(stageNames);
  const unmatched: string[] = [];
  const reported = new Map<string, boolean>(); // stage -> every line of real work says done
  const preparing = new Set<string>(); // stage -> only getting-ready lines so far
  const upcoming = new Set<string>();

  for (const line of status) {
    const stage = stageFor(line, known);
    if (!stage) {
      unmatched.push(line);
      continue;
    }
    if (isPrep(line)) {
      preparing.add(stage);
      continue;
    }
    reported.set(stage, (reported.get(stage) ?? true) && DONE.test(line));
  }
  for (const line of next) {
    const stage = stageFor(line, known);
    if (!stage) {
      unmatched.push(line);
      continue;
    }
    upcoming.add(stage);
  }

  const plan: StagePlan[] = [];
  for (const stage of stageNames) {
    const worked = reported.has(stage);
    const inNext = upcoming.has(stage);
    // Only getting ready, and not on next week's list: nothing to say about the
    // stage itself yet. The line is still kept in his private note.
    if (!worked && !inNext) continue;
    plan.push({
      stage,
      status: inNext
        ? worked
          ? "in_progress"
          : "scheduled"
        : reported.get(stage)
          ? "complete"
          : "in_progress",
    });
  }
  return { plan, unmatched };
}

/** "aircon ducting" -> "Aircon ducting." — his words, only tidied. */
export function sentence(items: string[]): string {
  return items.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(". ") + (items.length ? "." : "");
}


/* ── Handover, as he says it ─────────────────────────────────────────────── */

const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTH_RE = new RegExp(`\\b${MONTH}\\b`, "gi");
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b(?:\\s+(\\d{4}))?`, "i");

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthIndex = (word: string) =>
  ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    word.slice(0, 3).toLowerCase()
  );

/**
 * "March", "March to April", "April 2027", "30 April 2027", "30/4/2027".
 *
 * A month on its own is the whole month, because that is how he promises it —
 * and a window is read to its far end, since that is the date he has committed
 * to. A month with no year means the next one to come: "March" said in October
 * is next March, never one already gone.
 */
export function parseHandover(
  text: string,
  today: Date = new Date()
): { from: string; to: string } | null {
  const t = text.trim();
  if (!t) return null;
  const thisYear = today.getUTCFullYear();
  const thisMonth = today.getUTCMonth();

  const full = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (full) return { from: full[0], to: full[0] };

  const slashed = t.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{2}|\d{4})\b/);
  if (slashed) {
    const year = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
    const d = new Date(Date.UTC(year, Number(slashed[2]) - 1, Number(slashed[1])));
    return Number.isNaN(d.getTime()) ? null : { from: iso(d), to: iso(d) };
  }

  const dm = t.match(DAY_MONTH);
  if (dm) {
    const m = monthIndex(dm[2]);
    let year = dm[3] ? Number(dm[3]) : thisYear;
    let d = new Date(Date.UTC(year, m, Number(dm[1])));
    if (!dm[3] && d.getTime() < Date.UTC(thisYear, thisMonth, today.getUTCDate())) {
      year += 1;
      d = new Date(Date.UTC(year, m, Number(dm[1])));
    }
    return Number.isNaN(d.getTime()) ? null : { from: iso(d), to: iso(d) };
  }

  const months = Array.from(t.matchAll(MONTH_RE)).map((m) => monthIndex(m[1]));
  if (months.length === 0) return null;
  const years = (t.match(/\b20\d{2}\b/g) ?? []).map(Number);

  const first = months[0];
  const last = months.length > 1 ? months[months.length - 1] : first;
  const inferred = first < thisMonth ? thisYear + 1 : thisYear;

  const startYear =
    years.length >= 2 ? years[0] : years.length === 1 ? (last < first ? years[0] - 1 : years[0]) : inferred;
  const endYear = years.length ? years[years.length - 1] : last < first ? startYear + 1 : startYear;

  return {
    from: iso(new Date(Date.UTC(startYear, first, 1))),
    to: iso(new Date(Date.UTC(endYear, last + 1, 0))),
  };
}

/* ── Pasting onto a house that is already there ──────────────────────────── */

export type ExistingHouse = {
  id: string;
  storeys: number;
  handoverTo: Date | null;
  waitingOn: string | null;
  nextWeek: string | null;
  owners: { ownerId: string; name: string; phone: string | null }[];
};

export type MergePlan = {
  /** What would change, for the screen. */
  changes: string[];
  /** Things he gave that were deliberately left alone, and why. */
  kept: string[];
  storeys?: 1 | 2;
  handover?: { from: string; to: string };
  waitingOn?: string;
  nextWeek?: string;
  phones: { ownerId: string; phone: string }[];
  newOwners: ParsedOwner[];
};

const first = (name: string) => name.trim().toLowerCase().split(/\s+/)[0];

/**
 * What a second paste adds to a house that is already on the books.
 *
 * Fills in what is missing and does not overwrite what is set. The things an
 * owner can read — the handover window and the waiting-on line — are never
 * replaced, because a date or a reason that changes underneath an owner because
 * somebody pasted a list is exactly the kind of change that should be a
 * decision. Stages and the private note are not touched at all: those are the
 * running record of the build, and this is only a list.
 *
 * Next week's schedule is the exception, replaced when given. It is a weekly
 * note, and pasting this week's is plainly asking for this week's to show.
 */
export function planMerge(h: ParsedHouse, e: ExistingHouse): MergePlan {
  const plan: MergePlan = { changes: [], kept: [], phones: [], newOwners: [] };

  if (h.storeys && h.storeys !== e.storeys) {
    plan.storeys = h.storeys;
    plan.changes.push(h.storeys === 2 ? "double storey" : "single storey");
  }

  if (h.handoverFrom && h.handoverTo) {
    if (!e.handoverTo) {
      plan.handover = { from: h.handoverFrom, to: h.handoverTo };
      plan.changes.push("handover date");
    } else if (e.handoverTo.toISOString().slice(0, 10) !== h.handoverTo) {
      plan.kept.push("handover is already set, so it was left as it is");
    }
  }

  if (h.waitingOn) {
    if (!e.waitingOn) {
      plan.waitingOn = h.waitingOn;
      plan.changes.push("what it is waiting on");
    } else if (e.waitingOn !== h.waitingOn) {
      plan.kept.push("waiting-on is already set, so it was left as it is");
    }
  }

  if (h.next.length > 0) {
    const text = sentence(h.next);
    if (text !== e.nextWeek) {
      plan.nextWeek = text;
      plan.changes.push("next week's schedule");
    }
  }

  for (const o of h.owners) {
    const match =
      e.owners.find((x) => x.name.trim().toLowerCase() === o.name.trim().toLowerCase()) ??
      e.owners.find((x) => first(x.name) === first(o.name));
    if (!match) {
      plan.newOwners.push(o);
      plan.changes.push(`${o.name} added`);
    } else if (o.phone && !match.phone) {
      plan.phones.push({ ownerId: match.ownerId, phone: o.phone });
      plan.changes.push(`${match.name}'s mobile`);
    }
  }

  return plan;
}
