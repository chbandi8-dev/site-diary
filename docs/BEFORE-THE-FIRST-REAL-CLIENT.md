# Before the first real client

Everything below is done once, from a phone. The order matters: the last two
only make sense after the first three.

---

## 1. Secrets

Four values were shared in a chat while this was being built, which means they
should be treated as public. Replace them:

| What | Where | Why it matters |
|---|---|---|
| **Gmail app password** | Google Account → Security → App passwords | Can send email as you, to anyone |
| Database password | Supabase → Settings → Database → Reset | Full read/write to every house and owner |
| `NEXTAUTH_SECRET` | Any random 32+ characters | Forges an admin session |
| `ADMIN_PASSWORD` | Your choice | The staff login |

The Gmail one first. It is the only one that can be used against people who are
not you.

After changing any of them, update the matching value in **Vercel → Settings →
Environment Variables**, then redeploy. The database password appears in two
variables — `DATABASE_URL` and `DIRECT_URL` — and both need it.

## 2. Environment variables that fail quietly

These do not error. They just stop a feature working, with nothing on screen to
say why:

- **`ANTHROPIC_API_KEY`** — without it, voice capture records and then says it
  is not configured. About $2.50 a month in practice.
- **`GMAIL_USER` / `GMAIL_APP_PASSWORD`** — without them, every email queues and
  never sends. The app will look like it is working.
- **`EMAIL_FROM_NAME`** — what owners see as the sender. Set it to his name or
  the business, not an address.
- **`CRON_SECRET`** — without it the Friday digest returns 401 and nobody is
  told anything, every week, silently.
- **`NEXT_PUBLIC_SITE_URL`** — every owner link is built from it.

## 3. Check email actually works, end to end

Not by reading settings — by sending one.

1. Add a house (Houses → Add a house)
2. **Copy link**, open it, register with your own email address
3. Send an update from the house page

It should arrive in your inbox within a minute, from your Gmail, with your name
on it. If it does not, the problem is in section 2.

## 4. Clear the example houses

Houses → **Remove the example houses**. They cannot email anyone — their owners
are on a reserved domain that does not accept mail — but they will sit in the
dashboard's counts and make the Friday email's numbers wrong.

## 5. Set up a backup

The database holds the only copy of every house, every owner's contact details,
and every variation and defect on record. It is on a free tier with limited
recovery.

- **Now, and monthly:** Houses → **Download a copy**. Put it in Google Drive.
- **Worth considering:** Supabase's paid tier adds daily backups and
  point-in-time recovery. If this ends up holding the record behind a disputed
  progress claim, that is inexpensive insurance.

---

## Then, the first real house

1. **Houses → Add a house.** Say it out loud: address, suburb, storeys, owners,
   where it is up to, what you are waiting on, roughly when handover is.
2. Check the form and correct anything the dictation got wrong.
3. **Copy link** and send it to the owners on WhatsApp.
4. They open it, add their name and email, and from then on they get every
   update by email as well as on the page.

He never types an owner's email address. They do that themselves, once.
