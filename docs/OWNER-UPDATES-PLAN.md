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

The current stack cannot hold this data:

- `lib/prisma.ts` points Prisma at a SQLite file bundled into the serverless
  function via `outputFileTracingIncludes` in `next.config.mjs`. On Vercel that
  filesystem is read-only and ephemeral — writes are lost on redeploy and are not
  shared between function instances.
- `app/api/upload/route.ts` writes to `public/uploads` on local disk. Same
  problem, and site photos are the core asset.
- `vercel.json` commits a shared `NEXTAUTH_SECRET` into the repo.

Work: migrate to Postgres (Neon or Vercel Postgres), move uploads to Vercel Blob
or S3/R2 with client-side image compression, move secrets to Vercel environment
variables, migrate existing CMS rows.

Non-negotiable. Everything else assumes durable storage.

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

- `visibility` must be enforced at the query layer, not the UI layer. An owner
  must be structurally incapable of seeing another house or an internal note.
- Every date shown to an owner needs an `isEstimate` flag and renders differently
  when true.

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

## 11. Cost, and build vs buy

Running cost at 25 houses: roughly **AUD $60–100/month** — Vercel Pro, managed
Postgres, blob storage, SMS at a few cents each, transcription and drafting API
usage in the low single digits.

Buildertrend and CoConstruct do this and more, from roughly USD $399/month, and
would be running next week rather than in six.

The honest case for building: those tools are designed for the builder's back
office, and their client portals are an afterthought that owners rarely open.
This product is owner-experience-first and everything else is subordinate to
that — plus it shares a domain, a design language and a database with the
marketing site that already exists here, and there is no per-user pricing as the
portfolio grows.

The honest case for buying: if the goal is relief this month rather than an
asset, buy it.

---

## 12. Decisions needed before Phase 1

1. Weekly + on-change cadence, or hold out for daily?
2. SMS + email first, or is WhatsApp non-negotiable for these owners?
3. One shared stage template for all houses, or per-house variation?
4. Does the owner portal live under the existing brand domain?
5. Are progress claims in scope, or does that stay in the accounting system?
