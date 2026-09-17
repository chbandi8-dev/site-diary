"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";

type Development = {
  id: string;
  name: string;
  client: string | null;
  release: string | null;
  houses: number;
};

export default function DevelopmentList({ developments }: { developments: Development[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", client: "", release: "", clientPhone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    "w-full rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none";

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/developments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          client: form.client.trim() || undefined,
          release: form.release.trim() || undefined,
          clientPhone: form.clientPhone.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't create that.");
      setForm({ name: "", client: "", release: "", clientPhone: "" });
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't create that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-sm text-white/45">
          {developments.length} {developments.length === 1 ? "development" : "developments"}
        </p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-sm text-white/50 hover:text-white"
        >
          <Plus size={14} aria-hidden="true" />
          {open ? "Cancel" : "New one"}
        </button>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}

      {open && (
        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-white/10 bg-dark-card p-5">
          <input
            aria-label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Riverbank Estate"
            className={field}
          />
          <input
            aria-label="Release or stage"
            value={form.release}
            onChange={(e) => setForm({ ...form, release: e.target.value })}
            placeholder="Stage 3 (optional)"
            className={field}
          />
          <input
            aria-label="Developer or agent"
            value={form.client}
            onChange={(e) => setForm({ ...form, client: e.target.value })}
            placeholder="Developer or agent"
            className={field}
          />
          <input
            aria-label="Their mobile"
            type="tel"
            inputMode="tel"
            value={form.clientPhone}
            onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
            placeholder="Their mobile"
            className={field}
          />
          <button
            type="button"
            onClick={create}
            disabled={busy || !form.name.trim()}
            className="min-h-[48px] self-start rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create it"}
          </button>
        </div>
      )}

      {developments.length > 0 ? (
        <ul className="flex flex-col">
          {developments.map((d) => (
            <li key={d.id} className="border-t border-white/5">
              <Link
                href={`/admin/developments/${d.id}`}
                className="flex items-center justify-between gap-4 py-4 transition-colors hover:text-gold"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-white">{d.name}</span>
                  <span className="mt-0.5 block truncate text-sm text-white/45">
                    {[d.release, d.client].filter(Boolean).join(" · ") || "No client set"}
                  </span>
                </span>
                <span className="flex-none font-mono text-xs tabular-nums text-white/35">
                  {d.houses} {d.houses === 1 ? "lot" : "lots"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-white/5 bg-dark-card px-5 py-5 text-sm leading-relaxed text-white/45">
          <Building2 size={15} aria-hidden="true" className="mt-0.5 flex-none" />
          None yet. Create one when you take on an estate — then move the lots into it and
          you get a board across all of them.
        </p>
      )}
    </div>
  );
}
