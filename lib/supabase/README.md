# Supabase clients

Two different things live in this app and they authenticate differently.

| Side | Who | Auth | Data access |
|---|---|---|---|
| `/admin/*`, PM capture | One trusted staff user | NextAuth credentials (`lib/auth.ts`) | Prisma, as the table owner — **RLS is bypassed** |
| `/my/*` owner portal | ~25 homeowners | Supabase magic link | `supabase-js` with the anon key + owner JWT — **RLS enforced** |

## The rule

**No owner-facing request may ever be served through Prisma.**

Prisma connects as the database owner, which holds `BYPASSRLS`. Every policy in
`supabase/migrations/0001_rls.sql` is silently ignored on that connection. That
is correct and intended for the admin side, and catastrophic on the owner side —
one `prisma.house.findMany()` in an owner route serves every client's build to
whoever asked.

So the boundary is drawn by directory, not by discipline:

- `app/(owner)/**` and `app/api/owner/**` may import `lib/supabase/server`.
- Nothing under those paths may import `lib/prisma`.

`SUPABASE_SERVICE_ROLE_KEY` also bypasses RLS. It is for scheduled jobs
(digest, nudge) only, and must never be read in a route a homeowner can reach.
