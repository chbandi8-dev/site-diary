# Deploying without a computer

Everything below is done in a phone browser. No terminal, ever.

## The one-time setup

Development happens in `rohithan77/Construction-site`. Vercel watches
`chbandi8-dev/site-diary`. A GitHub Action bridges the two: every push to the
working branch is mirrored across, and Vercel builds it.

Setting it up means creating one token and pasting it into one box. Both are
browser steps, so both work on a phone.

### 1. Create the token

On **github.com**, signed in as the account that can write to
`chbandi8-dev/site-diary`:

**Settings → Developer settings → Personal access tokens → Fine-grained
tokens → Generate new token**

- **Repository access:** Only select repositories → `chbandi8-dev/site-diary`
- **Permissions:** Repository permissions → **Contents: Read and write**
- **Expiry:** whatever is comfortable. The mirror stops working silently when
  it lapses, so a reminder is worth setting alongside it.

Copy the token. GitHub shows it exactly once.

### 2. Paste it in

On **`rohithan77/Construction-site`**:

**Settings → Secrets and variables → Actions → New repository secret**

- **Name:** `MIRROR_TOKEN` — exactly that, it is what the workflow looks for
- **Secret:** the token

### 3. Run it once

**Actions → Mirror to the deployment repo → Run workflow.**

Green tick means the two repositories are in sync and Vercel is building.

Nothing about the Vercel project changes. It keeps watching the same
repository, with the same environment variables and the same URL.

## If the mirror ever stops

The workflow fails loudly rather than quietly doing nothing, so **Actions** in
`rohithan77/Construction-site` is the place to look. A red run there, with a
message about `MIRROR_TOKEN`, means the token expired — create a new one and
replace the secret. Then **Run workflow** to catch up.

## After that

A change is pushed, Vercel builds it, the site updates. Two to three minutes.
Nothing to run.

Database changes apply themselves too — the build command runs
`prisma migrate deploy` before building, so a release that adds a column brings
the column with it. If a migration fails the build fails, which is the correct
outcome: a half-migrated database serving a new app is worse than a site that
stayed on the previous version.

## Adding houses

Through the app, not a script. **Houses → Add a house**, then talk:

> "Fourteen Wattle Grove, Kellyville. Double storey. Priya and Arun Raman.
> We're on the roof, waiting on the windows, should be here Thursday. Handover
> looking like March, April next year."

The form fills itself in, he corrects anything wrong, and taps Add. The 32
stages are created automatically.

The CSV importer and the demo seed still exist and still need a computer. They
are conveniences for bulk entry, not requirements — a phone can do everything
they do, one house at a time.

## Checking a deploy worked

Open the site and look for something only the newest version has. Right now
that is **Houses → Add a house**, and the **Forecast** section inside any
house. If they are there, the deploy landed.
