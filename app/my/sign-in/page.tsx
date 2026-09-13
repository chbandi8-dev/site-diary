"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createOwnerBrowserClient } from "@/lib/supabase/client";

/**
 * Sign-in for homeowners.
 *
 * A six-digit code rather than a magic link, deliberately. Corporate mail
 * scanners and link previewers follow links in email, which consumes a
 * single-use magic link before the person ever clicks it — producing "this link
 * has already been used" for someone who did nothing wrong. At twenty-five
 * users that is a support call a month for no benefit. A code cannot be
 * consumed by a scanner.
 *
 * No password is ever set. Homeowners will not create an account, and asking
 * them to is how a portal ends up unused.
 */
export default function OwnerSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/my";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createOwnerBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      // Only people already set up as owners of a house can sign in. A stranger
      // entering an address gets the same screen and no email.
      options: { shouldCreateUser: false },
    });

    setBusy(false);
    if (error) {
      setError("We couldn't send a code to that address. Check it, or call your builder.");
      return;
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createOwnerBrowserClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });

    setBusy(false);
    if (error) {
      setError("That code didn't work. It may have expired — request a new one.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-16 bg-bg">
      <div className="w-full max-w-md">
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-text/45 mb-4">
          Your build
        </p>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight mb-3">
          {step === "email" ? "Sign in to see your house" : "Check your email"}
        </h1>
        <p className="text-text/65 leading-relaxed mb-8">
          {step === "email"
            ? "Enter the email address your builder has on file. We'll send you a six-digit code — there's no password to remember."
            : `We sent a six-digit code to ${email}. It's good for the next hour.`}
        </p>

        {error && (
          <div
            role="alert"
            className="mb-6 border-l-[3px] border-accent-primary bg-surface/60 px-4 py-3 text-sm leading-relaxed"
          >
            {error}
          </div>
        )}

        {step === "email" ? (
          <form onSubmit={requestCode} className="flex flex-col gap-4">
            <label htmlFor="owner-email" className="font-mono text-[11px] tracking-[0.12em] uppercase text-text/50">
              Email address
            </label>
            <input
              id="owner-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-text/15 bg-white px-4 py-3 text-base focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
            />
            <button
              type="submit"
              disabled={busy || !email}
              className="mt-2 bg-accent-primary px-6 py-3.5 font-medium text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <label htmlFor="owner-code" className="font-mono text-[11px] tracking-[0.12em] uppercase text-text/50">
              Six-digit code
            </label>
            <input
              id="owner-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full border border-text/15 bg-white px-4 py-3 font-mono text-2xl tracking-[0.35em] focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
            />
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="mt-2 bg-accent-primary px-6 py-3.5 font-medium text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); setError(null); }}
              className="text-sm text-text/55 underline underline-offset-4 hover:text-text"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
