import type { Action } from "./assistant-tools";
import type { ProposedAction } from "./assistant-actions";
import { inspectionName } from "./inspections";

/**
 * Turning what the assistant understood into the checklist he approves.
 *
 * Pure, so the whole screen-facing side — the wording of each line, who will see
 * the result, how a spoken name is matched to a person or a defect already on
 * the house — can be tested without a database or a model. The route supplies
 * the houses; nothing here reads or writes anything.
 */

export type HouseCtx = {
  id: string;
  /** "12 Example Street, Parramatta" — spelled out in full, never abbreviated. */
  label: string;
  owners: { id: string; name: string; phone: string | null }[];
  openDefects: { id: string; reference: string | null; location: string | null; description: string }[];
};

const STATUS_WORDS: Record<string, string> = {
  not_started: "not started",
  scheduled: "scheduled",
  in_progress: "underway",
  on_hold: "on hold",
  complete: "done",
  not_applicable: "not applicable",
};

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Arny" matches "Arny Saha" when it is the only Arny; two Sahas never match "Saha". */
export function matchOwner(spoken: string, people: HouseCtx["owners"]) {
  const said = spoken.trim().toLowerCase();
  const exact = people.filter((p) => p.name.trim().toLowerCase() === said);
  if (exact.length === 1) return exact[0];
  const first = said.split(/\s+/)[0];
  const byFirst = people.filter((p) => p.name.trim().toLowerCase().split(/\s+/)[0] === first);
  return byFirst.length === 1 ? byFirst[0] : null;
}

/** By number ("7", "#7", "number seven" is left to the model), else a unique match on his words. */
export function matchDefect(spoken: string, defects: HouseCtx["openDefects"]) {
  const said = spoken.trim().toLowerCase().replace(/^(no\.?|number|item|#)\s*/i, "");
  const byRef = defects.filter((d) => d.reference !== null && d.reference.toLowerCase() === said);
  if (byRef.length === 1) return byRef[0];
  if (said.length < 3) return null;
  const words = defects.filter((d) =>
    `${d.location ?? ""} ${d.description}`.toLowerCase().includes(said)
  );
  return words.length === 1 ? words[0] : null;
}

export function proposeActions(
  actions: Action[],
  houseAt: (n: number) => HouseCtx | undefined
): { actions: ProposedAction[]; notes: string[] } {
  const out: ProposedAction[] = [];
  const notes: string[] = [];

  actions.forEach((action, i) => {
    const id = `a${i}`;

    if (action.kind === "house") {
      const parts = [action.suburb, action.storeys ? `${action.storeys} storey` : null]
        .filter(Boolean)
        .join(" · ");
      out.push({
        id,
        title: `Add ${action.address} to the books`,
        houseLabel: parts || "New house",
        bodyField: null,
        bodyLabel: null,
        seenBy: "you",
        footnote: [
          action.owners.length
            ? `Owners: ${action.owners.map((o) => o.name).join(" & ")}`
            : "No owners yet",
          action.currentStage ? `Starting at ${action.currentStage}` : null,
          "All 32 standard stages are copied across",
        ]
          .filter(Boolean)
          .join(" · "),
        payload: {
          kind: "house",
          address: action.address,
          suburb: action.suburb,
          storeys: action.storeys,
          owners: action.owners,
          currentStage: action.currentStage,
          waitingOn: action.waitingOn,
          handoverFrom: action.handoverFrom,
          handoverTo: action.handoverTo,
        },
      });
      return;
    }

    if (action.kind === "trade") {
      out.push({
        id,
        title: `Add ${action.name} (${action.trade}) to your trades`,
        houseLabel: "Your address book",
        bodyField: null,
        bodyLabel: null,
        seenBy: "you",
        footnote: [action.company, action.phone && `Mobile ${action.phone}`, action.notes]
          .filter(Boolean)
          .join(" · ") || null,
        payload: {
          kind: "trade",
          name: action.name,
          trade: action.trade,
          phone: action.phone,
          company: action.company,
          notes: action.notes,
        },
      });
      return;
    }

    const house = houseAt(action.house);
    if (!house) return;
    const common = { id, houseLabel: house.label };

    switch (action.kind) {
      case "stage":
        out.push({
          ...common,
          title: `Mark ${action.stage} as ${STATUS_WORDS[action.status] ?? action.status}`,
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote: "Owners see the phase move on their page",
          payload: { kind: "stage", houseId: house.id, stage: action.stage, status: action.status },
        });
        break;

      case "note":
        out.push({
          ...common,
          title: "Add a private note",
          bodyField: "body",
          bodyLabel: "Your note",
          seenBy: "you",
          footnote: "Owners never see these. Keep it factual — a diary is discoverable in a dispute",
          payload: { kind: "note", houseId: house.id, body: action.body },
        });
        break;

      case "update":
        out.push({
          ...common,
          title: "Draft an update for the owners",
          bodyField: "body",
          bodyLabel: "What they'll read",
          seenBy: "owners",
          footnote: "Saved unsent. You read it and send it from the house page",
          payload: { kind: "update", houseId: house.id, body: action.body, updateKind: action.updateKind },
        });
        break;

      case "waiting":
        out.push({
          ...common,
          title: action.waitingOn ? `Waiting on: ${action.waitingOn}` : "Clear what this house is waiting on",
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote: action.eta ? `Expected ${shortDate(action.eta)}` : "No date given",
          payload: { kind: "waiting", houseId: house.id, waitingOn: action.waitingOn, eta: action.eta },
        });
        break;

      case "next_week":
        out.push({
          ...common,
          title: "Set what's happening next week",
          bodyField: "body",
          bodyLabel: "Next week",
          seenBy: "owners",
          footnote: "Goes out with Friday's email",
          payload: { kind: "next_week", houseId: house.id, body: action.body },
        });
        break;

      case "wet_day":
        out.push({
          ...common,
          title: `Log ${shortDate(action.date)} as a wet day`,
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote: action.note ?? "Counts towards an extension of time",
          payload: { kind: "wet_day", houseId: house.id, date: action.date, note: action.note },
        });
        break;

      case "defect":
        out.push({
          ...common,
          title: action.location ? `Defect — ${action.location}` : "Add a defect",
          bodyField: "description",
          bodyLabel: "What needs fixing",
          seenBy: "owners",
          footnote: action.target ? `Target ${shortDate(action.target)}` : "Owners see their defects list",
          payload: {
            kind: "defect",
            houseId: house.id,
            location: action.location,
            description: action.description,
            target: action.target,
          },
        });
        break;

      case "owner": {
        const match = matchOwner(action.name, house.owners);
        const what = [action.phone && "mobile", action.email && "email"].filter(Boolean).join(" and ");
        const was = house.owners.find((o) => o.id === match?.id)?.phone;
        out.push({
          ...common,
          title: match ? `Save ${match.name}'s ${what}` : `Add ${action.name} as an owner`,
          bodyField: null,
          bodyLabel: null,
          seenBy: "you",
          footnote: [
            action.phone && `Mobile ${action.phone}`,
            action.email,
            was && action.phone && was !== action.phone ? `Replaces ${was}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          payload: {
            kind: "owner",
            houseId: house.id,
            ownerId: match?.id ?? null,
            name: match?.name ?? action.name,
            phone: action.phone,
            email: action.email,
          },
        });
        break;
      }

      case "send": {
        const named = action.to ? matchOwner(action.to, house.owners) : null;
        const targets = named ? [named] : house.owners;
        const who = targets.map((o) => o.name.split(" ")[0]).join(" & ");
        if (action.to && !named) {
          notes.push(
            `Couldn't tell which owner "${action.to}" is on ${house.label}, so the message is set for everyone on the house — untick it if that's wrong.`
          );
        }
        out.push({
          ...common,
          title: who ? `Send this to ${who} on WhatsApp` : "Post this to the owners' page",
          bodyField: "body",
          bodyLabel: "What they'll read — edit anything",
          seenBy: "owners",
          footnote:
            action.messageKind === "delay"
              ? "A delay is saved as a draft first — ring them, then send. You still get the WhatsApp button"
              : "It goes on their page, and WhatsApp opens for you to tap send. Nothing leaves until you tap",
          payload: {
            kind: "send",
            houseId: house.id,
            body: action.body,
            updateKind: action.messageKind,
            ownerIds: targets.map((o) => o.id),
          },
        });
        break;
      }

      case "handover":
        // An email address is not needed to tell owners: it only changes the date
        // they see. Nobody is emailed from here.
        out.push({
          ...common,
          title:
            action.from === action.to
              ? `Set handover to ${longDate(action.to!)}`
              : `Set handover to ${shortDate(action.from!)} – ${shortDate(action.to!)}`,
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote: "Owners see this date. Nobody is emailed — tell them yourself if it has moved",
          payload: { kind: "handover", houseId: house.id, from: action.from!, to: action.to! },
        });
        break;

      case "inspection": {
        const name = inspectionName(action.inspection, action.label);
        const title =
          action.status === "passed"
            ? `${name} passed`
            : action.status === "failed"
              ? `${name} failed`
              : action.status === "booked" && action.date
                ? `${name} booked for ${longDate(action.date)}`
                : action.status === "booked"
                  ? `${name} booked`
                  : `${name} still to book`;
        out.push({
          ...common,
          title,
          bodyField: null,
          bodyLabel: null,
          seenBy: "you",
          footnote:
            action.status === "failed"
              ? "Shows on your list until you rebook it"
              : "Updates the one already on this house, or adds it",
          payload: {
            kind: "inspection",
            houseId: house.id,
            inspectionKind: action.inspection,
            label: action.label,
            status: action.status,
            date: action.date,
          },
        });
        break;
      }

      case "house_status":
        out.push({
          ...common,
          title:
            action.status === "handed_over"
              ? "Mark this house as handed over"
              : "Reopen this house",
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote:
            action.status === "handed_over"
              ? "It leaves your active list. You can reopen it from Handed over"
              : "It goes back on your active list",
          payload: { kind: "house_status", houseId: house.id, status: action.status },
        });
        break;

      case "defect_done": {
        const match = matchDefect(action.defect, house.openDefects);
        if (!match) {
          notes.push(
            `Couldn't tell which defect "${action.defect}" is on ${house.label} — open the Site tab and tick it there.`
          );
          break;
        }
        out.push({
          ...common,
          title: `Defect ${match.reference ?? ""} is fixed`.replace("  ", " "),
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote: `${match.location ? `${match.location} — ` : ""}${match.description}. Owners see it ticked off; no email is sent`,
          payload: { kind: "defect_done", houseId: house.id, defectId: match.id },
        });
        break;
      }
    }
  });

  return { actions: out, notes };
}
