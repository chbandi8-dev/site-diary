import { z } from "zod";

/**
 * What the apply step will accept, per kind of action.
 *
 * One definition shared by the route that carries actions out and the tests that
 * check every proposal the assistant can make would actually be accepted. Anything
 * that arrives from the browser is validated against this again — nothing is
 * trusted twice just because it was on his screen.
 */

const houseId = z.string().uuid();
const isoDay = z.string().date();

export const payload = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("stage"),
    houseId,
    stage: z.string().trim().min(1).max(120),
    status: z.enum(["not_started", "scheduled", "in_progress", "on_hold", "complete", "not_applicable"]),
  }),
  z.object({ kind: z.literal("note"), houseId, body: z.string().trim().min(1).max(4000) }),
  z.object({
    kind: z.literal("update"),
    houseId,
    body: z.string().trim().min(1).max(4000),
    updateKind: z.enum(["progress", "delay", "milestone", "weather", "message"]),
  }),
  z.object({
    kind: z.literal("waiting"),
    houseId,
    waitingOn: z.string().trim().max(200).nullable(),
    eta: isoDay.nullable(),
  }),
  z.object({ kind: z.literal("next_week"), houseId, body: z.string().trim().min(1).max(1000) }),
  z.object({
    kind: z.literal("wet_day"),
    houseId,
    date: isoDay,
    note: z.string().trim().max(200).nullable(),
  }),
  z.object({
    kind: z.literal("defect"),
    houseId,
    location: z.string().trim().max(120).nullable(),
    description: z.string().trim().min(1).max(600),
    target: isoDay.nullable(),
  }),
  z.object({
    kind: z.literal("owner"),
    houseId,
    ownerId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).nullable(),
    email: z.string().trim().email().max(200).nullable(),
  }),
  z.object({
    kind: z.literal("handover"),
    houseId,
    from: isoDay,
    to: isoDay,
  }),
  z.object({
    kind: z.literal("inspection"),
    houseId,
    inspectionKind: z.enum([
      "pre_pour_footings",
      "frame",
      "waterproofing",
      "stormwater",
      "vehicle_crossing",
      "final_occupation",
      "other",
    ]),
    label: z.string().trim().max(80).nullable(),
    status: z.enum(["to_book", "booked", "passed", "failed"]),
    date: isoDay.nullable(),
  }),
  z.object({ kind: z.literal("house_status"), houseId, status: z.enum(["handed_over", "active"]) }),
  z.object({ kind: z.literal("defect_done"), houseId, defectId: z.string().uuid() }),
  z.object({
    kind: z.literal("trade"),
    name: z.string().trim().min(1).max(120),
    trade: z.string().trim().min(1).max(60),
    phone: z.string().trim().max(40).nullable(),
    company: z.string().trim().max(120).nullable(),
    notes: z.string().trim().max(500).nullable(),
  }),
  z.object({
    kind: z.literal("house"),
    address: z.string().trim().min(3).max(200),
    suburb: z.string().trim().max(120).nullable(),
    storeys: z.union([z.literal(1), z.literal(2)]).nullable(),
    owners: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          email: z.string().trim().max(200).nullable(),
        })
      )
      .max(2),
    currentStage: z.string().trim().max(120).nullable(),
    waitingOn: z.string().trim().max(200).nullable(),
    handoverFrom: isoDay.nullable(),
    handoverTo: isoDay.nullable(),
  }),
]);

export type Payload = z.infer<typeof payload>;
