# How owners get in

There is no sign-in. There is no account, no password, no code.

## The whole flow

**He does:** opens the house, taps **Create link**, pastes it into WhatsApp.

**They do:** tap it. Their house is there.

That's it. Everything else on this page is detail.

## One link per house

Not one per person. It goes into the family group chat and whoever opens it —
husband, wife, her father who keeps asking — sees the build. No admin work per
person, which matters because setup burden is what actually kills a rollout
like this: at an evening per house he would do three and stop.

## Name and email come second, from them

Under the first update there's a card: *want to know when something happens
here?* They add a name and email, and from then on they're emailed each update.

Three deliberate choices in that:

- **It's after the house, not before it.** The moment someone sees photos of
  their own build is the moment they'll happily hand over an email. Asking first
  spends that goodwill and loses people at the door.
- **It's skippable.** Someone who ignores it still sees every update; they just
  have to come and look. A wall there would cost exactly the people least likely
  to persist, who are the ones this exists for.
- **He never types an owner's details.** They type their own, so the address is
  right — far better than him transcribing from a contract.

Expect most but not all to register. He can see who has, per house, and nudge
the rest on WhatsApp.

## The link is access; the email is delivery

These are unrelated, and that's the point.

A mistyped email costs notifications, never access — the link keeps working.
That's a far kinder failure than a sign-in, where a wrong address locks someone
out of their own house.

## Raising something needs a name

Viewing needs nothing. But to ask a question or report a problem they have to
have registered first — not for security, but because a report with nobody
attached is one he can't reply to, which is worse than no report at all.

## Replacing a link

**Replace link** on the house page issues a new one and kills the old one
immediately. Use it when a link has gone somewhere it shouldn't, or when the
original WhatsApp message is long lost.

The link is shown **once**, when it's created. Only a hash of it is stored, so
it can't be looked up later — which is also why a copy of the database hands
nobody a working link.

**Remove** on a registered person stops their notifications and their access on
their very next request. Reversible.

## What you're accepting

**Anyone holding the URL can see that house.** It will be forwarded — to
parents, to the group chat, to their building inspector. That's mostly fine, and
it's the right trade for build photos: the realistic alternative is an owner who
never opens the portal at all.

What it means in practice: nothing goes on that page he wouldn't want a stranger
reading. No margins, no subcontractor rates, no other clients.

Mitigations that are built in:

- 32 random bytes, so a link can't be guessed.
- Only a hash stored, so a database leak grants nothing.
- The token sits in the URL path, not the query string — query strings reach
  server logs, analytics and referrer headers far more readily.
- Pages served through a link send `Referrer-Policy: no-referrer`, so it can't
  leak through an outbound click.
- After it's redeemed the browser is redirected to a clean URL, so the token
  stops showing in the address bar and in screenshots.
- Every open is logged with a timestamp and a count, which is the one thing
  link-only access would otherwise give up.
- A link is bound to one house at issue time. Nothing in the URL can widen it.

## The one place friction comes back

When variation approvals land, someone tapping **approve** on a $14,000 change
gets a one-time code to their email for that action alone. It's money and it's
evidence in a dispute, so it deserves more than a forwarded link — but only 1%
of visits pay for it instead of 100%.
