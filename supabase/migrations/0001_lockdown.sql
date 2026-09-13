-- ============================================================================
-- Database lockdown.
--
-- Apply after every `prisma migrate deploy`, in the same release.
--
-- WHY THIS FILE EXISTS
--
-- `prisma migrate` emits plain CREATE TABLE. A new table in Supabase's `public`
-- schema therefore arrives with row security OFF and with default grants to
-- `anon` and `authenticated`. Until this runs, every table is readable over
-- PostgREST at
--   https://<ref>.supabase.co/rest/v1/houses?select=*
-- by anyone holding the anon key. Nothing warns you.
--
-- WHAT CHANGED, AND WHY THIS IS NOW SIMPLE
--
-- Homeowners no longer authenticate. They hold a per-house link, and every page
-- they see is rendered by this application after resolving that link against a
-- live, unrevoked row. They never talk to Supabase, the anon key is never sent
-- to a browser, and there is no owner-facing PostgREST surface at all.
--
-- So there are no owner policies here, and there should never be any. The
-- entire database is reachable only by the application's own connection. That
-- is a smaller attack surface than the policy set it replaces: there is no
-- public endpoint to get a policy wrong on.
--
-- The scoping guarantee moved into `lib/db/owner.ts`, whose every function
-- takes a house id resolved from a verified link, and into the ESLint rule that
-- stops owner-facing code reaching Prisma directly.
--
-- `prisma db push` does NOT run migration SQL, so it would create the tables
-- and skip all of this. The script is removed from package.json. Do not
-- reintroduce it.
--
-- Verify with `npm run db:verify-rls`, which fails on any public table with row
-- security off, any policy at all, and any row an anonymous client can read.
-- ============================================================================

-- No grants to the public roles, on anything, ever.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
-- EXECUTE on functions defaults to PUBLIC, not to these two roles, so revoking
-- from the role names is a no-op. It matters the day someone adds a non-trigger
-- SECURITY DEFINER helper, which PostgREST would otherwise expose at /rpc/.
alter default privileges in schema public revoke all on functions from public;

-- USAGE on `public` is granted to PUBLIC, of which anon and authenticated are
-- implicit members, so revoking it from those two role names alone changes
-- nothing. Revoke it from PUBLIC or not at all — and what actually protects the
-- data here is the table-level revoke below, which is sufficient on its own.
revoke usage on schema public from public, anon, authenticated;
grant usage on schema public to postgres, service_role;

-- Belt and braces: row security on every existing table as well, so a stray
-- grant could still not return rows.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
    execute format('alter table public.%I enable row level security', t.tablename);
    -- Deliberately NOT `force`. There are no policies here by design, so FORCE
    -- would subject the application's own role to a policy set that does not
    -- exist — every read returning zero rows and every write failing, the
    -- moment anyone swaps the connection to a least-privilege role, which is
    -- exactly what a reviewer would tell you to do. Reads would fail silently:
    -- getHouse returns null and every owner is redirected to "link not working".
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at maintained in the database, since Prisma's @updatedAt is
-- client-side and a write from a trigger or the dashboard would leave it stale.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['houses','owners','updates','variations',
                           'inspections','claim_milestones','defects'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes behind the hot paths. Row counts are small, but the access-link
-- lookup runs on every single owner page view.
-- ---------------------------------------------------------------------------
create index if not exists access_links_live_idx
  on public.access_links (house_id) where revoked_at is null;
create index if not exists house_owners_active_idx
  on public.house_owners (house_id, owner_id) where revoked_at is null;
create index if not exists updates_visible_idx
  on public.updates (house_id, occurred_at desc)
  where published_at is not null and deleted_at is null;
create index if not exists photos_update_ready_idx
  on public.photos (update_id) where status = 'ready' and deleted_at is null;
