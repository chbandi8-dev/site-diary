/**
 * Bulk-loads real houses from the intake sheet.
 *
 * Onboarding is the step that quietly kills a rollout: at an evening per house
 * he does three and stops. This turns 25 houses into one spreadsheet and one
 * command.
 *
 *   npx ts-node scripts/import-houses.ts docs/houses.csv --dry-run
 *   npx ts-node scripts/import-houses.ts docs/houses.csv
 *
 * Idempotent — houses match on address, so fixing the sheet and re-running
 * corrects rather than duplicates.
 */

import { PrismaClient, type StageStatus } from "@prisma/client";
import { readFileSync } from "fs";

type Row = Record<string, string>;

/**
 * Only the build data is required.
 *
 * Owner columns are optional and usually left empty: the people who receive the
 * house link add their own name and email themselves, which is both less work
 * for him and more accurate than transcribing an address off a contract. Fill
 * them in only where he already has the details to hand.
 */
const REQUIRED = ["address", "current_stage"];

function parseCsv(text: string): Row[] {
  // Excel's "CSV UTF-8" export writes a byte-order mark. Without stripping it
  // the first header becomes "\uFEFFaddress", every row reports a missing
  // address, and the very first real import fails for no visible reason.
  text = text.replace(/^\uFEFF/, "");

  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { record.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      if (record.some((f) => f.trim() !== "")) rows.push(record);
      record = []; field = "";
      continue;
    }
    field += c;
  }
  record.push(field);
  if (record.some((f) => f.trim() !== "")) rows.push(record);

  const [header, ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? "").trim()]))
  );
}

/** Loose match, so he can write "brickwork" and get "External walls". */
function matchStage(input: string, names: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = norm(input);
  if (!target) return null;

  const exact = names.find((n) => norm(n) === target);
  if (exact) return exact;

  const contains = names.find((n) => norm(n).includes(target) || target.includes(norm(n)));
  if (contains) return contains;

  const words = target.split(" ").filter((w) => w.length > 3);
  const scored = names
    .map((n) => ({ n, score: words.filter((w) => norm(n).includes(w)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.n ?? null;
}

/**
 * Dates, unambiguously.
 *
 * `new Date("3/12/2026")` parses as 3 December in a US locale and 12 March in
 * an Australian spreadsheet. Silently wrong by nine months, on a handover date
 * shown to a client. So: ISO only, or explicit Australian day-first — and
 * anything else is rejected loudly rather than guessed.
 */
function parseDate(value: string): Date | null | "invalid" {
  const v = value.trim();
  if (!v) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));

  const au = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(v);
  if (au) {
    const [, d, m, y] = au;
    if (+m > 12) return "invalid";
    return new Date(Date.UTC(+y, +m - 1, +d));
  }

  return "invalid";
}

function dateOrNull(value: string): Date | null {
  const parsed = parseDate(value);
  return parsed === "invalid" ? null : parsed;
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file) {
    console.error("Usage: ts-node scripts/import-houses.ts <file.csv> [--dry-run]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const templates = await prisma.stageTemplate.findMany({ orderBy: { position: "asc" } });
  if (templates.length === 0) {
    console.error("No stage templates. Run `npm run db:seed` first.");
    process.exit(1);
  }
  const names = templates.map((t) => t.name);

  const rows = parseCsv(readFileSync(file, "utf8"));
  const problems: string[] = [];
  const planned: { row: Row; stages: string[]; positions: number[] }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    for (const field of REQUIRED) {
      if (!row[field]) problems.push(`Line ${line}: "${field}" is empty`);
    }
    for (const field of ["owner1_email", "owner2_email"]) {
      const value = row[field];
      if (value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        problems.push(`Line ${line}: "${value}" doesn't look like an email address`);
      }
    }


    for (const field of ["waiting_on_date", "handover_from", "handover_to", "started"]) {
      if (parseDate(row[field] ?? "") === "invalid") {
        problems.push(
          `Line ${line}: "${row[field]}" in ${field} isn't a date I can read. ` +
            `Use 2027-03-01, or 1/3/2027 for the 1st of March.`
        );
      }
    }

    const requested = (row.current_stage ?? "")
      .split(";")
      .map((part: string) => part.trim())
      .filter(Boolean);
    const matched: string[] = [];
    for (const want of requested) {
      const hit = matchStage(want, names);
      if (!hit) problems.push(`Line ${line}: couldn't match stage "${want}"`);
      else matched.push(hit);
    }
    planned.push({
      row,
      stages: matched,
      positions: matched.map((m) => templates.find((t) => t.name === m)!.position),
    });
  }

  console.log(`\nRead ${rows.length} house(s) from ${file}\n`);
  for (const p of planned) {
    const owners = [p.row.owner1_name, p.row.owner2_name].filter(Boolean).join(" & ");
    console.log(`  ${p.row.address}${p.row.suburb ? `, ${p.row.suburb}` : ""}`);
    if (owners) console.log(`    owners: ${owners}`);
    console.log(`    now:    ${p.stages.join(" + ") || "(none matched)"}`);
    if (p.row.waiting_on) console.log(`    waiting: ${p.row.waiting_on}`);
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s) — nothing was written:\n`);
    problems.forEach((p) => console.error(`  ${p}`));
    await prisma.$disconnect();
    process.exit(1);
  }

  if (dryRun) {
    console.log("\nDry run — nothing written. Re-run without --dry-run to import.\n");
    await prisma.$disconnect();
    return;
  }

  for (const { row, stages, positions } of planned) {
    const furthest = Math.max(...positions, 0);

    const house = await prisma.house.upsert({
      where: { id: (await prisma.house.findFirst({
        where: { address: row.address }, select: { id: true },
      }))?.id ?? "00000000-0000-0000-0000-000000000000" },
      update: {
        suburb: row.suburb || null,
        storeys: Number(row.storeys) === 2 ? 2 : 1,
        waitingOn: row.waiting_on || null,
        waitingOnEta: dateOrNull(row.waiting_on_date),
        handoverFrom: dateOrNull(row.handover_from),
        handoverTo: dateOrNull(row.handover_to),
        startDate: dateOrNull(row.started),
      },
      create: {
        address: row.address,
        suburb: row.suburb || null,
        storeys: Number(row.storeys) === 2 ? 2 : 1,
        status: "active",
        waitingOn: row.waiting_on || null,
        waitingOnEta: dateOrNull(row.waiting_on_date),
        handoverFrom: dateOrNull(row.handover_from),
        handoverTo: dateOrNull(row.handover_to),
        startDate: dateOrNull(row.started),
      },
    });

    for (const [name, email] of [
      [row.owner1_name, row.owner1_email],
      [row.owner2_name, row.owner2_email],
    ] as const) {
      if (!name || !email) continue;
      const owner = await prisma.owner.upsert({
        where: { email: email.toLowerCase() },
        update: { name },
        create: { name, email: email.toLowerCase() },
      });
      await prisma.houseOwner.upsert({
        where: { houseId_ownerId: { houseId: house.id, ownerId: owner.id } },
        update: { revokedAt: null },
        create: { houseId: house.id, ownerId: owner.id },
      });
    }

    // Updated in place, never deleted and recreated.
    //
    // Deleting cascades away stage_estimates — the table that makes "lock-up
    // moved from 12 March to 26 March because of six wet days" possible — and
    // nulls the stage on every update and photo already filed against it. One
    // re-run to fix a typo in a suburb would silently erase the build's actual
    // history, on a script whose own header promises re-running is safe.
    for (const t of templates) {
      const status: StageStatus = stages.includes(t.name)
        ? "in_progress"
        : t.position < furthest
          ? "complete"
          : t.conditional
            ? "not_applicable"
            : "not_started";

      const shape = {
        name: t.name,
        phase: t.phase,
        position: t.position,
        isPaymentMilestone: t.isPaymentMilestone,
        plannedDays: t.typicalDays,
      };

      await prisma.houseStage.upsert({
        where: { houseId_templateId: { houseId: house.id, templateId: t.id } },
        // Status is only set on creation. Once he has been moving stages in the
        // app, the spreadsheet is the stale copy — re-importing must not walk
        // his work backwards.
        update: shape,
        create: { houseId: house.id, templateId: t.id, status, ...shape },
      });
    }

    console.log(`  ✓ ${row.address}`);
  }

  console.log(`\nImported ${planned.length} house(s).`);
  console.log(
    "Next: open each house in the admin, tap Create link, and send it on WhatsApp.\n"
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
