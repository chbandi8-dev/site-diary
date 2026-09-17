"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ContactRound, MessageCircle, Pencil, Plus } from "lucide-react";
import { whatsAppLink } from "@/lib/phone";

export type Trade = {
  id: string;
  name: string;
  company: string | null;
  trade: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

const EMPTY = { name: "", company: "", trade: "", phone: "", notes: "" };

/** The trades a residential PM actually has numbers for. */
const COMMON = [
  "Bricklayer", "Carpenter", "Concreter", "Electrician", "Plumber",
  "Roofer", "Waterproofer", "Plasterer", "Tiler", "Painter",
  "Cabinetmaker", "Landscaper", "Excavator", "Scaffolder", "Glazier",
];

type PickedContact = { name?: string[]; tel?: string[] };

export default function Trades({ trades }: { trades: Trade[] }) {
  const router = useRouter();
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canPick, setCanPick] = useState(false);

  useEffect(() => {
    // Chrome on Android only. iOS gives a web page no access to contacts at
    // all, so the button is hidden there rather than offered and broken.
    const nav = navigator as unknown as { contacts?: { select?: unknown } };
    setCanPick(typeof nav.contacts?.select === "function");
  }, []);

  async function pickFromContacts() {
    setError(null);
    try {
      const nav = navigator as unknown as {
        contacts: { select: (props: string[], opts: { multiple: boolean }) => Promise<PickedContact[]> };
      };
      const picked = await nav.contacts.select(["name", "tel"], { multiple: false });
      const one = picked[0];
      if (!one) return;
      setForm((f) => ({
        ...f,
        name: one.name?.[0] ?? f.name,
        phone: one.tel?.[0] ?? f.phone,
      }));
      setOpen(true);
    } catch {
      // Cancelled, or the browser refused. Typing still works.
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/trades", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing } : {}),
          name: form.name.trim(),
          company: form.company.trim() || undefined,
          trade: form.trade.trim(),
          phone: form.phone.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save that.");
      setForm(EMPTY);
      setEditing(null);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    await fetch(`/api/pm/trades?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    router.refresh();
  }

  const field =
    "w-full rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/45">
          {trades.length} {trades.length === 1 ? "trade" : "trades"}
        </p>
        <div className="flex items-center gap-4">
          {canPick && (
            <button
              type="button"
              onClick={pickFromContacts}
              className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white"
            >
              <ContactRound size={14} aria-hidden="true" />
              From contacts
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(!open);
              setEditing(null);
              setForm(EMPTY);
            }}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white"
          >
            <Plus size={14} aria-hidden="true" />
            {open ? "Cancel" : "Add"}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}

      {open && (
        <div className="mb-5 rounded-lg border border-white/10 bg-dark-card p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {COMMON.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, trade: form.trade === t ? "" : t })}
                className={
                  "min-h-[36px] rounded-full border px-3.5 text-xs " +
                  (form.trade === t
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-white/15 text-white/70 hover:border-white/35")
                }
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <input
              aria-label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name"
              className={field}
            />
            <input
              aria-label="What they do"
              value={form.trade}
              onChange={(e) => setForm({ ...form, trade: e.target.value })}
              placeholder="What they do — bricklayer, sparky…"
              className={field}
            />
            <input
              aria-label="Mobile"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0412 345 678"
              className={field}
            />
            <input
              aria-label="Company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="Company (optional)"
              className={field}
            />
            <input
              aria-label="Your note"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Your own note — never leaves this screen"
              className={field}
            />

            <button
              type="button"
              onClick={save}
              disabled={busy || !form.name.trim() || !form.trade.trim()}
              className="min-h-[48px] self-start rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Add them"}
            </button>
          </div>
        </div>
      )}

      {trades.length > 0 ? (
        <ul className="flex flex-col">
          {trades.map((t) => {
            const wa = whatsAppLink(t.phone, "");
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 border-t border-white/5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/85">
                    {t.name}
                    <span className="text-white/35"> · {t.trade}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-white/40">
                    {[t.company, t.phone, t.notes].filter(Boolean).join(" · ") || "No number"}
                  </p>
                </div>

                <div className="flex flex-none items-center gap-1">
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`WhatsApp ${t.name}`}
                      className="rounded-lg border border-emerald-400/40 p-2 text-emerald-300 hover:border-emerald-400"
                    >
                      <MessageCircle size={14} />
                    </a>
                  ) : (
                    <span
                      title="Add a mobile to use WhatsApp"
                      className="rounded-lg border border-white/10 p-2 text-white/20"
                    >
                      <MessageCircle size={14} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(t.id);
                      setOpen(true);
                      setForm({
                        name: t.name,
                        company: t.company ?? "",
                        trade: t.trade,
                        phone: t.phone ?? "",
                        notes: t.notes ?? "",
                      });
                    }}
                    aria-label={`Edit ${t.name}`}
                    className="rounded-lg p-2 text-white/30 hover:bg-white/5 hover:text-white/70"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => archive(t.id)}
                    aria-label={`Archive ${t.name}`}
                    className="rounded-lg p-2 text-white/25 hover:bg-white/5 hover:text-white/60"
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-6 text-sm leading-relaxed text-white/45">
          Nobody yet. Add the fifteen or so people you ring every week
          {canPick ? " — pull them straight from your contacts." : "."}
        </p>
      )}
    </div>
  );
}
