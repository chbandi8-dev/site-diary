import { Resend } from "resend";

/**
 * The one channel, behind a single function.
 *
 * Kept deliberately narrow so adding SMS or WhatsApp later is a second adapter
 * rather than a rewrite. Nothing outside this file knows which provider sends.
 */

let client: Resend | null = null;

function resend(): Resend {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  client = new Resend(key);
  return client;
}

export async function sendEmail(msg: {
  to: string;
  subject: string;
  body: string;
}): Promise<string | undefined> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");

  const { data, error } = await resend().emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.body,
  });

  if (error) throw new Error(error.message);
  return data?.id;
}
