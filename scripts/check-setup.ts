/**
 * Checks everything is wired before any real house depends on it.
 *
 * Each piece is tested where it will actually be used — a database write, a
 * real object into R2, a real email out. Configuration that merely looks
 * present is how you discover at 8pm that photos were never reaching storage.
 *
 *   npm run check:setup                 # everything except sending an email
 *   npm run check:setup you@gmail.com   # also sends a test email there
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { putObject, objectExists, deleteObject, signDownload } from "../lib/r2";
import { sendEmail, emailBackend } from "../lib/notify/email";
import { siteUrl } from "../lib/site-url";

const problems: string[] = [];
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => {
  problems.push(m);
  console.error(`  FAIL  ${m}`);
};

async function checkEnv() {
  console.log("\n1. Settings");
  for (const key of ["DATABASE_URL", "DIRECT_URL", "NEXTAUTH_SECRET", "CRON_SECRET"]) {
    if (process.env[key]) ok(key); else bad(`${key} is not set`);
  }

  try {
    ok(`site URL is ${siteUrl()}`);
  } catch {
    bad("NEXT_PUBLIC_SITE_URL is not set — owner links would point nowhere");
  }

  if (process.env.NEXTAUTH_SECRET === "builddemo-preview-secret-2024") {
    bad("NEXTAUTH_SECRET is still the one published in git history. Rotate it.");
  }
}

async function checkDatabase() {
  console.log("\n2. Database");
  const prisma = new PrismaClient();
  try {
    const stages = await prisma.stageTemplate.count();
    const templates = await prisma.messageTemplate.count();
    ok(`connected — ${stages} stages, ${templates} message templates`);
    if (stages === 0) bad("No stages. Run: npm run db:seed");

    // Prove writes work, not just reads.
    const probe = await prisma.siteContent.upsert({
      where: { key: "__setup_probe" },
      update: { value: new Date().toISOString() },
      create: { key: "__setup_probe", value: new Date().toISOString() },
    });
    await prisma.siteContent.delete({ where: { id: probe.id } });
    ok("writes work");
  } catch (e) {
    bad(`cannot reach the database — ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function checkStorage() {
  console.log("\n3. Photo storage");
  const key = `__setup-check/${randomUUID()}.txt`;
  try {
    await putObject(key, Buffer.from("setup check"), "text/plain");
    if (!(await objectExists(key))) throw new Error("uploaded but not found");
    const url = await signDownload(key);
    if (!url.startsWith("http")) throw new Error("could not sign a URL");
    await deleteObject(key);
    ok("R2 upload, signed read and delete all work");
  } catch (e) {
    bad(`R2 is not working — ${(e as Error).message.split("\n")[0]}`);
  }

  console.log(
    "  note  CORS cannot be checked from here. If photos fail in the browser " +
      "but work from a script, that is the CORS rule — see SETUP.md."
  );
}

async function checkEmail(to?: string) {
  console.log("\n4. Email");
  const backend = await emailBackend();

  if (backend === "unconfigured") {
    bad("No email configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
    return;
  }
  ok(`sending via ${backend}`);

  if (!to) {
    console.log("  note  pass an address to send a real test: npm run check:setup you@gmail.com");
    return;
  }

  try {
    await sendEmail({
      to,
      subject: "Site Diary — setup check",
      body: [
        "This is the setup check for your build updates.",
        "",
        "If you're reading it, email is working and owners will get their updates.",
        "",
        `Their page lives at ${siteUrl()}/my`,
      ].join("\n"),
    });
    ok(`test email sent to ${to} — go and check it actually arrived`);
  } catch (e) {
    bad(`could not send — ${(e as Error).message.split("\n")[0]}`);
  }
}

async function main() {
  console.log("Checking setup\n" + "=".repeat(46));
  await checkEnv();
  await checkDatabase();
  await checkStorage();
  await checkEmail(process.argv[2]);

  console.log("\n" + "=".repeat(46));
  if (problems.length) {
    console.error(`\n${problems.length} thing(s) still to fix:\n`);
    problems.forEach((p) => console.error(`  - ${p}`));
    console.error("");
    process.exit(1);
  }
  console.log("\nEverything is wired. Next: npm run db:seed:demo\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
