# Deploying without a computer

Everything below is done in a phone browser. No terminal, ever.

## The one-time setup

Vercel watches a GitHub repository and rebuilds the site whenever it changes.
Point it at the repository the work actually happens in, and there is nothing
left to do by hand.

1. Open **vercel.com** and sign in.
2. Open the **site-diary** project.
3. **Settings → Git**.
4. Disconnect the repository it currently watches.
5. Connect **`rohithan77/Construction-site`**. If it isn't offered, tap
   *Adjust GitHub App Permissions* and grant access to that account.
6. Still under Settings → Git, set **Production Branch** to
   `claude/construction-owner-updates-jaqeyb`.
7. **Deployments → Redeploy.**

Keep the same project rather than making a new one: the environment variables
stay where they are, so no secrets need retyping on a phone keyboard.

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
