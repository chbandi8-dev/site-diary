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
};

type Section = "owner" | "status" | "next";

const HEADERS: [Section, RegExp][] = [
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
    };
    houses.push(cur);
    section = null;
    sections = 0;
  };

  const add = (target: ParsedHouse, kind: Section, value: string) => {
    if (kind === "owner") target.owners.push(...parseOwners(value));
    else {
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
  const reported = new Map<string, boolean>(); // stage -> every line about it says done
  const upcoming = new Set<string>();

  for (const line of status) {
    const stage = stageFor(line, known);
    if (!stage) {
      unmatched.push(line);
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
    const inStatus = reported.has(stage);
    const inNext = upcoming.has(stage);
    if (!inStatus && !inNext) continue;
    plan.push({
      stage,
      status: inNext
        ? inStatus
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
