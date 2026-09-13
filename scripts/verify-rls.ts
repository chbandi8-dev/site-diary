/**
 * Verifies the one claim this product actually makes: a homeowner can reach
 * their own house and nothing else.
 *
 * Three checks, cheapest first:
 *
 *   1. Catalogue — every table in `public` has row security enabled.
 *   2. Policies  — every RLS table either has a policy or is on the deliberate
 *                  deny list. A table with RLS on and no policy is correct only
 *                  if that was the intent.
 *   3. Anon      — a bare anon client (the key that ships in the browser
 *                  bundle) reads zero rows from every table.
 *
 * Run in CI against a migrated ephemeral database, and as a post-deploy smoke
 * test against production. Exits non-zero on any failure.
 *
 *   npm run db:verify-rls
 *
 * NOTE: check 3 must not be run from a browser profile that is also signed into
 * the admin. Use a clean environment — otherwise it passes for the wrong reason.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

/** Tables that are meant to have RLS on and no policies: unreachable by owners. */
const INTENTIONALLY_UNREACHABLE = new Set([
  "users",
  "projects",
  "services",
  "testimonials",
  "site_content",
  "messages",
  "internal_notes",
  "house_owners",
  "notification_logs",
  "evidence_events",
  "weather_days",
  "stage_estimates",
  "message_templates",
  "_prisma_migrations",
]);

const prisma = new PrismaClient();
const failures: string[] = [];

function fail(msg: string) {
  failures.push(msg);
  console.error(`  FAIL  ${msg}`);
}

function pass(msg: string) {
  console.log(`  ok    ${msg}`);
}

async function checkRowSecurityEnabled() {
  console.log("\n1. Row security enabled on every public table");
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and rowsecurity = false
    order by tablename
  `;
  if (rows.length === 0) return pass("all public tables have RLS enabled");
  for (const r of rows) {
    fail(
      `${r.tablename} has RLS DISABLED. The anon key can read it over PostgREST. ` +
        `Add it to supabase/migrations/0001_rls.sql.`
    );
  }
}

async function checkPoliciesExist() {
  console.log("\n2. Every RLS table has a policy, or is deliberately unreachable");
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    select t.tablename
    from pg_tables t
    where t.schemaname = 'public'
      and t.rowsecurity = true
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename
      )
    order by t.tablename
  `;
  const unexpected = rows.filter((r) => !INTENTIONALLY_UNREACHABLE.has(r.tablename));
  for (const r of unexpected) {
    fail(
      `${r.tablename} has RLS on but no policy, and is not on the deny list. ` +
        `Either write a policy or add it to INTENTIONALLY_UNREACHABLE with a reason.`
    );
  }
  if (unexpected.length === 0) {
    pass(`${rows.length} table(s) intentionally unreachable, all accounted for`);
  }
}

async function checkNoPermissiveAllPolicies() {
  console.log("\n3. No policy grants blanket access");
  const rows = await prisma.$queryRaw<
    { tablename: string; policyname: string; cmd: string; qual: string | null }[]
  >`
    select tablename, policyname, cmd, qual
    from pg_policies
    where schemaname = 'public'
      and cmd = 'ALL'
    order by tablename
  `;
  for (const r of rows) {
    fail(
      `${r.tablename}.${r.policyname} is FOR ALL. Write one policy per command ` +
        `so a read grant never silently becomes a write grant.`
    );
  }

  // `using (true)` is legitimate only for shared reference data.
  const allowedTrue = new Set(["stage_templates"]);
  const wide = await prisma.$queryRaw<{ tablename: string; policyname: string }[]>`
    select tablename, policyname from pg_policies
    where schemaname = 'public' and qual = 'true'
    order by tablename
  `;
  for (const r of wide) {
    if (!allowedTrue.has(r.tablename)) {
      fail(`${r.tablename}.${r.policyname} uses "using (true)" — it matches every row.`);
    }
  }
  if (rows.length === 0 && wide.every((r) => allowedTrue.has(r.tablename))) {
    pass("no FOR ALL policies, no unexpected using(true)");
  }
}

async function checkSecurityInvokerViews() {
  console.log("\n4. Views run as the caller, not as their owner");
  const rows = await prisma.$queryRaw<{ viewname: string }[]>`
    select c.relname as viewname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and coalesce(
        (select option_value from pg_options_to_table(c.reloptions)
         where option_name = 'security_invoker'), 'false') <> 'true'
    order by c.relname
  `;
  for (const r of rows) {
    fail(
      `view ${r.viewname} is not security_invoker. It executes as postgres and ` +
        `bypasses every policy. Recreate it "with (security_invoker = true)".`
    );
  }
  if (rows.length === 0) pass("no views, or all are security_invoker");
}

async function checkAnonReadsNothing() {
  console.log("\n5. The anon key — which ships in the browser — reads nothing");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log("  skip  NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY not set");
    return;
  }

  const anon = createClient(url, key, { auth: { persistSession: false } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' order by tablename
  `;

  let clean = true;
  for (const { tablename } of tables) {
    const { data, error } = await anon.from(tablename).select("*").limit(1);
    // A permission error is the correct outcome. Rows are not.
    if (!error && data && data.length > 0) {
      clean = false;
      fail(`anon read ${data.length} row(s) from ${tablename} with no login.`);
    }
  }
  if (clean) pass(`anon reads zero rows from all ${tables.length} tables`);
}

async function main() {
  console.log("Verifying row-level security\n" + "=".repeat(46));
  try {
    await checkRowSecurityEnabled();
    await checkPoliciesExist();
    await checkNoPermissiveAllPolicies();
    await checkSecurityInvokerViews();
    await checkAnonReadsNothing();
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n" + "=".repeat(46));
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed. Do not deploy.\n`);
    process.exit(1);
  }
  console.log("\nAll checks passed.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
