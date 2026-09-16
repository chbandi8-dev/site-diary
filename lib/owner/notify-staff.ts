import { queue, deliverNow } from "@/lib/notify";
import { staffForNotification, houseAddress } from "@/lib/db/owner";

/**
 * Telling him an owner has raised something.
 *
 * There is a database trigger that does this too, added early on and applied by
 * hand with psql — which means on any database where that step was skipped, an
 * owner's report reached nobody and the only symptom was silence.
 *
 * This does it in application code, where the rest of the notifications now
 * live, using the trigger's exact dedupe key. If the trigger is installed the
 * queue already holds that row and this adds nothing; if it was never applied,
 * this is what gets him told. Either way he hears once.
 */
export async function notifyStaffOfReport(input: {
  reportId: string;
  houseId: string;
  kind: "question" | "issue" | "maintenance";
  body: string;
  fromName: string;
}): Promise<void> {
  const [staff, address] = await Promise.all([
    staffForNotification(),
    houseAddress(input.houseId),
  ]);

  const subject =
    input.kind === "maintenance"
      ? `${address} — owner reported something to fix`
      : input.kind === "issue"
        ? `${address} — owner raised an issue`
        : `${address} — owner asked a question`;

  await queue(
    staff
      .filter((s) => s.email)
      .map((s) => ({
        recipient: {
          audience: "staff" as const,
          userId: s.id,
          email: s.email,
          name: s.name ?? "there",
        },
        // Byte-identical to the trigger's key, which is what stops the two
        // paths sending the same thing twice.
        dedupeKey: `report:${input.reportId}:${s.email}`,
        subject,
        body: `${input.fromName} wrote:\n\n${input.body}`,
        houseId: input.houseId,
        reportId: input.reportId,
      }))
  );

  await deliverNow();
}
