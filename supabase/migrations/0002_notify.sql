-- ============================================================================
-- Notification triggers.
--
-- In the database rather than a route handler so they fire however the row was
-- created — the owner portal, an admin action, a backfill. A notification that
-- depends on someone remembering to call it eventually doesn't happen, and the
-- failure is silent.
--
-- These only ENQUEUE. /api/cron/notifications sends, so a provider outage can
-- never stop an owner filing a report.
-- ============================================================================

create or replace function public.notify_staff_of_owner_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_address text;
  v_staff record;
  v_subject text;
begin
  select address into v_address from public.houses where id = new.house_id;

  v_subject := case new.kind
    when 'maintenance' then v_address || ' — owner reported something to fix'
    when 'issue'       then v_address || ' — owner raised an issue'
    else                    v_address || ' — owner asked a question'
  end;

  for v_staff in select id, email from public.users where role in ('admin', 'pm') loop
    insert into public.notification_logs
      (id, audience, house_id, user_id, report_id, channel, status, dedupe_key, subject)
    values
      (gen_random_uuid(), 'staff', new.house_id, v_staff.id, new.id, 'email', 'queued',
       'report:' || new.id || ':' || v_staff.email, v_subject)
    on conflict (dedupe_key) do nothing;
  end loop;

  return new;
end $$;

drop trigger if exists owner_report_notifies_staff on public.owner_reports;
create trigger owner_report_notifies_staff
  after insert on public.owner_reports
  for each row execute function public.notify_staff_of_owner_report();

-- ---------------------------------------------------------------------------
-- The reply back. Fires when a reply is first written, not on later edits, and
-- only where that person actually gave us an email — plenty of viewers never
-- register, and they simply check the page instead.
-- ---------------------------------------------------------------------------
create or replace function public.notify_owner_of_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_address text;
  v_email text;
  v_notify boolean;
begin
  if new.reply_body is null or old.reply_body is not null then
    return new;
  end if;

  select address into v_address from public.houses where id = new.house_id;
  select email, notify_by_email into v_email, v_notify
    from public.owners where id = new.owner_id;

  if v_email is null or not coalesce(v_notify, true) then
    return new;
  end if;

  insert into public.notification_logs
    (id, audience, house_id, owner_id, report_id, channel, status, dedupe_key, subject)
  values
    (gen_random_uuid(), 'owner', new.house_id, new.owner_id, new.id, 'email', 'queued',
     'reply:' || new.id || ':' || v_email,
     v_address || ' — reply to what you raised')
  on conflict (dedupe_key) do nothing;

  return new;
end $$;

drop trigger if exists owner_report_reply_notifies_owner on public.owner_reports;
create trigger owner_report_reply_notifies_owner
  after update on public.owner_reports
  for each row execute function public.notify_owner_of_reply();
