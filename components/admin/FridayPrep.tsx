"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Mic } from "lucide-react";
import { toWhatsAppNumber } from "@/lib/phone";
import { sendOnWhatsApp } from "@/lib/whatsapp";
import FridayRun from "./FridayRun";

type House = {
  id: string;
  address: string;
  suburb: string | null;
  waitingOn: string | null;
  underway: string[];
  thisWeek: { id: string; body: string; day: string }[];
  nextWeek: string | null;
  recipients: number;
  owners: { id: string; name: string; phone: string | null }[];
  /** The week's digest as it would be emailed. */
  message: string;
};

/**
 * One card per house: what the owner will already have seen this week, and a
 * box for what happens next.
 *
 * Saves on blur rather than behind a button — he is working down a list of
 * twenty-five, and a save button per card is twenty-five extra taps for no
 * reason.
 */
export default function FridayPrep({ houses, weekKey }: { houses: House[]; weekKey: string }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(houses.map((h) => [h.id, h.nextWeek ?? ""]))
  );
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [wa, setWa] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  /** His changes to a house's WhatsApp wording; absent means the generated text. */
  const [waEdits, setWaEdits] = useState<Record<string, string>>({});

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
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}

      {houses.some((h) => h.owners.length > 0) && (
        <button
          type="button"
          onClick={() => setRunning(true)}
          className="mb-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/90 px-6 font-medium text-dark hover:bg-emerald-400"
        >
          <MessageCircle size={16} aria-hidden="true" />
          Send this week on WhatsApp, house by house
        </button>
      )}
      {running && (
        <FridayRun
          houses={houses.map((h) => ({ id: h.id, address: h.address, owners: h.owners, message: h.message }))}
          weekKey={weekKey}
          onClose={() => setRunning(false)}
        />
      )}

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

            {/* The same digest the email carries, for when the email doesn't land
                or an owner would rather hear it on WhatsApp. Editable first. */}
            <button
              type="button"
              onClick={() => setWa(wa === h.id ? null : h.id)}
              className="mt-3 flex min-h-[40px] items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200"
            >
              <MessageCircle size={14} aria-hidden="true" />
              {wa === h.id ? "Hide the WhatsApp message" : "Send this week on WhatsApp"}
            </button>
            {wa === h.id && (
              <div className="mt-2 rounded-lg bg-dark px-4 py-3">
                <label
                  htmlFor={`wa-${h.id}`}
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
                >
                  What they&apos;ll read — edit anything
                </label>
                <textarea
                  id={`wa-${h.id}`}
                  rows={9}
                  value={waEdits[h.id] ?? h.message}
                  onChange={(e) => setWaEdits((w) => ({ ...w, [h.id]: e.target.value }))}
                  className="w-full resize-y rounded-lg border border-white/10 bg-dark-card px-3 py-2 text-sm leading-relaxed text-white/85 focus:border-gold focus:outline-none"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {h.owners.map((o) => {
                    const hasNumber = Boolean(toWhatsAppNumber(o.phone));
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() =>
                          sendOnWhatsApp({
                            message: waEdits[h.id] ?? h.message,
                            phone: o.phone,
                            preferShareSheet: !hasNumber,
                          })
                        }
                        title={hasNumber ? undefined : "No mobile on file — opens the share sheet so you can pick them"}
                        className={
                          "flex min-h-[44px] items-center gap-1.5 rounded-lg border px-4 text-sm " +
                          (hasNumber
                            ? "border-emerald-400/40 text-emerald-300 hover:border-emerald-400"
                            : "border-white/15 text-white/55 hover:border-white/35")
                        }
                      >
                        <MessageCircle size={14} aria-hidden="true" />
                        Send to {o.name.split(" ")[0]}
                      </button>
                    );
                  })}
                  {h.owners.length === 0 && (
                    <button
                      type="button"
                      onClick={() => sendOnWhatsApp({ message: waEdits[h.id] ?? h.message, preferShareSheet: true })}
                      className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35"
                    >
                      <MessageCircle size={14} aria-hidden="true" />
                      Choose who to send to
                    </button>
                  )}
                </div>
              </div>
            )}
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
