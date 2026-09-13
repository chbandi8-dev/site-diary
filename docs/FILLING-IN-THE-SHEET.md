# Getting the real houses in

Fill in `houses-template.csv`, one row per house, then run the importer. For
20–25 houses this is about twenty minutes of his time, and it is the only
manual step between an empty site and a working one.

## What each column means

| Column | What to put | If unsure |
|---|---|---|
| `address` | Street address. No suburb. | — |
| `suburb` | Suburb only. | Leave blank |
| `storeys` | `1` or `2` | `1` |
| `owner1_name` / `owner1_email` | Optional. Owners add their own details when they open the house link, which is less work and more accurate. | Leave blank |
| `owner2_name` / `owner2_email` | Optional, same as above. | Leave blank |
| `current_stage` | Where the build is **right now**. Use the names in the list below, or his own words — the importer matches loosely and tells you what it could not place. | — |
| `waiting_on` | What is holding it up, in plain English: `window delivery`, `certifier sign-off`, `owner tile selection`. This becomes the first line the owner reads. | Leave blank |
| `waiting_on_date` | When he expects it, `YYYY-MM-DD`. | Leave blank |
| `handover_from` / `handover_to` | Estimated handover as a **range**, `YYYY-MM-DD`. Owners treat a single date as a promise. A two-month window is honest and defensible. | Widen the range |
| `started` | Site start date, `YYYY-MM-DD`. Used to estimate the stages behind the current one. | Rough is fine |

Multiple stages can run at once. If two are genuinely underway, separate them
with a semicolon: `Roof; External walls`.

## The stage names

Anything before the current stage is marked complete, anything after is not
started. He only needs to name where each house is now.

**Before we start** — Contract & deposit · Selections & colours · Soil test, survey & engineering · Plans & development approval · Construction certificate, insurance & permits · Site handover & pre-start meeting

**Site works** — Demolition & service disconnection · Site establishment & set-out · Earthworks, piering & retaining

**Foundations** — Under-slab plumbing & drainage · Footings & slab

**Frame & roof** — Frame · Roof

**Enclosing the house** — External walls: brick, cladding or render · Windows & external doors

**Inside the walls** — Rough-ins: plumbing, electrical & HVAC · Wet-area waterproofing · Insulation & internal linings

**Fit-out** — Tiling · Fix-out carpentry · Cabinetry & stone · Painting · Fit-off: plumbing, electrical & appliances

**Outside & finishing** — Driveway, paths & stormwater · Fencing & landscaping · Final clean & builder's defect sweep

**Handover** — Compliance certificates · Occupation certificate · Pre-handover inspection & defects list · Rectification · Handover & keys

**After handover** — Defects liability period

## Running the import

```bash
npx ts-node scripts/import-houses.ts docs/houses-template.csv --dry-run   # check first
npx ts-node scripts/import-houses.ts docs/houses-template.csv
```

`--dry-run` reads the file, matches every stage name and prints exactly what it
would create, without writing anything. Always run it first — a typo in a stage
name is much easier to fix before the rows exist.

The import is safe to re-run: houses are matched on address, so correcting the
sheet and running it again updates rather than duplicates.

## Then, once per house

Open it in the admin, tap **Create link**, and send that link on WhatsApp. The
owners add their own name and email once they are looking at the page.

Nothing is visible to anyone until a link is created, so everything can be
loaded and checked first.
