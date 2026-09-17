"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";

type InDev = { id: string; address: string; lotNumber: string | null };
type Available = { id: string; address: string; suburb: string | null };

/**
 * Moving houses into an estate, and numbering them.
 *
 * The lot number is the point. On estate work he thinks in lots for months
 * before council allocates a street number, and the board only reads correctly
 * when it is ordered the way the run was actually built.
 */
export default function AssignHouses({
  developmentId,
  inDevelopment,
  available,
}: {
  developmentId: string;
  inDevelopment: InDev[];
  available: Available[];
}) {
  const router = useRouter();
  const [lots, setLots] = useState<Record<string, string>>(
    Object.fromEntries(inDevelopment.map((h) => [h.id, h.lotNumber ?? ""]))
  );
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function send(houses: { id: string; lotNumber?: string }[], target: string | null) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/pm/developments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developmentId: target, houses }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't work.");
      setAdding(new Set());
      router.refresh();
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        Lots in this development
      </h2>

      {note && <p role="alert" className="mb-3 text-sm text-red-300">{note}</p>}

      {inDevelopment.length > 0 && (
        <>
          <ul className="mb-3 flex flex-col">
            {inDevelopment.map((h) => (
              <li key={h.id} className="flex items-center gap-3 border-t border-white/5 py-2.5">
                <input
                  value={lots[h.id] ?? ""}
                  onChange={(e) => setLots({ ...lots, [h.id]: e.target.value })}
                  placeholder="Lot"
                  aria-label={`Lot number for ${h.address}`}
                  className="w-20 flex-none rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-white/70">{h.address}</span>
                <button
                  type="button"
                  onClick={() => send([{ id: h.id }], null)}
                  disabled={busy}
                  aria-label={`Remove ${h.address} from this development`}
                  className="flex-none rounded p-1.5 text-white/25 hover:bg-white/5 hover:text-white/60 disabled:opacity-40"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() =>
              send(
                inDevelopment.map((h) => ({ id: h.id, lotNumber: lots[h.id]?.trim() || undefined })),
                developmentId
              )
            }
            disabled={busy}
            className="mb-8 flex min-h-[44px] items-center gap-2 rounded-lg bg-gold px-5 text-sm font-medium text-dark disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save lot numbers
          </button>
        </>
      )}

      {available.length > 0 && (
        <>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
            Move a house in
          </h3>
          <ul className="flex flex-col">
            {available.map((h) => (
              <li key={h.id} className="flex items-center gap-3 border-t border-white/5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-white/70">
                  {h.address}
                  {h.suburb && <span className="text-white/35"> · {h.suburb}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => send([{ id: h.id }], developmentId)}
                  disabled={busy || adding.has(h.id)}
                  className="flex min-h-[36px] flex-none items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-white/70 hover:border-white/35 disabled:opacity-40"
                >
                  <Plus size={12} aria-hidden="true" />
                  Add
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
