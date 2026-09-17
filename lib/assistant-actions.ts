import type { StageStatus, UpdateKind } from "@/lib/assistant";

/**
 * The shape an action travels in between the server that proposed it and the
 * screen that shows it for approval.
 *
 * Its own module so the review sheet — a client component — can hold these
 * types without pulling the Anthropic SDK into the browser bundle.
 *
 * `payload` is the only part the apply route reads, and it re-validates every
 * field of it. The rest is presentation: a title he can read at a glance, which
 * house it lands on spelled out in full, and whether anyone but him will see
 * the result. That last one is not decoration — the difference between a
 * private note and a message to a homeowner is the whole reason this screen
 * exists.
 */

export type ActionPayload =
  | { kind: "stage"; houseId: string; stage: string; status: StageStatus }
  | { kind: "note"; houseId: string; body: string }
  | { kind: "update"; houseId: string; body: string; updateKind: UpdateKind }
  | { kind: "waiting"; houseId: string; waitingOn: string | null; eta: string | null }
  | { kind: "next_week"; houseId: string; body: string }
  | { kind: "wet_day"; houseId: string; date: string; note: string | null }
  | {
      kind: "defect";
      houseId: string;
      location: string | null;
      description: string;
      target: string | null;
    }
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

export type ProposedAction = {
  /** Stable key for the review list. Not read by the server. */
  id: string;
  /** What he reads: "Mark the frame as done". */
  title: string;
  /** The build this lands on, spelled out. Never abbreviated. */
  houseLabel: string;
  /** Which of the free-text fields on the payload he can edit here, if any. */
  bodyField: "body" | "description" | null;
  /** The label above that field. */
  bodyLabel: string | null;
  /** Who ends up seeing the result. */
  seenBy: "you" | "owners";
  /** Anything worth saying under the action — a date, a warning. */
  footnote: string | null;
  payload: ActionPayload;
};
