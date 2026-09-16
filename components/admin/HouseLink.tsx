"use client";

import { useState } from "react";
import { whatsAppLink } from "@/lib/phone";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, MailX, RefreshCw, Undo2, Pencil, MessageCircle } from "lucide-react";

type Registered = {
  ownerId: string;
  phone: string | null;
  /** ISO date of their last visit, or null if they have never opened it. */
  lastSeenAt: string | null;
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
const STALE_DAYS = 14;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** True when it is worth his attention, not merely worth stating. */
function lastSeenTone(iso: string | null): boolean {
  const days = daysSince(iso);
  return days === null || days >= STALE_DAYS;
}

function lastSeenLabel(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return "Hasn't opened their page yet";
  if (days === 0) return "Opened their page today";
  if (days === 1) return "Opened their page yesterday";
  if (days < 14) return `Opened their page ${days} days ago`;
  if (days < 60) return `Last opened ${Math.floor(days / 7)} weeks ago`;
  return `Last opened ${Math.floor(days / 30)} months ago`;
}

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
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [editError, setEditError] = useState<string | null>(null);
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

  async function saveOwner(ownerId: string) {
    setBusy(true);
    setEditError(null);
    try {
      const res = await fetch("/api/pm/owners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId,
          houseId,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save that.");
      setEditing(null);
      router.refresh();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Couldn't save that.");
    } finally {
      setBusy(false);
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
          {registered.map((r) => {
            const wa = whatsAppLink(r.phone, `Hi ${r.name.split(" ")[0]}, `);
            const open = editing === r.ownerId;
            return (
              <li
                key={r.ownerId}
                className="rounded-lg border border-white/5 bg-dark-card px-5 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block font-medium text-white">{r.name}</span>
                    <span className="block truncate text-sm text-white/45">
                      {r.email ?? "No email"}
                      {r.phone ? ` · ${r.phone}` : ""}
                    </span>
                    {/* Whether they are actually reading any of it. An owner
                        who stopped opening it three weeks ago is the one about
                        to ring, and he had no way to know. */}
                    <span
                      className={
                        "mt-0.5 block text-xs " +
                        (lastSeenTone(r.lastSeenAt) ? "text-gold" : "text-white/35")
                      }
                    >
                      {lastSeenLabel(r.lastSeenAt)}
                    </span>
                    {r.revoked && (
                      <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                        Removed
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Greyed out until there is a number to open it with —
                        present either way, so it is obvious that adding a
                        number is what turns it on. */}
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-400/40 px-4 text-sm text-emerald-300 hover:border-emerald-400"
                      >
                        <MessageCircle size={14} aria-hidden="true" />
                        WhatsApp
                      </a>
                    ) : (
                      <span
                        title="Add a phone number to use WhatsApp"
                        className="flex min-h-[40px] cursor-not-allowed items-center gap-2 rounded-lg border border-white/10 px-4 text-sm text-white/25"
                      >
                        <MessageCircle size={14} aria-hidden="true" />
                        WhatsApp
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setEditing(open ? null : r.ownerId);
                        setForm({ name: r.name, email: r.email ?? "", phone: r.phone ?? "" });
                        setEditError(null);
                      }}
                      className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      {open ? "Cancel" : "Edit"}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRevoked(r.ownerId, !r.revoked)}
                      className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35 disabled:opacity-40"
                    >
                      {r.revoked ? <Undo2 size={14} /> : <MailX size={14} />}
                      {r.revoked ? "Resume emails" : "Stop emails"}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-white/5 pt-4">
                    {editError && (
                      <p role="alert" className="text-sm text-red-300">{editError}</p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        aria-label="Name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Name"
                        className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
                      />
                      <input
                        aria-label="Email"
                        type="email"
                        inputMode="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="Email"
                        className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
                      />
                      <input
                        aria-label="Mobile"
                        type="tel"
                        inputMode="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="0412 345 678"
                        className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => saveOwner(r.ownerId)}
                      disabled={busy || !form.name.trim() || !form.email.trim()}
                      className="min-h-[44px] self-start rounded-lg bg-gold px-5 text-sm font-medium text-dark disabled:opacity-40"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>

                    <p className="text-xs leading-relaxed text-white/30">
                      The mobile is only used to open WhatsApp with a message ready to
                      send — nothing is ever sent to it automatically.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
