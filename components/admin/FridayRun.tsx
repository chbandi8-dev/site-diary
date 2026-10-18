"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, MessageCircle, X } from "lucide-react";
import { toWhatsAppNumber } from "@/lib/phone";
import { sendOnWhatsApp } from "@/lib/whatsapp";

type RunHouse = {
  id: string;
  address: string;
  owners: { id: string; name: string; phone: string | null }[];
  message: string;
};

/**
 * Friday's WhatsApp messages, one house after another.
 *
 * Twenty-five houses is twenty-five times of finding the house, opening the
 * message, tapping an owner. Here the house is already in front of him with the
 * week written, so each one is: glance, tap a name, WhatsApp opens, come back,
 * Next. Where he got to is remembered for the week, so a call in the middle
 * costs him nothing.
 *
 * Houses with nobody on them are left out — there is no one to send to — and
 * the count says so.
 */
export default function FridayRun({
  houses,
  weekKey,
  onClose,
}: {
  houses: RunHouse[];
  weekKey: string;
  onClose: () => void;
}) {
  const key = `sd_friday_run_${weekKey}`;
  const queue = houses.filter((h) => h.owners.length > 0);
  const [i, setI] = useState(0);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});

  // Restored after mount: the server cannot know how far he got.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, boolean>;
      setSent(saved);
      const firstLeft = queue.findIndex((h) => !saved[h.id]);
      setI(firstLeft === -1 ? 0 : firstLeft);
    } catch {
      // Blocked storage: it just starts from the top.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function mark(id: string) {
    const next = { ...sent, [id]: true };
    setSent(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Not remembered, still sent.
    }
  }

  const done = i >= queue.length;
  const house = queue[i];
  const sentCount = queue.filter((h) => sent[h.id]).length;
  const text = house ? (edits[house.id] ?? house.message) : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-dark">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/45">
          {done ? "All done" : `House ${i + 1} of ${queue.length}`} · {sentCount} sent
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-2 text-white/55 hover:bg-white/5 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>
      <div className="h-1 bg-white/5" aria-hidden="true">
        <div
          className="h-1 bg-gold transition-all"
          style={{ width: `${queue.length ? (Math.min(i, queue.length) / queue.length) * 100 : 0}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {queue.length === 0 ? (
          <p className="text-white/55">
            No house has an owner on it yet, so there is nobody to send to. Add the owners first.
          </p>
        ) : done ? (
          <div className="mx-auto max-w-md text-center">
            <Check size={36} className="mx-auto text-gold" aria-hidden="true" />
            <p className="mt-4 font-display text-2xl text-white">
              {sentCount} of {queue.length} sent
            </p>
            <p className="mt-2 text-sm text-white/45">
              {houses.length - queue.length > 0 &&
                `${houses.length - queue.length} house${houses.length - queue.length === 1 ? " has" : "s have"} no owner on it yet, so ${houses.length - queue.length === 1 ? "it was" : "they were"} left out. `}
              Go back to anything you skipped with Back.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-xl">
            <h2 className="font-display text-2xl text-white">{house.address}</h2>
            <p className="mt-1 text-sm text-white/45">
              {house.owners.map((o) => o.name).join(" & ")}
              {sent[house.id] && <span className="ml-2 text-gold">· sent</span>}
            </p>

            <label
              htmlFor="run-text"
              className="mb-1.5 mt-5 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
            >
              What they&apos;ll read — edit anything
            </label>
            <textarea
              id="run-text"
              rows={11}
              value={text}
              onChange={(e) => setEdits((d) => ({ ...d, [house.id]: e.target.value }))}
              className="w-full resize-y rounded-lg border border-white/10 bg-dark-card px-4 py-3 text-sm leading-relaxed text-white/85 focus:border-gold focus:outline-none"
            />

            <div className="mt-4 flex flex-col gap-2">
              {house.owners.map((o) => {
                const hasNumber = Boolean(toWhatsAppNumber(o.phone));
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      mark(house.id);
                      void sendOnWhatsApp({
                        message: text,
                        phone: o.phone,
                        preferShareSheet: !hasNumber,
                      });
                    }}
                    className="flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-emerald-500/90 px-6 font-medium text-dark hover:bg-emerald-400"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    {hasNumber
                      ? `Send to ${o.name.split(" ")[0]} on WhatsApp`
                      : `Pick ${o.name.split(" ")[0]} in WhatsApp`}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            disabled={i === 0}
            onClick={() => setI((n) => Math.max(0, n - 1))}
            className="flex min-h-[48px] items-center gap-1 px-3 text-white/60 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft size={18} aria-hidden="true" />
            Back
          </button>
          {done ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-lg bg-gold px-6 font-medium text-dark"
            >
              Finish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setI((n) => n + 1)}
              className={
                "min-h-[48px] rounded-lg px-6 font-medium " +
                (sent[house.id]
                  ? "bg-gold text-dark"
                  : "border border-white/15 text-white/70 hover:border-white/35")
              }
            >
              {sent[house.id] ? "Next house →" : "Skip →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
