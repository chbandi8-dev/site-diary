import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/notify/email";

/**
 * Access links for homeowners.
 *
 * The email carries BOTH a link and a six-digit code, deliberately.
 *
 * A link alone is fragile: corporate mail scanners and link previewers follow
 * URLs in email, which consumes a single-use sign-in link before the person
 * ever clicks it. They then see "this link has already been used" having done
 * nothing wrong, and ring the builder. A code alone is robust but is one more
 * thing to type on a phone. Sending both means the common case is one tap, and
 * the failure case is still recoverable without anyone making a call.
 *
 * Generated server-side with the service-role key so the builder can send or
 * re-send one at any time, from the admin screen, without the owner having to
 * ask for it first.
 */

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type InviteResult = { sent: true; email: string };

/**
 * Creates (or re-creates) an owner's access link and emails it.
 *
 * Safe to call repeatedly. Each call issues a fresh link and invalidates the
 * previous one, so "I've lost the email" is a one-click fix and a link that
 * escaped into the wrong inbox stops working the moment a new one is sent.
 */
export async function sendAccessLink(opts: {
  email: string;
  name: string;
  houseAddress: string;
  firstTime: boolean;
}): Promise<InviteResult> {
  const supabase = admin();
  const site = process.env.NEXTAUTH_URL ?? "";
  const email = opts.email.trim().toLowerCase();

  // `magiclink` only works for a user that already exists; `invite` creates
  // one. Owners are created in advance from the intake sheet, so which of the
  // two applies depends on whether they have ever signed in.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: opts.firstTime ? "invite" : "magiclink",
    email,
    options: { redirectTo: `${site}/my/enter` },
  });

  if (error || !data?.properties) {
    throw new Error(error?.message ?? "Couldn't create an access link");
  }

  const { hashed_token: token, email_otp: code } = data.properties;
  const link = `${site}/my/enter?token_hash=${token}&type=${opts.firstTime ? "invite" : "magiclink"}`;

  await sendEmail({
    to: email,
    subject: opts.firstTime
      ? `${opts.houseAddress} — your build updates`
      : `${opts.houseAddress} — your sign-in link`,
    body: [
      `Hi ${opts.name.split(" ")[0]},`,
      "",
      opts.firstTime
        ? `This is where you can follow progress on ${opts.houseAddress} — photos, what's happening on site, and anything we need from you.`
        : `Here's a fresh link for ${opts.houseAddress}.`,
      "",
      "Open it here:",
      link,
      "",
      `Or go to ${site}/my and enter this code: ${code}`,
      "",
      "The link and code are good for an hour. Once you're in, you'll stay signed in on that device — no password to remember.",
      "",
      "If you didn't expect this email, you can ignore it.",
    ].join("\n"),
  });

  return { sent: true, email };
}
