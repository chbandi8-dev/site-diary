"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

type Lot = {
  id: string;
  label: string;
  address: string;
  /** Status by phase name, rolled up from the stages in it. */
  phases: Record<string, string>;
  behindDays: number | null;
};

/**
 * The whole estate on one screen.
 *
 * A list sorted by what needs attention is right for twenty-five individual
 * clients and wrong for eighteen lots in a row: on estate work the question is
 * "where is the run up to", and that is a grid — lots down the side, phases
 * across. It is how volume builders have always tracked, on a whiteboard in the
 * site office, and it is the answer to the developer's weekly phone call.
 */
const TONE: Record<string, string> = {
  complete: "bg-gold/70",
  in_progress: "bg-gold/25 ring-1 ring-inset ring-gold",
  on_hold: "bg-orange-400/30",
  scheduled: "bg-white/[0.07]",
  not_started: "bg-white/[0.03]",
  not_applicable: "bg-transparent",
};

export default function EstateBoard({
  lots,
  phases,
  stageNames,
}: {
  lots: Lot[];
  phases: string[];
  /** Every stage name in this development, for the bulk action. */
  stageNames: string[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("complete");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const allSelected = chosen.size === lots.length && lots.length > 0;

  function toggle(id: string) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  }

  async function applyToSelected() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/pm/stages/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseIds: Array.from(chosen),
          stageName: stage,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      setNote(
        `${stage} set on ${data.changed} lot${data.changed === 1 ? "" : "s"}` +
          (data.skipped > 0 ? ` · ${data.skipped} already were` : "") +
          (data.missing > 0 ? ` · ${data.missing} don't have that stage` : "")
      );
      setChosen(new Set());
      router.refresh();
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const behind = useMemo(() => lots.filter((l) => (l.behindDays ?? 0) > 0).length, [lots]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          The board
          {behind > 0 && (
            <span className="ml-3 rounded-full bg-danger/15 px-2.5 py-1 text-[10px] text-danger">
              {behind} behind
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setChosen(allSelected ? new Set() : new Set(lots.map((l) => l.id)))}
          className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
        >
          {allSelected ? "Clear" : "Select all"}
        </button>
      </div>

      {/* The grid scrolls sideways rather than wrapping: a phase column that
          drops to the next line stops being a column, and the whole value here
          is reading down one. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-dark pb-2 pr-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                Lot
              </th>
              {phases.map((p) => (
                <th
                  key={p}
                  className="pb-2 pl-1 pr-1 text-center font-mono text-[9px] uppercase leading-tight tracking-[0.1em] text-white/30"
                >
                  {p.split(" ").slice(0, 2).join(" ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr key={lot.id} className="border-t border-white/5">
                <th className="sticky left-0 z-10 bg-dark py-2 pr-3 font-normal">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chosen.has(lot.id)}
                      onChange={() => toggle(lot.id)}
                      aria-label={`Select ${lot.label}`}
                      className="h-4 w-4 flex-none accent-gold"
                    />
                    <Link
                      href={`/admin/houses/${lot.id}`}
                      className="min-w-0 hover:text-gold"
                      title={lot.address}
                    >
                      <span className="block truncate text-sm text-white/85">{lot.label}</span>
                      {lot.behindDays !== null && lot.behindDays > 0 && (
                        <span className="block text-[10px] text-danger">
                          {lot.behindDays}d behind
                        </span>
                      )}
                    </Link>
                  </label>
                </th>

                {phases.map((p) => (
                  <td key={p} className="px-1 py-2">
                    <span
                      title={`${p}: ${(lot.phases[p] ?? "not_started").replace(/_/g, " ")}`}
                      className={
                        "block h-7 rounded " + (TONE[lot.phases[p] ?? "not_started"] ?? TONE.not_started)
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-white/35">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-gold/70" /> done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-gold/25 ring-1 ring-inset ring-gold" /> underway
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-orange-400/30" /> on hold
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-white/[0.07]" /> booked
        </span>
      </div>

      {/* The reason the board has checkboxes. A gang finishes six lots in a run;
          this is that, in one action. */}
      <div className="mt-6 rounded-lg border border-white/5 bg-dark-card p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
          Mark a stage across {chosen.size > 0 ? `${chosen.size} selected` : "several"} lots
        </p>

        {note && <p role="status" className="mb-3 text-sm text-gold">{note}</p>}

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label="Which stage"
            className="min-h-[44px] flex-1 rounded-lg border border-white/10 bg-dark px-3 text-sm text-white focus:border-gold focus:outline-none"
          >
            <option value="">Which stage…</option>
            {stageNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Set it to"
            className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 text-sm text-white focus:border-gold focus:outline-none"
          >
            <option value="complete">Done</option>
            <option value="in_progress">Underway</option>
            <option value="scheduled">Booked</option>
            <option value="on_hold">On hold</option>
            <option value="not_applicable">N/A</option>
          </select>

          <button
            type="button"
            onClick={applyToSelected}
            disabled={busy || chosen.size === 0 || !stage}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-gold px-5 text-sm font-medium text-dark disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Apply
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-white/30">
          Owners aren&apos;t emailed by this. Six milestone messages going out together,
          each written as a personal note about that family&apos;s house, is the opposite
          of what this is for — send those one at a time from each house.
        </p>
      </div>
    </section>
  );
}
