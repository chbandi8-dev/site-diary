import { createOwnerClient } from "@/lib/supabase/server";

/**
 * Every read on the homeowner side.
 *
 * Rows come back untyped because there is no generated Supabase schema, so each
 * query casts to the shape declared above. Keep the select list and the type in
 * step — the cast is the only thing checking them.
 *
 * Not one of these functions filters by house. They don't need to: the client
 * carries the owner's own JWT, and the policies in
 * supabase/migrations/0001_rls.sql scope every row in Postgres. If a query here
 * returns another client's house, that is a policy bug, not a missing `where` —
 * which is exactly the property we wanted, because a `where` can be forgotten
 * in a refactor and a policy cannot.
 *
 * Never import Prisma into this file. It connects as the table owner and
 * bypasses all of it. The ESLint fence in .eslintrc.json enforces that.
 */

export type OwnerHouse = {
  id: string;
  address: string;
  suburb: string | null;
  storeys: number;
  status: string;
  waiting_on: string | null;
  waiting_on_eta: string | null;
  handover_from: string | null;
  handover_to: string | null;
  handed_over_at: string | null;
};

export type OwnerStage = {
  id: string;
  name: string;
  phase: string | null;
  position: number;
  status: string;
  estimated_end: string | null;
  completed_at: string | null;
  is_payment_milestone: boolean;
};

export type OwnerUpdate = {
  id: string;
  kind: string;
  body: string;
  occurred_at: string;
  photos: { id: string; key: string; caption: string | null }[];
};

export type OwnerReportRow = {
  id: string;
  kind: string;
  status: string;
  body: string;
  created_at: string;
  acknowledged_at: string | null;
  reply_body: string | null;
  replied_at: string | null;
  photo_id: string | null;
};

export async function getMyHouses(): Promise<OwnerHouse[]> {
  const supabase = createOwnerClient();
  const { data, error } = await supabase
    .from("houses")
    .select(
      "id, address, suburb, storeys, status, waiting_on, waiting_on_eta, " +
        "handover_from, handover_to, handed_over_at"
    )
    .order("address");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OwnerHouse[];
}

export async function getHouse(houseId: string): Promise<OwnerHouse | null> {
  const supabase = createOwnerClient();
  const { data, error } = await supabase
    .from("houses")
    .select(
      "id, address, suburb, storeys, status, waiting_on, waiting_on_eta, " +
        "handover_from, handover_to, handed_over_at"
    )
    .eq("id", houseId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as OwnerHouse | null) ?? null;
}

export async function getStages(houseId: string): Promise<OwnerStage[]> {
  const supabase = createOwnerClient();
  const { data, error } = await supabase
    .from("house_stages")
    .select("id, name, phase, position, status, estimated_end, completed_at, is_payment_milestone")
    .eq("house_id", houseId)
    .order("position");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OwnerStage[];
}

export async function getTimeline(houseId: string, limit = 40): Promise<OwnerUpdate[]> {
  const supabase = createOwnerClient();
  const { data, error } = await supabase
    .from("updates")
    .select("id, kind, body, occurred_at, photos(id, key, caption)")
    .eq("house_id", houseId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OwnerUpdate[];
}

export async function getMyReports(houseId: string): Promise<OwnerReportRow[]> {
  const supabase = createOwnerClient();
  const { data, error } = await supabase
    .from("owner_reports")
    .select(
      "id, kind, status, body, created_at, acknowledged_at, reply_body, replied_at, photo_id"
    )
    .eq("house_id", houseId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OwnerReportRow[];
}

/**
 * Progress as a share of expected working days, not "stage 6 of 31".
 *
 * Position-based percentages lie badly on a build: lock-up sits around the
 * halfway mark by count and roughly a third by time, and he would spend the
 * rest of the project explaining the gap.
 */
export function progressPercent(stages: OwnerStage[]): number {
  const counted = stages.filter((s) => s.status !== "not_applicable");
  if (counted.length === 0) return 0;
  const done = counted.filter((s) => s.status === "complete").length;
  return Math.round((done / counted.length) * 100);
}

export function activeStages(stages: OwnerStage[]): OwnerStage[] {
  return stages.filter((s) => s.status === "in_progress");
}

export function nextStage(stages: OwnerStage[]): OwnerStage | undefined {
  return stages.find((s) => s.status === "scheduled" || s.status === "not_started");
}
