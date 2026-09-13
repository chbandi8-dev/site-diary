"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, MailX, RefreshCw, Undo2 } from "lucide-react";

type Registered = {
  ownerId: string;
  name: string;
  email: string | null;
  revoked: boolean;
};

/**
 * The house's share link, and who has used it.
 *
 * One link per house, sent over WhatsApp. Whoever opens it sees the build and
 * can add their own name and email for updates — so he never types an owner's
 * details, which is the setup burden that would otherwise stop this at three
 * houses.
 *
 * The link is shown once, on creation. Only its hash is stored, so it cannot be
 * looked up later; if it is needed again he issues a fresh one, which revokes
 * the old.
 */
export default function HouseLink({
  houseId,
  address,
  hasLink,
  linkHint,
  lastUsedAt,
  useCount,
  registered,
}: {
  houseId: string;
  address: string;
  hasLink: boolean;
  linkHint: string | null;
  lastUsedAt: string | null;
  useCount: number;
  registered: Registered[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/house-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create a link.");
      setUrl(data.url);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't create a link.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  }

  async function setRevoked(ownerId: string, revoked: boolean) {
    setBusy(true);
    try {
      await fetch("/api/pm/house-link", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, ownerId, revoked }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        Owner link
      </h2>

      <div className="rounded-lg border border-white/5 bg-dark-card p-5">
        {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

        {url ? (
          <>
            <p className="mb-3 text-sm text-white/60">
              Copy this into WhatsApp now — it won&apos;t be shown again.
            </p>
            <div className="flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-dark px-4 py-3 font-mono text-xs text-gold">
                {url}
              </code>
              {/*
                A bare URL from an unknown number reads as a scam, and
                copy-then-switch-apps is the clunkiest step in the whole product
                — this is its entire distribution mechanism.
              */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Hi — this is the page for ${address}. Photos and updates go up here as they happen, ` +
                    `and you can ask me anything through it: ${url}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[46px] items-center gap-2 rounded-lg bg-gold px-5 font-medium text-dark"
              >
                Send on WhatsApp
              </a>
              <button
                type="button"
                onClick={copy}
                className="flex min-h-[46px] items-center gap-2 rounded-lg border border-white/15 px-4 text-white/75"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-white/75">
                {hasLink ? `A link is active (ends ${linkHint}).` : "No link yet."}
              </p>
              <p className="mt-1 text-sm text-white/45">
                {hasLink
                  ? lastUsedAt
                    ? `Last opened ${new Date(lastUsedAt).toLocaleDateString("en-AU", {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      })}.`
                    : "Not opened yet."
                  : "Create one and send it to the owners on WhatsApp."}
              </p>
            </div>
            <button
              type="button"
              onClick={issue}
              disabled={busy}
              className="flex min-h-[46px] items-center gap-2 rounded-lg bg-gold px-5 font-medium text-dark disabled:opacity-40"
            >
              {hasLink ? <RefreshCw size={16} /> : <Link2 size={16} />}
              {hasLink ? "Replace link" : "Create link"}
            </button>
          </div>
        )}

        {hasLink && !url && (
          <p className="mt-4 border-t border-white/5 pt-4 text-xs leading-relaxed text-white/40">
            Replacing the link stops the old one working immediately — for everyone who has it.
            That is the only way to cut off access: stopping someone&apos;s emails does not stop
            them opening a link they already hold.
          </p>
        )}
      </div>

      <h3 className="mb-3 mt-8 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        Signed up for updates
      </h3>

      {registered.length === 0 ? (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-5 text-sm leading-relaxed text-white/45">
          Nobody yet. They can see the build as soon as they tap the link — this fills in when
          someone adds their email so they get told about new updates.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {registered.map((r) => (
            <li
              key={r.ownerId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-dark-card px-5 py-4"
            >
              <div className="min-w-0">
                <span className="block font-medium text-white">{r.name}</span>
                <span className="block truncate text-sm text-white/45">{r.email ?? "No email"}</span>
                {r.revoked && (
                  <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                    Removed
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRevoked(r.ownerId, !r.revoked)}
                className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35 disabled:opacity-40"
              >
                {r.revoked ? <Undo2 size={14} /> : <MailX size={14} />}
                {r.revoked ? "Resume emails" : "Stop emails"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
