# Setting up Site Diary

Roughly two hours of wiring, most of it waiting on DNS.

Order matters in two places: **start the DNS verification first** because it is
the only step measured in days, and **apply the RLS migrations in the same
release as the Prisma migration**, because Prisma creates tables with row
security off.

---

## 1. Rotate the leaked secrets — do this first

Two secrets are in this repository's git history and cannot be un-published:

- `NEXTAUTH_SECRET` was committed in `vercel.json`. Anyone with it can mint a
  valid admin session without knowing the password.
- `prisma/dev.db` was committed and contained the admin user's bcrypt hash.

Both have been removed from the working tree, which does not help. Rotate:

```bash
openssl rand -base64 32        # set as NEXTAUTH_SECRET in Vercel env vars
```

Then change the admin password through the admin UI.

## 2. Email sending (start now — DNS takes days)

1. Create a [Resend](https://resend.com) account, add the builder's domain.
2. Add the SPF, DKIM and DMARC records Resend gives you. **If the marketing
   agency controls DNS, request this today.** Until the domain verifies,
   "your house changed" emails land in spam and the product fails silently.
3. Set `RESEND_API_KEY` and `EMAIL_FROM`.

Also point **Supabase Auth** at Resend as custom SMTP (Authentication →
Settings → SMTP). Supabase's built-in auth mail is rate-limited to a handful
per hour and is explicitly not for production — sign-in codes would fail
intermittently with no error the owner can act on.

## 3. Supabase

1. Create a project. Region: Sydney.
2. From Settings → Database, take **both** connection strings:
   - `DATABASE_URL` — pooler, port **6543**, with
     `?pgbouncer=true&connection_limit=1`. Serverless functions plus direct
     connections exhaust the pool, and Prisma's prepared statements break on
     the pooler without that flag.
   - `DIRECT_URL` — port **5432**. Used by `prisma migrate` only.
3. From Settings → API, take `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

The anon key is public by design — it ships in the browser bundle. Row-level
security is what protects the data, which is why step 5 is not optional.

## 4. Photo storage

1. Create a Cloudflare R2 bucket named `site-diary`. **Keep it private** —
   no public access, no r2.dev URL. Photos are served through short-lived
   signed URLs; an unguessable URL is not an access control, and these are
   other people's homes.
2. Create an R2 API token with object read/write on that bucket.
3. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

## 5. Schema and policies — one release, in this order

```bash
npm run db:deploy                              # Prisma: creates the tables
psql "$DIRECT_URL" -f supabase/migrations/0001_rls.sql
psql "$DIRECT_URL" -f supabase/migrations/0002_notify.sql
npm run db:verify-rls                          # must pass before you deploy
```

**Never run `prisma db push`.** It skips migration SQL, so it would create the
tables and silently skip every policy. The script has been removed from
`package.json`; do not reintroduce it.

`db:verify-rls` fails on any public table with row security off, any policy
granting blanket access, any view that is not `security_invoker`, and any row an
anonymous client can read. Run it in CI and after every deploy. It is the only
check that tests what this product actually promises.

Then seed:

```bash
npm run db:seed    # admin user, site content, 31 stages, 19 message templates
```

## 6. Scheduled jobs

Two endpoints, both authorised by `CRON_SECRET` (generate with `openssl rand -hex 32`):

| Endpoint | When | What |
|---|---|---|
| `POST /api/cron/notifications` | every 15 min | drains the send queue |
| `POST /api/cron/digest` | Fridays ~16:00 Sydney | the weekly digest |

Schedule them in Supabase `pg_cron` + `pg_net` rather than Vercel Cron, so a
hosting change doesn't silently break the automation. Call with
`Authorization: Bearer $CRON_SECRET`.

Also run `scripts/sweep-orphan-photos.ts` nightly.

## 7. Backups — Phase 0, not later

Until now the whole database was in git, which was terrible security and
excellent disaster recovery. After the migration you lose the second half, and
the Supabase free tier gives you no self-service point-in-time recovery.

Set up a nightly `pg_dump` plus a photo sync to the builder's own Drive before
real data goes in. This doubles as a keep-alive: Supabase pauses free projects
after seven days idle, which would otherwise happen over the Christmas
shutdown — precisely when anxious owners check their page.

## 8. Adding a house

There is no UI for this yet. Per house:

1. Create the `houses` row.
2. Create each `owners` row with their real email. Leave `auth_user_id` null —
   it links itself when they first sign in.
3. Link them in `house_owners`.
4. Copy the stage templates into `house_stages`, marking anything that doesn't
   apply as `not_applicable`.
5. Invite the owner in Supabase Auth (Authentication → Users → Invite) using
   the same email.

Sign-in uses `shouldCreateUser: false`, so only people already set up as owners
can get a code. A stranger entering an address sees the same screen and receives
nothing.

## Before the pilot: check these on his actual phone

Both reviewers flagged these as untestable from a desk:

- **Portrait photos are not sideways.** Canvas re-encoding drops the EXIF
  orientation tag, and the library is supposed to apply it first.
- **His camera format.** Settings → Camera → Formats. "High Efficiency" gives
  HEIC, which Safari decodes and Chrome/Android do not. "Most Compatible"
  avoids the whole class of problem.
- **Owner isolation, in a private window.** When he is logged into `/admin` in
  the same browser his staff cookie is sent to `/my` too, so testing there
  makes isolation look correct for the wrong reason.
