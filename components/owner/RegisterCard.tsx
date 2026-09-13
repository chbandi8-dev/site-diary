"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Asking who they are, once, after they have already seen their house.
 *
 * This is not a sign-up and must not feel like one. They already have access —
 * the link gave them that. The only thing being bought here is the ability to
 * tell them when something happens, so they don't have to keep checking.
 *
 * It is dismissible on purpose. Someone who skips it still sees every update;
 * they just have to come and look. A wall here would cost the people least
 * likely to persist, who are exactly the ones this product exists for.
 */
export default function RegisterCard() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't save.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 border border-text/12 bg-white p-6 sm:p-7">
      <h2 className="font-display text-xl leading-snug tracking-tight sm:text-2xl">
        Want to know when something happens here?
      </h2>
      <p className="mt-2 max-w-prose leading-relaxed text-text/65">
        Add your details and we&apos;ll email you each time there&apos;s an update — photos,
        progress, anything we need from you. Otherwise you&apos;re welcome to just check back
        whenever you like.
      </p>

      {error && (
        <p role="alert" className="mt-4 border-l-[3px] border-accent-primary bg-surface/60 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="reg-name" className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/50">
              Your name
            </label>
            <input
              id="reg-name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-text/15 bg-white px-4 py-3 focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="reg-email" className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/50">
              Email
            </label>
            <input
              id="reg-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-text/15 bg-white px-4 py-3 focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={busy || !name.trim() || !email.includes("@")}
            className="min-h-[48px] bg-accent-primary px-6 font-medium text-white transition-opacity disabled:opacity-50"
          >
            {busy ? "Saving…" : "Email me updates"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-sm text-text/55 underline underline-offset-4 hover:text-text"
          >
            Not now
          </button>
        </div>
      </form>
    </section>
  );
}
