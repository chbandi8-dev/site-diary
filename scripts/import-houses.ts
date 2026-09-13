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

const REQUIRED = ["address", "owner1_name", "owner1_email", "current_stage"];

function parseCsv(text: string): Row[] {
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

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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

  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    for (const field of REQUIRED) {
      if (!row[field]) problems.push(`Line ${line}: "${field}" is empty`);
    }
    if (row.owner1_email && !row.owner1_email.includes("@")) {
      problems.push(`Line ${line}: "${row.owner1_email}" is not an email address`);
    }

    const requested = (row.current_stage ?? "").split(";").map((s) => s.trim()).filter(Boolean);
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
    console.log(`    owners: ${owners}`);
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
        waitingOnEta: parseDate(row.waiting_on_date),
        handoverFrom: parseDate(row.handover_from),
        handoverTo: parseDate(row.handover_to),
        startDate: parseDate(row.started),
      },
      create: {
        address: row.address,
        suburb: row.suburb || null,
        storeys: Number(row.storeys) === 2 ? 2 : 1,
        status: "active",
        waitingOn: row.waiting_on || null,
        waitingOnEta: parseDate(row.waiting_on_date),
        handoverFrom: parseDate(row.handover_from),
        handoverTo: parseDate(row.handover_to),
        startDate: parseDate(row.started),
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

    await prisma.houseStage.deleteMany({ where: { houseId: house.id } });
    await prisma.houseStage.createMany({
      data: templates.map((t) => {
        const status: StageStatus = stages.includes(t.name)
          ? "in_progress"
          : t.position < furthest
            ? "complete"
            : "not_started";
        return {
          houseId: house.id,
          templateId: t.id,
          name: t.name,
          phase: t.phase,
          position: t.position,
          isPaymentMilestone: t.isPaymentMilestone,
          plannedDays: t.typicalDays,
          status,
        };
      }),
    });

    console.log(`  ✓ ${row.address}`);
  }

  console.log(`\nImported ${planned.length} house(s).`);
  console.log("Next: invite each owner's email in Supabase Auth so they can sign in.\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
