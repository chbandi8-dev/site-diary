# Site Diary — Owner Update System

Product plan for keeping 20–25 homeowners informed across a residential build
portfolio, without 20–25 daily WhatsApp threads.

Status: proposal. Nothing here is built yet.

---

## 1. The reframe

The stated problem is "I can't update every owner every day on WhatsApp."

Do not build that. A system that promises daily messages fails the first busy
week, and once owners are trained to expect a daily ping, a missed day becomes a
complaint. You would be manufacturing a new obligation.

On a real residential build most days produce nothing visible. The owner's
actual questions are only ever four:

1. Is my house on track?
2. What happens next, and roughly when?
3. Has anything changed?
4. Does anyone need something from me?

So the product is **a always-current status page per house**, plus **push when
something actually changes**, plus **a guaranteed weekly digest that goes out
whether or not anyone logged anything**. Silence stops being ambiguous.

The promise to owners becomes: *live page, always accurate; a note whenever
something moves; a summary every Friday.* That is a promise that survives a bad
week. "Daily" is not.

### The second reframe

He should never again write a message addressed to a person. He logs what
happened at a house. The system does the addressing, the tone, the sending, the
chasing and the record-keeping.

---

## 2. Shape of the system

Three surfaces, one database.

| Surface | Who | What it is |
|---|---|---|
| **Site Log** | PM, on site | Installable phone web app. Opens to today's houses. The only thing he touches. |
| **Owner Portal** | Each homeowner | One live page per house. Magic link, no password, no app install. |
| **Notification layer** | Automatic | SMS + email on change; weekly digest on a schedule. Pluggable so WhatsApp can be added later. |

The owner portal lives on the same domain as the existing marketing site, in the
same design language. Completed houses graduate into the public project
portfolio, and handover is the natural moment to collect the testimonials the
marketing site already has a model for. The two halves feed each other.

### The stack

| Piece | Service | Free allowance | Actual need at 25 houses |
|---|---|---|---|
| Database, auth | Supabase | 500 MB, 50k MAU | A few MB/year — text only |
| Photos | Cloudflare R2 | 10 GB/mo, **zero egress** | ~750 MB/mo compressed |
| Email | Resend (or Brevo) | 3,000/mo (300/day) | ~200–600/mo |
| Voice to text | Web Speech API | Free, in-browser, no key | — |
| Scheduled digest | Supabase `pg_cron` / Vercel Cron | Free | 1 weekly, 1 daily |
| Weather | Open-Meteo / BOM | Free, no key | Daily pull |
| Hosting | Vercel Pro, or Cloudflare Workers | $20/mo, or free | — |

Infrastructure cost is **$0/month** for well over a year — see *Cost*.

Supabase carries the database and owner auth for two specific reasons, not
because it bundles the most features: **Row Level Security**, which is the only
honest way to meet the per-house isolation requirement, and **native
magic-link auth**, which is exactly the owner access model. Photos go to R2 and
*not* to Supabase Storage — the free tier there is 1 GB against R2's 10 GB, and
R2 charges nothing for egress, which is precisely the cost shape of a photo
gallery owners revisit.

---

## 3. Capture — his side

This is the make-or-break. If capture takes longer than a minute, it will not
happen, and the system will publish silence very beautifully.

**Target: under 60 seconds per house, one-handed, on site, with gloves off.**

1. **Photo-first.** Open app → tap house → camera. The photos *are* the update.
   Auto-timestamped, auto-filed against the current stage.
2. **Voice note → draft.** Talk for 20 seconds walking back to the ute.
   Transcribe, then rewrite into plain owner-facing English. He reads it, edits
   if needed, sends. This is the single biggest unlock: he talks far faster than
   he types, and often has hands free but not a keyboard.
3. **Two-tap status.** Every house, every visit, gets one of: *On track /
   Waiting on X / Delayed*. Nothing else is mandatory. "Nothing on site today,
   frame delivery Tuesday" is a complete and reassuring update.
4. **Stage board.** Move a house from Frame to Lockup with one tap. That single
   action fires the milestone message, updates the progress ring on the owner's
   page, and timestamps the date for the progress claim.
5. **Bulk actions.** "Slab poured" applied to three houses at once. On a wet day,
   one tap tags every outdoor-stage house with a weather delay and twelve owners
   are informed truthfully in ten seconds. This feature alone pays for the build.
6. **Internal vs owner-visible.** A toggle on every entry. He needs somewhere to
   write "brickie is hopeless, chasing him Thursday" that no owner ever sees.
   Without this he will hesitate before logging anything, and hesitation kills
   the habit.
7. **Offline-first.** Slabs, basements, bad reception. Queue locally, sync later.
   Never lose a photo or a note.
8. **End-of-day nudge.** 4:30pm push: "4 houses have no update today" with a
   one-tap path into each.

---

## 4. Owner portal — their side

- **Live house page.** Hero photo, current stage in words ("Stage 6 of 14 —
  Lockup"), progress ring, next milestone with an *estimated* date, and a
  reverse-chronological timeline of updates with photos.
- **Photo gallery by stage.** The emotional payload. This is what owners
  screenshot and send to their family, which is also the referral engine.
- **What's next.** The next three milestones. Every forecast date labelled as an
  estimate, deliberately and visibly.
- **Decisions we need from you.** Tile selection, tapware, paint, PC item
  choices — each with a deadline and an honest "not deciding by the 14th will
  push your fixing stage" warning. Owners routinely cause delays and then
  attribute them to the builder. A timestamped record of *asked on the 3rd,
  answered on the 21st* is worth real money in a dispute.
- **Variations.** Description, price, and an approve button. Timestamped
  consent, contract-grade. This is where small builders lose margin.
- **Progress claims.** Which payment stage is due, paid, or coming. Read-only
  status is enough at first; no payment processing.
- **Documents.** Contract, permits, engineering, certificates, warranties,
  as-builts. One place, forever.
- **Ask a question.** A per-house thread, so questions stop landing in a personal
  WhatsApp at 9pm on Sunday. He answers in the app and it is logged against the
  house.

---

## 5. Automation — what makes it survive contact with reality

- **Friday digest, unconditional.** Composed from whatever is in the system,
  sent whether or not he logged a thing. Solves most of "he never tells us
  anything" on its own.
- **Milestone messages.** Stage change automatically composes a message with the
  best photo from that stage.
- **Silence detector.** Any house with no update in five days flags on his
  dashboard. A house going quiet is the leading indicator of an angry client.
- **Weather context.** Pull BOM observations; annotate affected houses with wet
  days automatically. Owners accept weather. They do not accept silence.
- **Draft, never auto-send.** AI writes, he approves with one tap. Never let
  generated prose reach a client unreviewed — one hallucinated date in writing is
  a contractual problem.

---

## 6. What we are deliberately not building

- Gantt charts and critical-path scheduling. He will not maintain them; wrong
  tool, wrong user.
- Accounting, payroll, procurement, timesheets. That is Xero's job.
- Native iOS/Android apps. A PWA is enough for him, and owners must never be
  asked to install anything.
- Owner accounts with passwords. Homeowners will not sign up. Magic links only.
- A chat product. Do not rebuild WhatsApp. Structured updates plus a Q&A thread
  is the correct scope.

---

## 7. Channel decision

**Recommendation: SMS + email from day one. WhatsApp only if owners ask for it.**

WhatsApp Business API requires Meta business verification, a solution provider
(Twilio, 360dialog), pre-approved message templates for anything outside a
24-hour window, and per-conversation billing. That is weeks of setup and ongoing
template approval for marginal gain, because in every case the message is just a
short line plus a link to the portal.

SMS reaches every homeowner regardless of app, costs cents, and is read.
Email carries the weekly digest and the photos.

Build the notification layer as a channel adapter so WhatsApp is later a config
change, not a rewrite.

---

## 8. Build phases

### Phase 0 — Foundation (prerequisite, ~2 days)

Four things in the current repo block everything else:

- **Data does not persist.** `lib/prisma.ts` points Prisma at a SQLite file
  bundled into the serverless function via `outputFileTracingIncludes` in
  `next.config.mjs`. On Vercel that filesystem is read-only and ephemeral —
  writes are lost on redeploy and are not shared between function instances.
- **Photos do not persist.** `app/api/upload/route.ts` writes to
  `public/uploads` on local disk. Same failure, and site photos are the
  irreplaceable asset here.
- **A secret is committed.** `vercel.json` carries a shared `NEXTAUTH_SECRET`
  in version control.
- **The hosting plan may not be licensed for this.** Vercel's terms restrict the
  Hobby plan to personal, non-commercial use, defining commercial as any
  deployment used for the financial gain of anyone involved in producing it, and
  reserve the right to disable deployments with or without notice. A builder's
  marketing site and client portal is commercial. If the site is on Hobby today
  it is already exposed — independent of this project.

Work:

1. Supabase project; move the schema to Postgres; migrate the existing CMS rows.
2. R2 bucket; replace the upload route with presigned direct-to-R2 uploads;
   compress client-side before upload.
3. Secrets into environment variables; rotate the committed one.
4. Settle hosting: Vercel Pro at $20/mo for no migration work, or Cloudflare
   Workers for $0 plus roughly 2–3 days of adapter work.

Non-negotiable. Everything downstream assumes durable storage.

*Passes when a photo uploaded before a deploy is still there after it.*

### Phase 1 — Stop the bleeding (weeks 1–2)

House, Owner, Stage, Update models. Stage template. PM capture: photos + text +
stage change, owner-visible/internal toggle. Owner magic-link portal with
timeline and gallery. Friday digest by email.

*Pilot on three friendly owners. Ship nothing further until they say it changed
how they feel about the build.*

### Phase 2 — Make it fast (weeks 3–4)

Voice-to-text capture. Offline queue. Bulk and weather updates. End-of-day
nudge. SMS notifications. Silence detector.

*Roll out to all houses. Judge it on whether he still opens WhatsApp for
progress questions.*

### Phase 3 — Make it valuable (weeks 5–7)

Decisions register. Documents. Progress claims. Variation approvals. Q&A thread.

*Judge it on the first dispute it settles, and the first owner-caused delay it
proves.*

### Phase 4 — Later

WhatsApp channel. Subcontractor check-in. Handover pack generation. NPS at
handover feeding the marketing site's testimonials. Second PM / office roles.

---

## 9. Data model sketch

```
House          address, storeys, owners[], contractValue, startDate,
               targetHandover, currentStage, status
Owner          name, email, phone, accessToken, notifyPrefs
StageTemplate  name, order, isPaymentMilestone
HouseStage     houseId, templateId, startedAt, completedAt, estimatedDate
Update         houseId, body, type(progress|delay|milestone|weather),
               visibility(owner|internal), photos[], authorId, createdAt
Photo          houseId, url, caption, stage, takenAt
Decision       houseId, question, options, dueDate, askedAt, answeredAt, answer
Variation      houseId, description, amount, status, approvedAt, approvedBy
Document       houseId, type, url, uploadedAt
ClaimStage     houseId, stage, amount, claimedAt, paidAt
Question       houseId, fromOwner, body, answeredBy, answeredAt
Notification   channel, recipient, updateId, status, sentAt
```

Two non-obvious constraints:

- **`visibility` must be enforced by the database, not the interface.** An owner
  must be structurally incapable of loading another house or an internal note,
  not merely un-shown one. This is what Supabase Row Level Security is for, and
  it is the main reason to use Supabase at all.
- **Every date shown to an owner needs an `isEstimate` flag** and must render
  differently when true. Forecasts published as facts are how a helpful system
  becomes a liability.

### The trap that would silently undo the first one

**Prisma bypasses RLS by default.** A raw `DATABASE_URL` connection logs in as
the `postgres` role, which owns the tables and holds `BYPASSRLS` — so every
policy is ignored and nothing warns you. The same is true of the Supabase
service-role key. Since this repo is already Prisma-based, this would bite
immediately and invisibly.

Split along the risk boundary rather than fighting it:

- **Owner portal** → `@supabase/ssr` with the anon key and the owner's JWT. RLS
  enforced in Postgres. This is the side where a leak is unrecoverable.
- **Admin / PM side** → leave the existing NextAuth + Prisma alone. One trusted
  user, already built, no reason to touch it.

If Prisma must own both sides, the alternative is a dedicated restricted
Postgres role plus a Prisma client extension that sets session context per query.
It works, but it is a permanent footgun versus a boundary drawn once.

---

## 10. Risks

1. **Adoption is the only risk that matters.** Mitigations: 60-second capture,
   the end-of-day nudge, and making the system save him time on day one by
   killing the "any update?" calls.
2. **Expectation ratchet.** Promise weekly + on-change, never daily. Set this in
   the welcome message to owners.
3. **Everything published is evidence.** Mostly protective, but he must never
   publish a date he cannot hit. Label estimates as estimates, everywhere.
4. **Privacy.** Strict per-house scoping. Expiring magic links. No margins, no
   subcontractor rates, no other clients anywhere near the portal. Get consent
   before any site photo with an identifiable worker's face is reused in
   marketing.
5. **Photo volume.** 25 houses × several photos a day is real storage and real
   mobile data. Compress client-side before upload.

---

## 11. Cost

Infrastructure runs at **$0/month** and stays there for well over a year.

| Line | Free allowance | Consumption at 25 houses | Headroom |
|---|---|---|---|
| Supabase Postgres | 500 MB | a few MB/year | years |
| Supabase auth | 50,000 MAU | ~25 | irrelevant |
| Cloudflare R2 | 10 GB/mo, $0 egress | ~750 MB/mo | ~13 months |
| Resend email | 3,000/mo | ~200–600/mo | 5× |
| Web Speech API | unmetered | — | — |

The R2 line is the only one that ever moves. At 1600px WebP (~200 KB a photo),
25 houses × 5 photos a day is roughly 750 MB a month, so the 10 GB free tier
lasts about thirteen months — and the eleventh gigabyte then costs 1.5 cents.
Zero egress is the part that matters: owners re-scrolling their galleries is the
dominant traffic pattern here and it bills nothing.

Note that Supabase pauses free projects after seven days of inactivity. That
never triggers for this app — it is used every working day. The reason photos go
to R2 instead of Supabase Storage is the 1 GB storage ceiling and 5 GB bandwidth
cap, not the pause.

### What $0 actually costs you

**No SMS.** There is no free SMS at any volume, anywhere. Email-only means
relying on a channel that gets filtered and batch-read, for messages whose whole
job is *something changed at your house*. Web push is free but iOS requires the
owner to add the page to their home screen first — exactly the install friction
this plan otherwise avoids. Roughly **$12/month buys SMS back**, and it is the
highest-value dollar in the system. Budget it as the first thing added, not as
something ruled out.

**Weaker voice capture.** Web Speech API is free and decent indoors, and poor
against wind, compressors and trade jargon. Whisper at $0.006/min is about
**$1.50/month** at this volume; a small model cleaning up transcripts is pennies.
Call it $3/month for voice that works on site — "nearly free" is materially
better than "free" on this line.

**No SLA, no support, nobody who owes you a restore.** This is the trade-off
worth actually thinking about, because Phase 3 puts variation approvals and
contract documents in here — evidence in a dispute. Free tiers change terms and
no one is obliged to help you. Mitigation is cheap and also free: a nightly
automated database export plus a photo sync to his own Google Drive. That turns
"we lost the record" into "restoring takes an afternoon." **Do this from Phase 1,
not later.**

### Three honest price points

| Option | Cost | Trade |
|---|---|---|
| Cloudflare Workers + all free tiers | **$0/mo** | Email only; 2–3 extra days of migration |
| Same, plus SMS and Whisper | **~$15/mo** | Email only → proper notifications |
| Vercel Pro + all free tiers + SMS | **~$35/mo** | No migration work at all |

His time is the scarcest resource in this entire picture. If moving off Vercel
delays the pilot by three days, the $20/month is the better trade — take the
$35/mo row and revisit later.

### Build vs buy

Buildertrend and CoConstruct do all of this and much more, from roughly
$600/month AUD, and would be running next week.

The honest case for buying: if what is wanted is relief *this month* rather than
an asset, buy it and don't feel clever about it.

The honest case for building: those products are designed around the builder's
back office, and their client portals are an afterthought owners largely don't
open. This one is owner-experience-first and everything else is subordinate to
that. It also shares a domain, a design language and a database with a marketing
site that already exists here, and it does not charge more as the portfolio
grows.

---

## 12. What to build on

**Do not scaffold from a starter template.** This repo already has Next.js 14,
Tailwind, Radix, a custom design system and a working admin with auth. Starting
over from a boilerplate would throw all of that away. These are reference
implementations to read and adapt, not foundations to build on.

| Need | Source | Why this one |
|---|---|---|
| Supabase auth on App Router | [Vercel's `with-supabase` template](https://vercel.com/templates/next.js/supabase) | Cookie-based SSR auth via `@supabase/ssr`, which is the part that is fiddly to get right |
| Magic-link / email OTP | [Supabase Auth docs](https://supabase.com/docs/guides/auth) | Native passwordless — this is the owner access model, don't hand-roll tokens |
| RLS policy patterns | [Razikus/supabase-nextjs-template](https://github.com/Razikus/supabase-nextjs-template) | Apache-2.0, actively maintained, ships real RLS *and* storage policies to crib from |
| RLS with Prisma, if needed | [prisma-extension-supabase-rls](https://github.com/dthyresson/prisma-extension-supabase-rls) | The session-context pattern, if the boundary in §9 isn't taken |
| Presigned R2 uploads | [harshil1712/nextjs-r2-demo](https://github.com/harshil1712/nextjs-r2-demo) | From a Cloudflare advocate; covers Workers API, presigned URL and temporary credentials. **No license file — read the pattern, write your own code** |
| Offline queue + PWA | [`@serwist/next`](https://serwist.pages.dev/) | The maintained successor to the abandoned `next-pwa`, and what the Next.js PWA docs now recommend. Gives background sync for the offline photo queue |
| Client-side compression | [`browser-image-compression`](https://www.npmjs.com/package/browser-image-compression) | Web-worker, non-blocking; this is what keeps R2 inside the free tier and his data plan intact |
| Friday digest emails | [React Email](https://react.email/) + [Resend](https://resend.com/docs/send-with-nextjs) | Templates as React components, previewable locally |
| Voice capture | Web Speech API | No library. `webkitSpeechRecognition`, free, no key |
| Weather | [Open-Meteo](https://open-meteo.com/) | Free, no API key, historical + forecast |

### What is deliberately not on this list

The construction-specific open source is the wrong shape.
[OpenProject](https://github.com/opf/openproject) and
[OpenConstructionERP](https://github.com/datadrivenconstruction/OpenConstructionERP)
are heavyweight BOQ/BIM/ERP platforms — Gantt charts, 5D cost models, tendering.
That is precisely the category §6 rules out, and adopting one would mean
inheriting an enormous surface area to serve a product whose entire thesis is
that the PM touches one screen for sixty seconds. Generic client portals like
[Atrium](https://github.com/Vibra-Labs/Atrium) are closer in spirit but are
agency file-sharing tools with no concept of a build stage.

Nothing off the shelf models *a house moving through fourteen stages with an
anxious family attached to it*. That model is the whole product, and it is small.

---

## 13. Decisions needed before Phase 1

1. **Weekly + on-change cadence, or hold out for daily?** Blocks the welcome
   message, the digest schedule, and what gets promised in writing.
2. **$0 on Cloudflare, or $35/mo staying on Vercel?** Blocks Phase 0. Recommend
   Vercel Pro if it saves three days — revisit once the pilot proves out.
3. **Does the fourteen-stage spine fit every house?** He should redline it.
   Blocks the stage model and every forecast built on it.
4. **Is WhatsApp non-negotiable for these owners?** Blocks nothing in Phase 1 —
   but if yes, the notification adapter gets designed differently now.
5. **Are progress claims in scope, or do they stay in the accounting system?**
   Blocks Phase 3 scope. Easiest to defer, most valuable to owners.

Recommended start regardless of the answers: **Phase 0.** The storage problem has
to be fixed before anything can be built on it, and the hosting-terms question
applies to the existing site today. Then pick three easy-going owners and run
Phase 1 on them only.
