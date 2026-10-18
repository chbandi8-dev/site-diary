import type Anthropic from "@anthropic-ai/sdk";

/**
 * What the voice assistant can do, as data.
 *
 * Everything that is not the model call itself lives here so it can be tested
 * without one: the list of tools the model is offered, and the step that turns
 * whatever it called into actions — validating every field, and dropping
 * anything that cannot be placed rather than guessing.
 */

export type Action =
  | { kind: "stage"; house: number; stage: string; status: StageStatus }
  | { kind: "note"; house: number; body: string }
  | { kind: "update"; house: number; body: string; updateKind: UpdateKind }
  | { kind: "waiting"; house: number; waitingOn: string | null; eta: string | null }
  | { kind: "next_week"; house: number; body: string }
  | { kind: "wet_day"; house: number; date: string; note: string | null }
  | { kind: "defect"; house: number; location: string | null; description: string; target: string | null }
  | { kind: "owner"; house: number; name: string; phone: string | null; email: string | null }
  | { kind: "handover"; house: number; from: string | null; to: string | null }
  | {
      kind: "inspection";
      house: number;
      inspection: InspectionKindName;
      label: string | null;
      status: "to_book" | "booked" | "passed" | "failed";
      date: string | null;
    }
  | { kind: "house_status"; house: number; status: "handed_over" | "active" }
  | { kind: "defect_done"; house: number; defect: string }
  | { kind: "trade"; name: string; trade: string; phone: string | null; company: string | null; notes: string | null }
  | {
      kind: "house";
      address: string;
      suburb: string | null;
      storeys: 1 | 2 | null;
      owners: { name: string; email: string | null }[];
      currentStage: string | null;
      waitingOn: string | null;
      handoverFrom: string | null;
      handoverTo: string | null;
    };

export type InspectionKindName =
  | "pre_pour_footings"
  | "frame"
  | "waterproofing"
  | "stormwater"
  | "vehicle_crossing"
  | "final_occupation"
  | "other";

const INSPECTION_KIND_NAMES: InspectionKindName[] = [
  "pre_pour_footings",
  "frame",
  "waterproofing",
  "stormwater",
  "vehicle_crossing",
  "final_occupation",
  "other",
];

export type StageStatus =
  | "not_started"
  | "scheduled"
  | "in_progress"
  | "on_hold"
  | "complete"
  | "not_applicable";

export type UpdateKind = "progress" | "delay" | "milestone" | "weather" | "message";

const HOUSE_REF = {
  type: "integer" as const,
  description: "The number of the house from the numbered list.",
};

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "set_stage",
    description: "Move a stage of one house to a new status.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        stage: { type: "string", description: "Exactly one name from the allowed stage list." },
        status: {
          type: "string",
          enum: ["not_started", "scheduled", "in_progress", "on_hold", "complete", "not_applicable"],
        },
      },
      required: ["house", "stage", "status"],
    },
  },
  {
    name: "add_private_note",
    description:
      "Add an entry to his own private site diary for one house. Owners never see these.",
    input_schema: {
      type: "object",
      properties: { house: HOUSE_REF, body: { type: "string" } },
      required: ["house", "body"],
    },
  },
  {
    name: "draft_owner_update",
    description:
      "Draft a message to the homeowners of one house. Saved unsent for him to read and send.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        body: { type: "string", description: "Written for the owners to read." },
        kind: {
          type: "string",
          enum: ["progress", "delay", "milestone", "weather", "message"],
          description: "delay if it tells them something is running late.",
        },
      },
      required: ["house", "body"],
    },
  },
  {
    name: "set_waiting_on",
    description: "Set what is holding one house up. Owners see this.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        waitingOn: { type: "string", description: "A short phrase. Empty clears it." },
        eta: { type: "string", description: "YYYY-MM-DD, when he expects it." },
      },
      required: ["house"],
    },
  },
  {
    name: "set_next_week",
    description: "Set what is happening on one house next week. Owners see this.",
    input_schema: {
      type: "object",
      properties: { house: HOUSE_REF, body: { type: "string" } },
      required: ["house", "body"],
    },
  },
  {
    name: "log_wet_day",
    description: "Record a day lost to weather on one house.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        date: { type: "string", description: "YYYY-MM-DD. Today if he did not say." },
        note: { type: "string" },
      },
      required: ["house"],
    },
  },
  {
    name: "log_defect",
    description: "Record something that needs fixing on one house.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        location: { type: "string", description: "Room or area." },
        description: { type: "string" },
        target: { type: "string", description: "YYYY-MM-DD, when it should be fixed by." },
      },
      required: ["house", "description"],
    },
  },
  {
    name: "set_owner_contact",
    description:
      "Save an owner's mobile number or email on one house. Adds the person if they are not on it yet.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        name: { type: "string", description: "The owner's name as he said it." },
        phone: { type: "string", description: "Exactly as spoken, digits and any + prefix." },
        email: { type: "string" },
      },
      required: ["house", "name"],
    },
  },
  {
    name: "set_handover",
    description:
      "Set the handover date or window for one house — the date owners are told. Use when he says when a house will be handed over.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        from: { type: "string", description: "YYYY-MM-DD, the start of the window. Same as 'to' for a single date." },
        to: { type: "string", description: "YYYY-MM-DD, the end of the window — the date promised." },
      },
      required: ["house"],
    },
  },
  {
    name: "set_inspection",
    description:
      "An inspection on one house: book it, or record that it passed or failed. Use 'other' with a label for any the list does not name, such as the engineer's inspection.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        inspection: { type: "string", enum: INSPECTION_KIND_NAMES },
        label: { type: "string", description: "Only for 'other': what he calls it." },
        status: { type: "string", enum: ["to_book", "booked", "passed", "failed"] },
        date: { type: "string", description: "YYYY-MM-DD, when it is booked for." },
      },
      required: ["house", "inspection", "status"],
    },
  },
  {
    name: "set_house_status",
    description:
      "Mark a finished house as handed over, or reopen one that was handed over. Only when he says the house has been handed over or is being reopened.",
    input_schema: {
      type: "object",
      properties: { house: HOUSE_REF, status: { type: "string", enum: ["handed_over", "active"] } },
      required: ["house", "status"],
    },
  },
  {
    name: "resolve_defect",
    description:
      "Mark a defect on one house as fixed. Give its number if he said one, otherwise the words he used for it.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        defect: { type: "string", description: "The defect's number, or a few words describing it." },
      },
      required: ["house", "defect"],
    },
  },
  {
    name: "add_trade",
    description: "Add a tradesperson to his address book. Takes no house number.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        trade: { type: "string", description: "What they do: plumber, sparky, tiler." },
        phone: { type: "string", description: "Exactly as spoken." },
        company: { type: "string" },
        notes: { type: "string" },
      },
      required: ["name", "trade"],
    },
  },
  {
    name: "record_new_house",
    description: "A house he is adding to the books. Not for a house already on the list.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Street number and street name." },
        suburb: { type: "string" },
        storeys: { type: "integer", enum: [1, 2] },
        owners: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, email: { type: "string" } },
            required: ["name"],
          },
        },
        currentStage: { type: "string", description: "Exactly one name from the allowed list." },
        waitingOn: { type: "string" },
        handoverFrom: { type: "string", description: "YYYY-MM-DD" },
        handoverTo: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["address"],
    },
  },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Anything malformed is dropped rather than shown — a bad date he skims past gets saved. */
function cleanDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? null : value;
}

function cleanText(value: unknown, max = 400): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}


/**
 * Turns what the model called into actions he can check.
 *
 * Takes the raw content blocks so it can be exercised with made-up ones. A house
 * number that is not on his list, a stage that is not on the standard list, a
 * date that is not a date, a number with no digits: each is dropped, never
 * repaired — a wrong action is dearer than a missing one.
 */
export function interpretToolCalls(
  content: { type: string; name?: string; input?: unknown }[],
  opts: { houseNumbers: Set<number>; stageNames: string[]; today: string }
): Action[] {
  const { houseNumbers, today } = opts;
  const known = new Set(opts.stageNames);
  const actions: Action[] = [];

  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const raw = (block.input ?? {}) as Record<string, unknown>;
    // A house number that is not on his list is the one failure mode that
    // would file today's work against somebody else's build. Dropped, never
    // coerced to the nearest number.
    const house = typeof raw.house === "number" ? raw.house : -1;
    const placed = houseNumbers.has(house);

    switch (block.name) {
      case "set_stage": {
        const stage = cleanText(raw.stage, 120);
        if (!placed || !stage || !known.has(stage)) break;
        const status = raw.status;
        if (typeof status !== "string") break;
        if (
          !["not_started", "scheduled", "in_progress", "on_hold", "complete", "not_applicable"].includes(
            status
          )
        )
          break;
        actions.push({ kind: "stage", house, stage, status: status as StageStatus });
        break;
      }

      case "add_private_note": {
        const body = cleanText(raw.body, 4000);
        if (!placed || !body) break;
        actions.push({ kind: "note", house, body });
        break;
      }

      case "draft_owner_update": {
        const body = cleanText(raw.body, 4000);
        if (!placed || !body) break;
        const k = typeof raw.kind === "string" ? raw.kind : "progress";
        const updateKind = (
          ["progress", "delay", "milestone", "weather", "message"].includes(k) ? k : "progress"
        ) as UpdateKind;
        actions.push({ kind: "update", house, body, updateKind });
        break;
      }

      case "set_waiting_on": {
        if (!placed) break;
        actions.push({
          kind: "waiting",
          house,
          waitingOn: cleanText(raw.waitingOn, 200),
          eta: cleanDate(raw.eta),
        });
        break;
      }

      case "set_next_week": {
        const body = cleanText(raw.body, 1000);
        if (!placed || !body) break;
        actions.push({ kind: "next_week", house, body });
        break;
      }

      case "log_wet_day": {
        if (!placed) break;
        actions.push({
          kind: "wet_day",
          house,
          date: cleanDate(raw.date) ?? today,
          note: cleanText(raw.note, 200),
        });
        break;
      }

      case "log_defect": {
        const description = cleanText(raw.description, 2000);
        if (!placed || !description) break;
        actions.push({
          kind: "defect",
          house,
          location: cleanText(raw.location, 120),
          description,
          target: cleanDate(raw.target),
        });
        break;
      }

      case "set_owner_contact": {
        const name = cleanText(raw.name, 120);
        const phone = cleanText(raw.phone, 40);
        const email = cleanText(raw.email, 200);
        const goodEmail = email && email.includes("@") ? email.toLowerCase() : null;
        // A phone with no digits in it is a mishearing, not a number.
        const goodPhone = phone && phone.replace(/\D/g, "").length >= 8 ? phone : null;
        if (!placed || !name || (!goodPhone && !goodEmail)) break;
        actions.push({ kind: "owner", house, name, phone: goodPhone, email: goodEmail });
        break;
      }

      case "set_handover": {
        const to = cleanDate(raw.to);
        const from = cleanDate(raw.from);
        if (!placed || (!to && !from)) break;
        // One date means a window of one day, not a half-set window.
        const end = to ?? from!;
        const start = from ?? end;
        actions.push({ kind: "handover", house, from: start <= end ? start : end, to: end });
        break;
      }

      case "set_inspection": {
        const kind = raw.inspection;
        const status = raw.status;
        if (!placed || typeof kind !== "string" || !INSPECTION_KIND_NAMES.includes(kind as InspectionKindName)) break;
        if (status !== "to_book" && status !== "booked" && status !== "passed" && status !== "failed") break;
        const label = cleanText(raw.label, 80);
        // "Something else" with no name is not something that can be filed.
        if (kind === "other" && !label) break;
        actions.push({
          kind: "inspection",
          house,
          inspection: kind as InspectionKindName,
          label: kind === "other" ? label : null,
          status,
          date: status === "booked" || status === "to_book" ? cleanDate(raw.date) : null,
        });
        break;
      }

      case "set_house_status": {
        const status = raw.status;
        if (!placed || (status !== "handed_over" && status !== "active")) break;
        actions.push({ kind: "house_status", house, status });
        break;
      }

      case "resolve_defect": {
        const defect = cleanText(raw.defect, 200);
        if (!placed || !defect) break;
        actions.push({ kind: "defect_done", house, defect });
        break;
      }

      case "add_trade": {
        const name = cleanText(raw.name, 120);
        const trade = cleanText(raw.trade, 60);
        if (!name || !trade) break;
        const phone = cleanText(raw.phone, 40);
        actions.push({
          kind: "trade",
          name,
          trade,
          phone: phone && phone.replace(/\D/g, "").length >= 8 ? phone : null,
          company: cleanText(raw.company, 120),
          notes: cleanText(raw.notes, 500),
        });
        break;
      }

      case "record_new_house": {
        const address = cleanText(raw.address, 200);
        if (!address) break;
        const owners = Array.isArray(raw.owners)
          ? raw.owners
              .map((o) => {
                const person = o as Record<string, unknown>;
                const name = cleanText(person.name, 120);
                if (!name) return null;
                const email = cleanText(person.email, 200);
                return { name, email: email && email.includes("@") ? email.toLowerCase() : null };
              })
              .filter((o): o is { name: string; email: string | null } => o !== null)
              .slice(0, 2)
          : [];
        const stage = cleanText(raw.currentStage, 120);
        actions.push({
          kind: "house",
          address,
          suburb: cleanText(raw.suburb, 120),
          storeys: raw.storeys === 2 ? 2 : raw.storeys === 1 ? 1 : null,
          owners,
          currentStage: stage && known.has(stage) ? stage : null,
          waitingOn: cleanText(raw.waitingOn, 200),
          handoverFrom: cleanDate(raw.handoverFrom),
          handoverTo: cleanDate(raw.handoverTo),
        });
        break;
      }
    }
  }

  return actions;
}
