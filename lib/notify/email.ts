import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * The one channel, behind a single function.
 *
 * Two backends, chosen by what is configured. Nothing outside this file knows
 * which one sends, so adding SMS or WhatsApp later is a third adapter rather
 * than a rewrite.
 *
 * GMAIL is the default for a small builder without a domain, and it is a better
 * fit than it first sounds:
 *
 *   - Updates arrive from his real address, which clients already have in their
 *     contacts. A reply goes straight to him instead of into a no-reply void.
 *   - Deliverability is not a question — it is Gmail sending.
 *   - Personal Gmail allows 500 recipients a day. Twenty-five houses with two
 *     owners each is 50 recipients per round, so even a busy day is a tenth of
 *     the allowance.
 *
 * RESEND is the upgrade once a domain exists. It needs one, though: without a
 * verified domain it will only deliver to the account owner's own address,
 * which is no use for real clients.
 */

type Message = { to: string; subject: string; body: string };

let resendClient: Resend | null = null;
let smtp: Transporter | null = null;

function gmailTransport(): Transporter {
  if (smtp) return smtp;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Email is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD, or RESEND_API_KEY."
    );
  }

  smtp = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    // Not the account password — an app password, which requires 2-Step
    // Verification to be on. Google removed plain-password SMTP in 2025.
    auth: { user, pass: pass.replace(/\s/g, "") },
  });
  return smtp;
}

function resend(): Resend {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  resendClient = new Resend(key);
  return resendClient;
}

export async function sendEmail(msg: Message): Promise<string | undefined> {
  // Resend only when a domain has actually been verified for it. Otherwise
  // Gmail, which needs nothing but the account itself.
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const { data, error } = await resend().emails.send({
      from: process.env.EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    if (error) throw new Error(error.message);
    return data?.id;
  }

  const user = process.env.GMAIL_USER;
  const info = await gmailTransport().sendMail({
    // Display name so it reads as a person, not a system.
    from: process.env.EMAIL_FROM_NAME ? `"${process.env.EMAIL_FROM_NAME}" <${user}>` : user,
    to: msg.to,
    subject: msg.subject,
    text: msg.body,
  });
  return info.messageId;
}

/** Used by the setup check to prove email works before any owner depends on it. */
export async function emailBackend(): Promise<"resend" | "gmail" | "unconfigured"> {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return "gmail";
  return "unconfigured";
}
