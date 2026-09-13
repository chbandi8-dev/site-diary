"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createOwnerBrowserClient } from "@/lib/supabase/client";

/**
 * Sign-in for homeowners.
 *
 * Their builder normally sends an access link, and one tap is the whole
 * journey. This page is the fallback for when that link doesn't work — which
 * happens often enough to design for, because corporate mail scanners and link
 * previewers follow URLs in email and consume a single-use link before the
 * person ever clicks. So every access email carries a six-digit code as well,
 * and this page accepts it.
 *
 * Once they're in, the session persists on that device until they clear their
 * browsing data. No password is ever set: homeowners will not create an
 * account, and asking them to is how a portal ends up unused.
 */

const SMS_ENABLED = process.env.NEXT_PUBLIC_SMS_ENABLED === "true";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/my";
  const linkExpired = params.get("expired") === "1";

  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [step, setStep] = useState<"identify" | "code">("identify");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPhone = channel === "phone";

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createOwnerBrowserClient();
    const value = contact.trim();

    const { error } = await supabase.auth.signInWithOtp(
      isPhone
        ? { phone: value, options: { shouldCreateUser: false } }
        : {
            email: value.toLowerCase(),
            // Only people their builder has already set up as owners can get a
            // code. Anyone else sees this same screen and receives nothing.
            options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/my/enter` },
          }
    );

    setBusy(false);
    if (error) {
      setError(
        isPhone
          ? "We couldn't send a code to that number. Check it, or call your builder."
          : "We couldn't send anything to that address. Check it, or ask your builder to resend your link."
      );
      return;
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createOwnerBrowserClient();
    const value = contact.trim();

    const { error } = await supabase.auth.verifyOtp(
      isPhone
        ? { phone: value, token: code.trim(), type: "sms" }
        : { email: value.toLowerCase(), token: code.trim(), type: "email" }
    );

    setBusy(false);
    if (error) {
      setError("That code didn't work. It may have expired — ask for a new one.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-text/45">
        Your build
      </p>
      <h1 className="mb-3 font-display text-[clamp(2rem,7vw,2.75rem)] leading-[1.05] tracking-tight">
        {step === "identify" ? "Sign in to see your house" : "Check your messages"}
      </h1>
      <p className="mb-8 leading-relaxed text-text/65">
        {step === "identify"
          ? `Enter the ${isPhone ? "mobile number" : "email address"} your builder has on file. We'll send you a link and a six-digit code — there's no password to remember.`
          : `We've sent a link and a code to ${contact}. Either one works, and they're good for an hour.`}
      </p>

      {linkExpired && step === "identify" && (
        <div
          role="status"
          className="mb-6 border-l-[3px] border-accent-secondary bg-surface/50 px-4 py-3 text-sm leading-relaxed"
        >
          That link has already been used or has expired. This happens sometimes when an email
          provider checks links automatically. Enter your details below and we&apos;ll send a fresh
          one.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-6 border-l-[3px] border-accent-primary bg-surface/60 px-4 py-3 text-sm leading-relaxed"
        >
          {error}
        </div>
      )}

      {step === "identify" ? (
        <form onSubmit={requestCode} className="flex flex-col gap-4">
          {SMS_ENABLED && (
            <div className="mb-1 flex gap-2" role="group" aria-label="How to sign in">
              {(["email", "phone"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => { setChannel(option); setContact(""); setError(null); }}
                  aria-pressed={channel === option}
                  className={
                    "min-h-[44px] flex-1 border px-4 text-sm transition-colors " +
                    (channel === option
                      ? "border-accent-primary bg-accent-primary/10 text-text"
                      : "border-text/15 text-text/60 hover:border-text/35")
                  }
                >
                  {option === "email" ? "Email" : "Mobile"}
                </button>
              ))}
            </div>
          )}

          <label
            htmlFor="owner-contact"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/50"
          >
            {isPhone ? "Mobile number" : "Email address"}
          </label>
          <input
            id="owner-contact"
            type={isPhone ? "tel" : "email"}
            inputMode={isPhone ? "tel" : "email"}
            autoComplete={isPhone ? "tel" : "email"}
            required
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={isPhone ? "+61 4XX XXX XXX" : "you@example.com"}
            className="w-full border border-text/15 bg-white px-4 py-3.5 text-base focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
          />
          <button
            type="submit"
            disabled={busy || contact.trim().length < 5}
            className="mt-2 min-h-[52px] bg-accent-primary px-6 font-medium text-white transition-opacity disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send me a link"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <label
            htmlFor="owner-code"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/50"
          >
            Six-digit code
          </label>
          <input
            id="owner-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full border border-text/15 bg-white px-4 py-3.5 font-mono text-2xl tracking-[0.35em] focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
          />
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="mt-2 min-h-[52px] bg-accent-primary px-6 font-medium text-white transition-opacity disabled:opacity-50"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("identify"); setCode(""); setError(null); }}
            className="text-sm text-text/55 underline underline-offset-4 hover:text-text"
          >
            Use something else
          </button>
        </form>
      )}

      <p className="mt-10 border-t border-text/10 pt-6 text-sm leading-relaxed text-text/50">
        Trouble getting in? Ask your builder to send you a fresh link — it takes them one tap.
      </p>
    </main>
  );
}

export default function OwnerSignIn() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <SignInForm />
    </Suspense>
  );
}
