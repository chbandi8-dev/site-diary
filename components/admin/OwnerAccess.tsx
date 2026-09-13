"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, Send, ShieldOff, ShieldCheck } from "lucide-react";

type Owner = {
  ownerId: string;
  name: string;
  email: string | null;
  hasSignedIn: boolean;
  revoked: boolean;
};

/**
 * Who can see this house, and how to get them in.
 *
 * Re-sending is the common action, not the exceptional one — a lost email, a
 * new phone, a partner who was never added. It is one tap, and each new link
 * invalidates the last, which doubles as the way to shut off a link that
 * reached the wrong inbox.
 */
export default function OwnerAccess({ houseId, owners }: { houseId: string; owners: Owner[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState("");

  async function call(
    ownerId: string,
    method: "POST" | "PATCH" | "PUT",
    body: Record<string, unknown>,
    successText: string
  ) {
    setBusy(ownerId);
    setNote(null);
    try {
      const res = await fetch("/api/pm/owners", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      setNote({ id: ownerId, ok: true, text: successText });
      setEditing(null);
      router.refresh();
    } catch (cause) {
      setNote({
        id: ownerId,
        ok: false,
        text: cause instanceof Error ? cause.message : "That didn't work.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        Who can see this house
      </h2>

      <ul className="flex flex-col gap-2">
        {owners.map((o) => (
          <li key={o.ownerId} className="rounded-lg border border-white/5 bg-dark-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block font-medium text-white">{o.name}</span>
                <span className="mt-0.5 block truncate text-sm text-white/45">
                  {o.email ?? "No email yet — they can't sign in"}
                </span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                  {o.revoked
                    ? "Access revoked"
                    : o.hasSignedIn
                      ? "Has signed in"
                      : "Not signed in yet"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {!o.revoked && o.email && (
                  <button
                    type="button"
                    disabled={busy === o.ownerId}
                    onClick={() =>
                      call(
                        o.ownerId,
                        "POST",
                        { ownerId: o.ownerId, houseId },
                        o.hasSignedIn ? "New link sent." : "Invitation sent."
                      )
                    }
                    className="flex min-h-[40px] items-center gap-2 rounded-lg bg-gold px-4 text-sm font-medium text-dark disabled:opacity-40"
                  >
                    <Send size={14} aria-hidden="true" />
                    {o.hasSignedIn ? "Resend link" : "Send invite"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setEditing(editing === o.ownerId ? null : o.ownerId);
                    setDraftEmail(o.email ?? "");
                  }}
                  className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35"
                >
                  <Mail size={14} aria-hidden="true" />
                  {o.email ? "Change email" : "Add email"}
                </button>

                <button
                  type="button"
                  disabled={busy === o.ownerId}
                  onClick={() =>
                    call(
                      o.ownerId,
                      "PUT",
                      { ownerId: o.ownerId, houseId, revoked: !o.revoked },
                      o.revoked ? "Access restored." : "Access revoked."
                    )
                  }
                  className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35 disabled:opacity-40"
                >
                  {o.revoked ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                  {o.revoked ? "Restore" : "Revoke"}
                </button>
              </div>
            </div>

            {editing === o.ownerId && (
              <div className="mt-4 flex flex-wrap gap-2">
                <label htmlFor={`email-${o.ownerId}`} className="sr-only">
                  Email address for {o.name}
                </label>
                <input
                  id={`email-${o.ownerId}`}
                  type="email"
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy === o.ownerId || !draftEmail.includes("@")}
                  onClick={() =>
                    call(o.ownerId, "PATCH", { ownerId: o.ownerId, email: draftEmail }, "Email saved.")
                  }
                  className="flex min-h-[42px] items-center gap-2 rounded-lg bg-gold px-4 text-sm font-medium text-dark disabled:opacity-40"
                >
                  <Check size={14} aria-hidden="true" />
                  Save
                </button>
              </div>
            )}

            {note?.id === o.ownerId && (
              <p
                role="status"
                className={"mt-3 text-sm " + (note.ok ? "text-gold" : "text-red-300")}
              >
                {note.text}
              </p>
            )}
          </li>
        ))}
      </ul>

      {owners.length === 0 && (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-6 text-sm text-white/45">
          No owners linked to this house yet.
        </p>
      )}
    </section>
  );
}
