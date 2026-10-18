"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Plus, Trash2, XCircle } from "lucide-react";
import { INSPECTION_KINDS, inspectionName } from "@/lib/inspections";

type Item = {
  id: string;
  kind: string;
  label: string | null;
  status: string;
  bookedFor: string | null;
  notes: string | null;
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/**
 * The inspections on this house: which are booked, which have passed, which
 * failed and still need rebooking.
 *
 * Each row offers only the next thing that can happen to it — a booked one can
 * be passed or failed, a failed one can be rebooked — so the whole life of an
 * inspection is a couple of taps and nothing has to be remembered.
 */
export default function Inspections({ houseId, items }: { houseId: string; items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<string>("frame");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [booking, setBooking] = useState<string | null>(null);
  const [bookDate, setBookDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      router.refresh();
      return true;
    } catch {
      setError("That didn't save — check your signal and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const patch = (id: string, body: object) =>
    call(`/api/pm/inspections/${id}`, { method: "PATCH", body: JSON.stringify(body) });

  async function add() {
    const ok = await call("/api/pm/inspections", {
      method: "POST",
      body: JSON.stringify({
        houseId,
        kind,
        label: kind === "other" ? label : undefined,
        bookedFor: date || undefined,
      }),
    });
    if (ok) {
      setAdding(false);
      setLabel("");
      setDate("");
    }
  }

  async function book(id: string) {
    if (!bookDate) return;
    if (await patch(id, { status: "booked", bookedFor: bookDate })) {
      setBooking(null);
      setBookDate("");
    }
  }

  const btn =
    "min-h-[40px] rounded-lg border px-3 text-sm disabled:opacity-40 border-white/15 text-white/70 hover:border-white/35";

  return (
    <section className="mb-6 rounded-lg border border-white/5 bg-dark-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.13em] text-white/45">
          <ClipboardCheck size={13} aria-hidden="true" />
          Inspections
        </h2>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="flex min-h-[36px] items-center gap-1 text-sm text-gold hover:text-gold/80"
        >
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}

      {items.length === 0 && !adding && (
        <p className="text-sm leading-relaxed text-white/40">
          None yet. Add the ones this house needs — footings, frame, waterproofing, the final — and
          they will show up on your list when one is coming up or has failed.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.id} className="rounded-lg bg-dark px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-white">{inspectionName(i.kind, i.label)}</span>
              <span
                className={
                  "font-mono text-[10px] uppercase tracking-[0.12em] " +
                  (i.status === "failed"
                    ? "text-danger"
                    : i.status === "passed"
                      ? "text-emerald-300"
                      : i.status === "booked"
                        ? "text-gold"
                        : "text-white/40")
                }
              >
                {i.status === "to_book"
                  ? "To book"
                  : i.status === "booked"
                    ? `Booked${i.bookedFor ? ` · ${shortDate(i.bookedFor)}` : ""}`
                    : i.status === "passed"
                      ? "Passed"
                      : "Failed"}
              </span>
            </div>

            {i.status === "failed" && (
              <p className="mt-1 text-sm text-danger/90">
                Work is held until this passes — rebook it.
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap gap-2">
              {i.status === "booked" && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patch(i.id, { status: "passed" })}
                    className={btn + " flex items-center gap-1.5 !border-emerald-400/40 !text-emerald-300"}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" /> Passed
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patch(i.id, { status: "failed" })}
                    className={btn + " flex items-center gap-1.5"}
                  >
                    <XCircle size={14} aria-hidden="true" /> Failed
                  </button>
                </>
              )}
              {(i.status === "to_book" || i.status === "failed" || i.status === "booked") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBooking(booking === i.id ? null : i.id);
                    setBookDate("");
                  }}
                  className={btn}
                >
                  {i.status === "booked" ? "Change date" : i.status === "failed" ? "Rebook" : "Book it"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove ${inspectionName(i.kind, i.label)}`}
                onClick={() => {
                  if (window.confirm("Remove this inspection?")) {
                    void call(`/api/pm/inspections/${i.id}`, { method: "DELETE" });
                  }
                }}
                className={btn + " ml-auto text-white/35"}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>

            {booking === i.id && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor={`bk-${i.id}`} className="sr-only">
                  Inspection date
                </label>
                <input
                  id={`bk-${i.id}`}
                  type="date"
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                  className="min-h-[40px] rounded-lg border border-white/10 bg-dark-card px-3 text-sm text-white focus:border-gold focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !bookDate}
                  onClick={() => book(i.id)}
                  className="min-h-[40px] rounded-lg bg-gold px-4 text-sm font-medium text-dark disabled:opacity-40"
                >
                  Save booking
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-4 rounded-lg border border-white/10 p-4">
          <label
            htmlFor="insp-kind"
            className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
          >
            Which inspection
          </label>
          <select
            id="insp-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-white/10 bg-dark px-3 text-white focus:border-gold focus:outline-none"
          >
            {INSPECTION_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>

          {kind === "other" && (
            <input
              aria-label="What it's called"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Engineer's inspection"
              className="mt-2 min-h-[44px] w-full rounded-lg border border-white/10 bg-dark px-3 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
            />
          )}

          <label
            htmlFor="insp-date"
            className="mb-1.5 mt-3 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
          >
            Booked for — leave empty if not booked yet
          </label>
          <input
            id="insp-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-white/10 bg-dark px-3 text-white focus:border-gold focus:outline-none"
          />

          <button
            type="button"
            disabled={busy || (kind === "other" && !label.trim())}
            onClick={add}
            className="mt-4 min-h-[48px] w-full rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
          >
            Add inspection
          </button>
        </div>
      )}
    </section>
  );
}
