# Where this is going

The product plan for Site Diary. Written after eleven weeks of building it and
never once writing this down, which is why some of what follows is a correction
rather than a roadmap.

`PRODUCT.md` in the root is about the marketing website — the project this
repository started as. It says nothing about this app, and nothing in it should
be read as applying here.

---

## The aim, in one line

**Give a residential construction project manager back the hours he currently
spends on the phone, in a diary, and in his own head.**

Not: a portal. Not: a CRM. Not: a builder's ERP. If a feature does not remove
minutes from his week or prevent a day being lost, it does not belong here,
however good it looks.

---

## The person

One man. Not a persona — an actual person this is built for.

- Residential PM in Sydney. 20–25 houses running at once, plus lots in a
  developer's estate where he deals with one client for the whole release.
- **Works from an iPhone.** Not "mobile-friendly" — mobile-only. He has a
  laptop at home he opens maybe twice a week.
- On site from 7am. Four to eight sites a day. The gaps are 15–30 minutes in
  the ute between them, and that is when he would use this.
- Hands are dirty, the sun is on the screen, the signal is one bar, and he is
  usually mid-conversation with somebody.
- He is a builder, not a computer person. Anything that needs to be learned
  will not be used.

### What actually eats his week

Ranked by hours, from how the job really runs:

1. **Coordination.** Who is on which site tomorrow, did they confirm, is the
   material there, does the next trade know. This is almost entirely phone
   calls and memory.
2. **Being chased.** Owners ringing to ask what is happening. Developers
   asking where the lots are up to. His own boss asking the same.
3. **Paperwork at night.** Variations, progress claims, certificates,
   invoices — done after dinner because there is no time in the day.
4. **Rework and delay** caused by information not being where it needed to be:
   a missed inspection, a trade who turned up to an unprepared site.
5. **Recording what happened**, which he mostly does not do until there is a
   dispute and then wishes he had.

---

## What is built

Honest inventory, as of this writing.

### His side

| Area | State |
|---|---|
| Dashboard — what needs him today, portfolio by phase, links everywhere | Built |
| Run sheet — every house, filterable by phase and by what is slipping | Built |
| House page — five tabs, phone-first | Built |
| Stage board — 32-stage spine, tap to mark, add/remove per house | Built |
| Owner updates — write, draft, send by email, hand to WhatsApp | Built |
| Owner link — one link per house, revocable, shows who has opened it | Built |
| Decisions, variations, documents, defects, wet days | Built |
| Forecast — handover projected forward, and worked backwards from a promise | Built |
| Estates — lots grouped under one developer client | Built |
| Trades address book + a drafted WhatsApp message with a photo | Built |
| Friday email prep, broadcast to everyone | Built |
| **"Say it"** — one spoken note becomes a checklist of actions to approve | Built |
| Private site diary, export everything, demo data | Built |
| Light and dark, installable, works offline enough to not lose a note | Built |

### The owners' side

Their own page by link, no sign-in; photos and updates; raise a question or a
defect; approve a variation with a code.

### The builder's / developer's side

A read-only board by link: every build grouped by phase, what is underway,
what is behind. No owner details, no money.

---

## What is missing

This is the part that matters, and it is not a tidy list of nice-to-haves.
Measured against the week described above, the app covers **items 2 and 5 well,
item 3 partly, and items 1 and 4 not at all.**

Coordination — the single biggest consumer of his time — has no feature in this
product.

### 1. Nothing in here ever reaches out to him

Every screen waits to be opened. A man who is flat out does not open things.
The only scheduled jobs in the app send mail to *owners*.

Nothing says, at five o'clock: *three trades aren't confirmed for tomorrow, two
owners are waiting on an answer, and the frame inspection at Lot 114 needed
booking yesterday.*

Until this exists, everything else built here is worth less than it should be.

### 2. The week ahead — who is booked, who is not

He can see what a stage's dates say. He cannot record that he booked the tiler
for Tuesday, and nothing reminds him to confirm on Monday. The app knows the
programme and knows his trades, and does nothing with the two together.

This is the biggest single gap in the product.

### 3. Inspections

`Inspection` is in the database — kind, status, booked-for, result — and has no
screen. A missed frame inspection or waterproofing check stops a job dead and
costs days. Small to build. Prevents the expensive kind of failure.

### 4. Progress claims

`ClaimMilestone` is in the database — amount, due, invoiced, paid — and has no
screen. This is his cash flow. The stage board already knows the day the frame
was finished; the claim that should follow it is still a manual job at night.

Deliberately kept separate from the stage board: a mistap must never move an
invoice. But "frame complete → claim is now due" is the reminder he needs.

### 5. Deliveries and suppliers

"Waiting on the windows" is free text on a house. It has no date that chases
itself, and no list of what is due this week across every build.

### 6. Photos as a reflex

He can attach photos to an update. What he needs is one tap from the home
screen: shoot, and it files itself against the right house and stage without a
form. Evidence is only worth having if capturing it is free.

---

## What NOT to build

A plan is as much about this.

- **A Gantt chart.** Trades do not run to one and he will never maintain it.
  The 32-stage spine plus booked dates is as much structure as the job has.
- **Accounting.** Xero exists. Claims here should tell him what to invoice, not
  replace the invoicing.
- **A native iPhone app**, for now. The only thing it buys today is the contacts
  picker. Revisit if push notifications become the backbone of the nudge.
- **Reading the iPhone contact list.** Apple does not allow it from the web.
  Settled; stop asking the question.
- **More owner-facing features.** That side is ahead of where it needs to be.
- **Anything for a second user.** This is one man's tool. If another PM ever
  uses it, that is a different product with different problems.

---

## The order to build in

Ranked by hours returned per week, not by how interesting it is.

| # | What | Why it is here | Rough size |
|---|---|---|---|
| 1 | **The evening nudge** — one message at 5pm: what is unconfirmed, who is waiting, what must be booked | Makes everything already built actually get used | Small |
| 2 | **The week ahead** — book a trade against a stage, confirm it, see the week across every house | The largest time sink in the job, untouched | Large |
| 3 | **Inspections** — book, pass, fail, and a flag when one is due | Cheap to build, prevents lost days | Small |
| 4 | **Progress claims** — what is due to invoice, triggered by stages already ticked | His cash flow, currently a night job | Medium |
| 5 | **One-tap site photo** — camera to filed evidence with no form | Makes the record build itself | Small |
| 6 | **Deliveries** — what is due this week, across every build | Completes the coordination picture | Medium |

---

## The recommendation that comes before all of it

**Stop building. Put three real houses in and use it for a fortnight.**

Everything above is a considered guess. Not one of these features has been
tested against a real week, because the app has been built faster than it has
been used. Three real builds and ten working days would replace every guess in
this document with something known — and would almost certainly reorder the
table above.

The risk of continuing to build is not wasted code. It is a product that is
excellent at the parts that were easy to imagine and absent from the parts that
actually hurt.
