"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

type Template = {
  id: string;
  name: string;
  phase: string;
  position: number;
  typicalDays: number | null;
  isPaymentMilestone: boolean;
  houseCount: number;
};

/**
 * The list every new house starts from.
 *
 * Kept separate from any one house on purpose. Each house copies this list when
 * it is created — names and phases included — so editing here cannot rewrite
 * what a finished build showed its owner two years ago. The trade is that a
 * stage added here does not appear on the twenty-five houses already running;
 * those take it one at a time, if they need it at all.
 */
export default function StageTemplates({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("");
  const [after, setAfter] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const phases = Array.from(new Set(templates.map((t) => t.phase)));

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/stage-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phase: phase.trim() || phases[phases.length - 1] || "Outside & finishing",
          afterId: after || undefined,
          typicalDays: days ? Number(days) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't add.");
      setName("");
      setDays("");
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't add.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Template) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/pm/stage-templates?id=${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't delete.");
      setNote(
        data.keptOnExistingHouses > 0
          ? `${t.name} is off the standard list. The ${data.keptOnExistingHouses} house${
              data.keptOnExistingHouses === 1 ? "" : "s"
            } already using it keep it.`
          : `${t.name} is off the standard list.`
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-sm text-white/45">{templates.length} stages</p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-sm text-white/50 hover:text-white"
        >
          <Plus size={13} aria-hidden="true" />
          {open ? "Cancel" : "Add a stage"}
        </button>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {note && <p role="status" className="mb-3 text-sm text-gold">{note}</p>}

      {open && (
        <div className="mb-5 rounded-lg border border-white/10 bg-dark-card p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="t-name" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                What to call it
              </label>
              <input
                id="t-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pool and pool fencing"
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
              <p className="text-xs text-white/30">
                Tap the box and use your keyboard&apos;s microphone if you&apos;d rather say it.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="t-phase" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Which part of the build — this is what owners see
              </label>
              <select
                id="t-phase"
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white focus:border-gold focus:outline-none"
              >
                <option value="">Choose one</option>
                {phases.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="t-after" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Goes after
              </label>
              <select
                id="t-after"
                value={after}
                onChange={(e) => setAfter(e.target.value)}
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white focus:border-gold focus:outline-none"
              >
                <option value="">At the very end</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="t-days" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Typical working days — optional, used by the forecast
              </label>
              <input
                id="t-days"
                type="number"
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="10"
                className="self-start rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={add}
              disabled={busy || !name.trim()}
              className="min-h-[48px] self-start rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add to the standard list"}
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col">
        {templates.map((t, i) => (
          <li key={t.id} className="flex items-start gap-3 border-t border-white/5 py-2.5">
            <span className="mt-0.5 w-6 flex-none font-mono text-xs text-white/25">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/80">{t.name}</p>
              <p className="mt-0.5 text-xs text-white/35">
                {t.phase}
                {t.typicalDays ? ` · ${t.typicalDays} days` : ""}
                {t.isPaymentMilestone ? " · progress claim" : ""}
                {t.houseCount > 0 ? ` · on ${t.houseCount} house${t.houseCount === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(t)}
              disabled={busy}
              aria-label={`Remove ${t.name} from the standard list`}
              className="flex-none rounded p-1.5 text-white/25 hover:bg-white/5 hover:text-danger disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
