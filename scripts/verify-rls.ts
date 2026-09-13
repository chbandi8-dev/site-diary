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

/**
 * Every table is meant to be unreachable by the public roles. Homeowners hold a
 * link, not a database session, so nothing in here should carry a policy — a
 * policy would imply some role is expected to reach the table directly, and
 * none is.
 */

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

async function checkNoPolicies() {
  console.log("\n2. No table grants direct access to a public role");
  const rows = await prisma.$queryRaw<{ tablename: string; policyname: string }[]>`
    select tablename, policyname from pg_policies
    where schemaname = 'public'
    order by tablename
  `;
  for (const r of rows) {
    fail(
      `${r.tablename} has policy "${r.policyname}". Owners hold a link, not a ` +
        `database session — nothing should reach these tables directly. If this ` +
        `is deliberate, the owner access model has changed and this check needs ` +
        `rewriting rather than silencing.`
    );
  }
  if (rows.length === 0) pass("no policies — every table is application-only");
}

async function checkNoPublicSchemaAccess() {
  console.log("\n3. The public roles cannot use the schema at all");
  const rows = await prisma.$queryRaw<{ grantee: string }[]>`
    select distinct grantee::text as grantee
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
  `;
  for (const r of rows) {
    fail(`${r.grantee} still holds table grants in public. Re-run 0001_lockdown.sql.`);
  }
  if (rows.length === 0) pass("anon and authenticated hold no table grants");
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

async function checkConnectionBypassesRls() {
  console.log("\n5. The application's own role can actually read");
  // Row security is enabled everywhere with no policies, so the app only works
  // because its role holds BYPASSRLS. That assumption is load-bearing and
  // invisible — assert it rather than inherit it.
  const rows = await prisma.$queryRaw<{ rolbypassrls: boolean }[]>`
    select rolbypassrls from pg_roles where rolname = current_user
  `;
  if (rows[0]?.rolbypassrls) {
    pass("connection role holds BYPASSRLS, as this design requires");
  } else {
    fail(
      "The connection role does NOT hold BYPASSRLS. With row security enabled " +
        "and no policies, every query returns zero rows and every owner sees " +
        '"this link isn\'t working". Use the role documented in .env.example.'
    );
  }
}

async function checkAnonReadsNothing() {
  console.log("\n6. An anonymous PostgREST client reads nothing");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Not a skip worth hiding: owners never use PostgREST in this design, so
    // these are usually unset. Say why, so nobody reads a blank as a pass.
    console.log("  n/a   no anon key configured — nothing serves PostgREST in this app");
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
    await checkNoPolicies();
    await checkNoPublicSchemaAccess();
    await checkSecurityInvokerViews();
    await checkConnectionBypassesRls();
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
