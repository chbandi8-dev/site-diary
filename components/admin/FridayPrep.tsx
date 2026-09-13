"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mic } from "lucide-react";

type House = {
  id: string;
  address: string;
  suburb: string | null;
  waitingOn: string | null;
  underway: string[];
  thisWeek: { id: string; body: string; day: string }[];
  nextWeek: string | null;
  recipients: number;
};

/**
 * One card per house: what the owner will already have seen this week, and a
 * box for what happens next.
 *
 * Saves on blur rather than behind a button — he is working down a list of
 * twenty-five, and a save button per card is twenty-five extra taps for no
 * reason.
 */
export default function FridayPrep({ houses }: { houses: House[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(houses.map((h) => [h.id, h.nextWeek ?? ""]))
  );
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  async function save(houseId: string) {
    const value = drafts[houseId]?.trim() ?? "";
    const original = houses.find((h) => h.id === houseId)?.nextWeek ?? "";
    if (value === original) return;

    try {
      const res = await fetch(`/api/pm/houses/${houseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextWeek: value || null }),
      });
      if (!res.ok) throw new Error();
      setSaved((s) => ({ ...s, [houseId]: true }));
      router.refresh();
    } catch {
      setError("That didn't save — check your signal and try again.");
    }
  }

  return (
    <>
      {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}

      <ol className="flex flex-col gap-3">
        {houses.map((h) => (
          <li key={h.id} className="rounded-lg border border-white/5 bg-dark-card p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-medium text-white">{h.address}</span>
                {h.suburb && <span className="ml-2 text-sm text-white/35">{h.suburb}</span>}
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                {h.recipients === 0
                  ? "nobody signed up yet"
                  : `${h.recipients} will get this`}
              </span>
            </div>

            {/* What they have already seen, so he is not repeating himself. */}
            <div className="mb-4 rounded-lg bg-dark px-4 py-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-white/35">
                They saw this week
              </p>
              {h.thisWeek.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {h.thisWeek.map((u) => (
                    <li key={u.id} className="text-sm leading-relaxed text-white/60">
                      <span className="font-mono text-[11px] text-white/30">{u.day}</span>{" "}
                      {u.body}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-white/40">
                  Nothing posted this week.
                  {h.underway.length > 0 && ` Underway: ${h.underway.join(", ")}.`}
                  {h.waitingOn && ` Waiting on ${h.waitingOn}.`}
                </p>
              )}
            </div>

            <label
              htmlFor={`next-${h.id}`}
              className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45"
            >
              <Mic size={13} aria-hidden="true" />
              What&apos;s happening next week
              {saved[h.id] && (
                <span className="flex items-center gap-1 text-gold">
                  <Check size={12} aria-hidden="true" /> saved
                </span>
              )}
            </label>
            <textarea
              id={`next-${h.id}`}
              rows={3}
              value={drafts[h.id] ?? ""}
              onChange={(e) => {
                setDrafts((d) => ({ ...d, [h.id]: e.target.value }));
                setSaved((s) => ({ ...s, [h.id]: false }));
              }}
              onBlur={() => save(h.id)}
              placeholder="Brickies start Monday and should be done by Thursday. Windows are booked for Friday week."
              className="w-full rounded-lg border border-white/10 bg-dark px-4 py-3 leading-relaxed text-white placeholder:text-white/20 focus:border-gold focus:outline-none"
            />
          </li>
        ))}
      </ol>

      {houses.length === 0 && (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-8 text-center text-white/45">
          No active houses yet.
        </p>
      )}
    </>
  );
}
