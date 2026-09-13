"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const WAITING_OPTIONS = [
  "the window delivery", "the frame delivery", "the roof tiles", "your tile selection",
  "your colour selections", "the kitchen cabinetry", "the stone benchtops",
  "the certifier's sign-off", "council approval", "the engineer's inspection",
  "the occupation certificate", "a service connection", "dry weather",
];

/**
 * The line at the top of the owner's page.
 *
 * "Waiting on the window delivery, expected Thursday" is the cheapest sentence
 * in the product and the answer to most of the calls he gets — an owner who
 * can't tell "on track" from "gone wrong" rings him. It is also the thing that
 * goes stale fastest, so setting it has to be two taps.
 */
export default function HouseStatus({
  houseId,
  waitingOn,
  waitingOnEta,
  handoverFrom,
  handoverTo,
}: {
  houseId: string;
  waitingOn: string | null;
  waitingOnEta: string | null;
  handoverFrom: string | null;
  handoverTo: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [what, setWhat] = useState(waitingOn ?? "");
  const [eta, setEta] = useState(waitingOnEta?.slice(0, 10) ?? "");
  const [from, setFrom] = useState(handoverFrom?.slice(0, 10) ?? "");
  const [to, setTo] = useState(handoverTo?.slice(0, 10) ?? "");
  const [reason, setReason] = useState("");

  const handoverMoved =
    (from || null) !== (handoverFrom?.slice(0, 10) ?? null) ||
    (to || null) !== (handoverTo?.slice(0, 10) ?? null);

  async function save() {
    setBusy(true);
    try {
      await fetch(`/api/pm/houses/${houseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waitingOn: what || null,
          waitingOnEta: eta || null,
          handoverFrom: from || null,
          handoverTo: to || null,
          handoverReason: reason || undefined,
        }),
      });
      setEditing(false);
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <section className="mt-8 rounded-lg border border-white/5 bg-dark-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-white/40">
              Owners currently see
            </p>
            <p className="mt-1.5 text-white/80">
              {waitingOn
                ? `Waiting on ${waitingOn}${eta ? `, expected ${new Date(eta).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}` : ""}`
                : "Nothing flagged as holding it up"}
            </p>
            <p className="mt-1 text-sm text-white/40">
              Handover:{" "}
              {handoverFrom || handoverTo
                ? `${handoverFrom ? new Date(handoverFrom).toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "?"} – ${handoverTo ? new Date(handoverTo).toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "?"}`
                : "not set"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-[42px] rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35"
          >
            Change
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-white/5 bg-dark-card p-5">
      <fieldset className="mb-5">
        <legend className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
          Waiting on
        </legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWhat("")}
            className={
              "min-h-[42px] rounded-full border px-4 text-sm " +
              (what === "" ? "border-gold bg-gold/20 text-gold" : "border-white/15 text-white/70")
            }
          >
            Nothing
          </button>
          {WAITING_OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setWhat(o)}
              className={
                "min-h-[42px] rounded-full border px-4 text-sm " +
                (what === o ? "border-gold bg-gold/20 text-gold" : "border-white/15 text-white/70")
              }
            >
              {o}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { id: "eta", label: "Expected", value: eta, set: setEta },
          { id: "from", label: "Handover from", value: from, set: setFrom },
          { id: "to", label: "Handover to", value: to, set: setTo },
        ].map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <label htmlFor={f.id} className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
              {f.label}
            </label>
            <input
              id={f.id}
              type="date"
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="rounded-lg border border-white/10 bg-dark px-3 py-2.5 text-white focus:border-gold focus:outline-none"
            />
          </div>
        ))}
      </div>

      {handoverMoved && (
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="reason" className="font-mono text-[11px] uppercase tracking-[0.12em] text-gold">
            Why has handover moved? Owners see this
          </label>
          <input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nine wet days in June, and the window supplier ran late"
            className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
          />
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="min-h-[46px] rounded-lg bg-gold px-5 font-medium text-dark disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="min-h-[46px] px-4 text-white/50 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
