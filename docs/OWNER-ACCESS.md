# How owners get in, and stay in

## The normal path

He opens the house in the admin, taps **Send invite**, and that is it. The owner
gets an email with a link and a six-digit code. One tap on the link signs them
in, and they stay signed in on that device until they clear their browsing data.

No password is ever created. Homeowners will not sign up for an account, and
asking them to is how a portal ends up unused.

## Why every email carries a code as well as a link

Corporate mail scanners, security gateways and link previewers follow URLs in
email. A single-use sign-in link can therefore be consumed before the person
ever clicks it, and they then see "this link has already been used" having done
nothing wrong.

At twenty-five owners that is a support call a month for no reason. So the same
email carries a six-digit code, and `/my/sign-in` accepts it. If the link fails,
the page says plainly why and offers to send a fresh one — rather than showing a
dead end.

## Resending

**Resending is meant to be routine, not exceptional.** Lost the email, new
phone, changed address, partner who was never added — all one tap on the house
page.

Each new link invalidates the previous one. That is also how a link that reached
the wrong inbox gets shut off: send a new one.

## Two people on one house

Both owners get their own sign-in and both see the same page, including each
other's questions and his replies to either of them. They are one household
having one conversation, not two separate support tickets — a couple where only
one of them can see the answer is worse than useless.

Add the second owner's email on the house page and send them an invite. There is
no limit; a third party such as a project manager or a parent can be added the
same way.

## Revoking

**Revoke** on the house page cuts a person off immediately — on their very next
request, even if they are already signed in, because every database policy
checks the revocation rather than waiting for a session to expire.

Use it when a house is sold mid-build, when a couple separates, or when a link
has clearly gone somewhere it shouldn't. It is reversible: **Restore** puts them
back without needing a new invite.

## Signing in by mobile

The sign-in page can take a mobile number instead of an email, but the option
stays hidden until an SMS provider is configured in Supabase (Authentication ›
Providers › Phone) and `NEXT_PUBLIC_SMS_ENABLED` is set to `true`.

Deliberately off by default: an option that appears and then fails is worse than
one that isn't offered. SMS also costs roughly $12 a month for this many owners —
worth it eventually, since text messages get opened and email gets buried, but
not needed to start.

## A forwarded link

Assume it will happen — to a partner, a parent, the family group chat, their
building inspector. Design for it rather than pretending otherwise:

- Links expire in an hour and are single-use, so a forwarded email is usually
  already dead.
- Only people he has already set up as owners can request a code at all. A
  stranger entering an address sees the same screen and receives nothing.
- If a link does reach the wrong person, sending a new one kills it, and
  **Revoke** removes the account entirely.

What a forwarded link cannot do is reach a different house. Scope comes from the
signed-in identity, never from the URL.
