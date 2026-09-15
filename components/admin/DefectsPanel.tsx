"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, X } from "lucide-react";

type Defect = {
  id: string;
  reference: string | null;
  location: string | null;
  description: string;
  status: string;
  raisedByOwner: boolean;
  targetAt: string | null;
  resolvedAt: string | null;
};

const ROOMS = [
  "Kitchen", "Living", "Main bedroom", "Bed 2", "Bed 3",
  "Main bathroom", "Ensuite", "Laundry", "Hallway", "Garage",
  "External", "Roof", "Driveway",
];

const NEXT: Record<string, { label: string; to: string }> = {
  open: { label: "Start", to: "in_progress" },
  in_progress: { label: "Done", to: "resolved" },
  resolved: { label: "Reopen", to: "open" },
  disputed: { label: "Reopen", to: "open" },
};

export default function DefectsPanel({
  houseId,
  defects,
}: {
  houseId: string;
  defects: Defect[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [raisedByOwner, setRaisedByOwner] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstanding = defects.filter((d) => d.status !== "resolved").length;
  const done = defects.length - outstanding;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseId,
          location: location || undefined,
          description,
          raisedByOwner,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't save.");
      setDescription("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, status: string) {
    const res = await fetch("/api/pm/defects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) setError((await res.json()).error ?? "That didn't update.");
    router.refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/pm/defects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "That didn't delete.");
    router.refresh();
  }

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Defects
          {defects.length > 0 && (
            <span className="ml-3 text-[11px] normal-case tracking-normal text-white/35">
              {done} of {defects.length} done
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
        >
          {open ? "Done adding" : "Add items"}
        </button>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}

      {open && (
        <div className="mb-4 rounded-lg border border-white/5 bg-dark-card p-5">
          <p className="mb-4 text-xs leading-relaxed text-white/35">
            The box stays open so you can work down the list from the walk-through
            without reopening it each time.
          </p>

          <div className="mb-4 flex flex-wrap gap-2">
            {ROOMS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setLocation(r === location ? "" : r)}
                className={
                  "min-h-[36px] rounded-full border px-3.5 text-xs " +
                  (location === r
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-white/15 text-white/70 hover:border-white/35")
                }
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="df-d" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                What needs doing
              </label>
              <input
                id="df-d"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && description.trim() && !busy) add();
                }}
                placeholder="Scuff on the architrave beside the door"
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { value: true, label: "They pointed it out" },
                { value: false, label: "We found it" },
              ].map((o) => (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => setRaisedByOwner(o.value)}
                  className={
                    "min-h-[38px] rounded-full border px-4 text-sm " +
                    (raisedByOwner === o.value
                      ? "border-gold bg-gold/20 text-gold"
                      : "border-white/15 text-white/70 hover:border-white/35")
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={add}
              disabled={busy || !description.trim()}
              className="min-h-[48px] self-start rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add it"}
            </button>
          </div>
        </div>
      )}

      {defects.length > 0 ? (
        <ul className="flex flex-col">
          {defects.map((d) => (
            <li key={d.id} className="flex items-start gap-3 border-t border-white/5 py-3">
              <span className="mt-0.5 w-6 flex-none font-mono text-xs text-white/30">
                {d.reference}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    "text-sm " +
                    (d.status === "resolved" ? "text-white/40 line-through" : "text-white/85")
                  }
                >
                  {d.description}
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  {d.location && `${d.location} · `}
                  {d.raisedByOwner ? "they pointed it out" : "we found it"}
                  {d.status === "in_progress" && <span className="text-gold"> · underway</span>}
                  {d.status === "disputed" && " · disputed"}
                  {d.resolvedAt &&
                    ` · done ${new Date(d.resolvedAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}`}
                </p>
              </div>

              <div className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(d.id, NEXT[d.status].to)}
                  className="min-h-[36px] rounded-lg border border-white/15 px-3 text-xs text-white/70 hover:border-white/35"
                >
                  {NEXT[d.status].label}
                </button>
                {!d.raisedByOwner && d.status !== "resolved" && (
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    aria-label={`Remove item ${d.reference}`}
                    className="rounded p-1.5 text-white/30 hover:bg-white/5 hover:text-white/70"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-white/5 bg-dark-card px-5 py-4 text-sm text-white/45">
          <ClipboardCheck size={14} aria-hidden="true" />
          No defects listed on this house.
        </p>
      )}
    </section>
  );
}
