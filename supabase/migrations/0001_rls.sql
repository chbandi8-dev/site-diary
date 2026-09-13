-- ============================================================================
-- Site Diary — row-level security.
--
-- Prisma owns the table DDL; this file owns who can read what. It must be
-- applied after every `prisma migrate deploy`, in the same release.
--
-- WHY THIS FILE IS LOAD-BEARING
--
-- `prisma migrate` emits plain CREATE TABLE. A new table in Supabase's `public`
-- schema therefore arrives with row security OFF and with default grants to
-- `anon` and `authenticated`. The anon key is in the owner portal's client
-- bundle by design. So until this file runs, every table is readable by anyone
-- who views source, at
--   https://<ref>.supabase.co/rest/v1/houses?select=*
-- with no login. App-level `where` clauses do not appear in that path. Nothing
-- warns you, and the portal looks correctly scoped the whole time.
--
-- `prisma db push` does NOT run migration SQL, so it would create the tables
-- and skip every policy below. That script has been removed from package.json.
-- Do not reintroduce it.
--
-- Verify with `npm run db:verify-rls`, which fails on any public table with RLS
-- off or no policy, and asserts an anon client reads zero rows.
--
-- ROLES
--   anon           unauthenticated. Denied everything, explicitly.
--   authenticated  homeowners signed in by email OTP. Governed by these policies.
--   service_role   admin/PM side and cron. Bypasses RLS by design.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Start from deny.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    -- Legacy CMS tables. These are served exclusively through Prisma
    -- server-side, so `anon` needs no access to them at all — and `users`
    -- holds bcrypt password hashes, which PostgREST would happily return.
    'users','projects','services','testimonials','site_content','messages',
    -- Owner update system.
    'houses','owners','house_owners','stage_templates','house_stages',
    'stage_estimates','updates','internal_notes','photos','decisions',
    'variations','documents','questions','notification_logs','inspections',
    'claim_milestones','handover_forecasts','defects','weather_days',
    'evidence_events'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    -- FORCE also subjects the table owner, so a stray superuser-ish connection
    -- does not quietly sidestep the policies during a migration.
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Identity helpers.
--
-- SECURITY DEFINER so the lookup is not subject to the policies it feeds
-- (which would recurse), STABLE so Postgres evaluates it once per statement
-- rather than once per row, and `search_path` pinned so it cannot be hijacked
-- by a same-named object in another schema.
--
-- Access ends at house_owners.revoked_at, not at session expiry. A house sold
-- mid-build, or a separating couple, must lose access immediately.
-- ---------------------------------------------------------------------------
create or replace function public.current_owner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.owners where auth_user_id = auth.uid()
$$;

create or replace function public.owner_house_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ho.house_id
  from public.house_owners ho
  where ho.owner_id = public.current_owner_id()
    and ho.revoked_at is null
$$;

revoke all on function public.current_owner_id() from public, anon;
revoke all on function public.owner_house_ids() from public, anon;
grant execute on function public.current_owner_id() to authenticated;
grant execute on function public.owner_house_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tables a homeowner can never reach.
--
-- RLS is on and NOT ONE POLICY IS DEFINED, so no row matches for anyone. The
-- grants are also revoked above, which is the point: grant-level denial
-- survives a policy mistake, and policy mistakes happen during migration churn.
-- This is why internal notes are a separate table rather than a flag on
-- `updates` — a mis-set column can leak, a table with no grant cannot.
--
--   internal_notes    the PM's private working record
--   house_owners      the membership graph itself
--   notification_logs delivery metadata
--   evidence_events   the audit trail
--   weather_days      contractual EOT evidence
--   stage_estimates   supersededforecasts, shown only via curated updates
--
-- Do not add policies here. Left explicit so the omission reads as a decision.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. Reads, scoped to the owner's own houses.
-- ---------------------------------------------------------------------------
grant select on
  public.houses, public.house_stages, public.stage_templates, public.updates,
  public.photos, public.decisions, public.variations, public.documents,
  public.questions, public.inspections, public.claim_milestones,
  public.handover_forecasts, public.defects
to authenticated;

create policy owner_reads_own_house on public.houses
  for select to authenticated
  using (id in (select public.owner_house_ids()));

create policy owner_reads_own_stages on public.house_stages
  for select to authenticated
  using (house_id in (select public.owner_house_ids()));

-- Shared reference data, nothing client-specific.
create policy owner_reads_stage_templates on public.stage_templates
  for select to authenticated
  using (true);

-- A draft is not an update, and a deleted update the owner was already texted
-- about must stop rendering without the row disappearing.
create policy owner_reads_published_updates on public.updates
  for select to authenticated
  using (
    house_id in (select public.owner_house_ids())
    and published_at is not null
    and deleted_at is null
  );

-- A photo is visible if and only if it hangs off a published update.
--
-- Deliberately NOT `house_id in (...)`. Most of his photos are evidence, not
-- owner content: a defect for a subbie to fix, a question for the engineer,
-- proof for a progress claim, site rubbish, the neighbour's fence. Scoping
-- photos by house alone would publish all of it. Promotion has to be an act.
create policy owner_reads_published_photos on public.photos
  for select to authenticated
  using (
    status = 'ready'
    and deleted_at is null
    and exists (
      select 1 from public.updates u
      where u.id = photos.update_id
        and u.house_id in (select public.owner_house_ids())
        and u.published_at is not null
        and u.deleted_at is null
    )
  );

create policy owner_reads_own_decisions on public.decisions
  for select to authenticated
  using (house_id in (select public.owner_house_ids()));

-- A draft variation is not yet an offer.
create policy owner_reads_sent_variations on public.variations
  for select to authenticated
  using (
    house_id in (select public.owner_house_ids())
    and status <> 'draft'
  );

create policy owner_reads_own_documents on public.documents
  for select to authenticated
  using (house_id in (select public.owner_house_ids()));

create policy owner_reads_own_questions on public.questions
  for select to authenticated
  using (house_id in (select public.owner_house_ids()));

create policy owner_reads_own_inspections on public.inspections
  for select to authenticated
  using (house_id in (select public.owner_house_ids()));

create policy owner_reads_own_claims on public.claim_milestones
  for select to authenticated
  using (house_id in (select public.owner_house_ids()));

create policy owner_reads_own_forecasts on public.handover_forecasts
  for select to authenticated
  using (house_id in (select public.owner_house_ids()));

create policy owner_reads_own_defects on public.defects
  for select to authenticated
  using (house_id in (select public.owner_house_ids()));

grant select on public.owners to authenticated;
create policy owner_reads_self on public.owners
  for select to authenticated
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Owner writes go through functions, never through table grants.
--
-- RLS can restrict which ROWS an UPDATE touches. It cannot restrict which
-- COLUMNS. `with check` only validates the resulting row, so an owner granted
-- UPDATE on `variations` to tap Approve could send
--   { status: 'approved', amount_cents: 0 }
-- and the policy would pass. Column grants would patch that specific hole, but
-- approval is evidence: it needs a server timestamp, the IP and user agent, and
-- an append-only record. So homeowners hold no write grant on any table, and
-- these three functions are the entire owner-side write surface.
-- ---------------------------------------------------------------------------

create or replace function public.answer_decision(
  p_decision_id uuid, p_answer text, p_ip text default null, p_user_agent text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := public.current_owner_id();
begin
  if v_owner is null then raise exception 'Not signed in'; end if;

  update public.decisions
     set answer = p_answer, answered_at = now(), status = 'answered'
   where id = p_decision_id
     and status = 'open'
     and house_id in (select public.owner_house_ids());

  if not found then
    -- Same message whether the decision is another client's, already answered,
    -- or absent. Distinguishing them confirms the row exists.
    raise exception 'That decision is not open for you to answer';
  end if;

  insert into public.evidence_events
    (id, subject, subject_id, event, actor_type, actor_id, ip, user_agent, payload)
  values
    (gen_random_uuid(), 'decision', p_decision_id, 'answered', 'owner', v_owner::text,
     p_ip, p_user_agent, jsonb_build_object('answer', p_answer));
end $$;

create or replace function public.decide_variation(
  p_variation_id uuid, p_approve boolean, p_ip text default null, p_user_agent text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := public.current_owner_id();
begin
  if v_owner is null then raise exception 'Not signed in'; end if;

  -- Only rows still at 'sent' match, so a decision cannot be walked back or
  -- re-signed once given. That one-way door is the evidentiary value.
  update public.variations
     set status = case when p_approve then 'approved' else 'declined' end,
         approved_at = now(),
         approved_by_id = v_owner
   where id = p_variation_id
     and status = 'sent'
     and house_id in (select public.owner_house_ids());

  if not found then
    raise exception 'That variation is not awaiting your decision';
  end if;

  insert into public.evidence_events
    (id, subject, subject_id, event, actor_type, actor_id, ip, user_agent)
  values
    (gen_random_uuid(), 'variation', p_variation_id,
     case when p_approve then 'approved' else 'declined' end,
     'owner', v_owner::text, p_ip, p_user_agent);
end $$;

create or replace function public.ask_question(
  p_house_id uuid, p_body text, p_photo_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid := public.current_owner_id(); v_id uuid := gen_random_uuid();
begin
  if v_owner is null then raise exception 'Not signed in'; end if;
  if p_house_id not in (select public.owner_house_ids()) then
    raise exception 'Not your house';
  end if;
  if length(coalesce(p_body, '')) = 0 then raise exception 'Question is empty'; end if;

  insert into public.questions (id, house_id, owner_id, body, created_at)
  values (v_id, p_house_id, v_owner, left(p_body, 4000), now());
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'answer_decision(uuid,text,text,text)',
    'decide_variation(uuid,boolean,text,text)',
    'ask_question(uuid,text,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. updated_at in the database. Prisma's @updatedAt is client-side, so a write
--    through an RPC or the dashboard would otherwise leave it stale.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['houses','owners','updates','variations',
                           'inspections','claim_milestones','defects'] loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Indexes behind the policy predicates. Row counts are tiny, but the
--    house_owners lookup runs inside every policy on every row, so it must
--    not be a sequential scan.
-- ---------------------------------------------------------------------------
create index if not exists house_owners_active_idx
  on public.house_owners (owner_id, house_id) where revoked_at is null;
create index if not exists owners_auth_user_idx
  on public.owners (auth_user_id) where auth_user_id is not null;
create index if not exists updates_visible_idx
  on public.updates (house_id, occurred_at desc)
  where published_at is not null and deleted_at is null;
create index if not exists photos_update_ready_idx
  on public.photos (update_id) where status = 'ready' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- 7. IF YOU ADD A VIEW, it must be declared
--       create view ... with (security_invoker = true)
--    A view otherwise executes as its owner (postgres) and reinstates the
--    exposure this whole file exists to close, behind a convenient name.
-- ---------------------------------------------------------------------------
