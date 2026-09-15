"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudRain, Copy, X } from "lucide-react";

type WetDay = {
  id: string;
  date: string;
  note: string | null;
  rainfallMm: number | null;
  claimed: boolean;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function short(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * One tap for today, because that is when it will actually get logged.
 *
 * The common ones are there for the same reason the message templates are: a
 * log he has to compose a sentence for is a log he fills in on the drive home,
 * if at all, and a wet-day record written weeks later is worth close to nothing
 * in an extension-of-time claim.
 */
const COMMON = [
  "Rained out — no work on site",
  "Too wet to pour",
  "Site too soft for machinery",
  "Trades sent home mid-morning",
  "Roof work stopped — wind and rain",
  "Drying out after rain",
];

export default function WetDays({ houseId, days }: { houseId: string; days: WetDay[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thisMonth = days.filter((d) => d.date.slice(0, 7) === today().slice(0, 7)).length;

  async function log() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, date, workLost: true, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't save.");
      setNote("");
      setDate(today());
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/pm/weather?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "That didn't delete.");
    router.refresh();
  }

  /**
   * The log as plain text, for pasting into an extension-of-time notice.
   *
   * Formatted the way a notice reads — date, then what was lost — so it goes
   * straight into the email he has to send anyway, rather than being retyped.
   */
  async function copyForNotice() {
    const lines = days.map(
      (d) =>
        `${new Date(d.date).toLocaleDateString("en-AU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })} — ${d.note ?? "Inclement weather, no work on site"}`
    );
    await navigator.clipboard.writeText(
      [`Days lost to inclement weather (${days.length} in total):`, "", ...lines].join("\n")
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Wet days
          {days.length > 0 && (
            <span className="ml-3 text-[11px] normal-case tracking-normal text-white/35">
              {days.length} logged{thisMonth > 0 && ` · ${thisMonth} this month`}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
        >
          {open ? "Cancel" : "Log a day"}
        </button>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}

      {open && (
        <div className="mb-4 rounded-lg border border-white/5 bg-dark-card p-5">
          <p className="mb-4 text-xs leading-relaxed text-white/35">
            Log the day work was actually lost, not every day it rained — that&apos;s the
            test the contract uses. Say what it stopped; a notice that names the lost
            activity is much harder to argue with.
          </p>

          <div className="mb-5 flex flex-wrap gap-2">
            {COMMON.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNote(c)}
                className={
                  "min-h-[38px] rounded-full border px-4 text-sm " +
                  (note === c
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-white/15 text-white/70 hover:border-white/35")
                }
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wd-n" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                What it stopped
              </label>
              <input
                id="wd-n"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Slab pour pushed to Thursday, site too soft for the pump"
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="wd-d" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Which day
              </label>
              <input
                id="wd-d"
                type="date"
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="self-start rounded-lg border border-white/10 bg-dark px-3 py-2.5 text-white focus:border-gold focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={log}
              disabled={busy || !date}
              className="min-h-[48px] self-start rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {busy ? "Saving…" : "Log it"}
            </button>
          </div>
        </div>
      )}

      {days.length > 0 ? (
        <>
          <ul className="flex flex-col">
            {days.map((d) => (
              <li key={d.id} className="flex items-start gap-3 border-t border-white/5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/80">{short(d.date)}</p>
                  <p className="mt-0.5 text-xs text-white/40">
                    {d.note ?? "No work on site"}
                    {d.claimed && <span className="text-gold"> · claimed in a notice</span>}
                  </p>
                </div>
                {!d.claimed && (
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    aria-label={`Remove ${short(d.date)}`}
                    className="flex-none rounded p-1.5 text-white/30 hover:bg-white/5 hover:text-white/70"
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={copyForNotice}
            className="mt-4 flex min-h-[42px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35"
          >
            <Copy size={13} aria-hidden="true" />
            {copied ? "Copied" : "Copy the log for a delay notice"}
          </button>
        </>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-white/5 bg-dark-card px-5 py-4 text-sm text-white/45">
          <CloudRain size={14} aria-hidden="true" />
          No days lost to weather on this house yet.
        </p>
      )}
    </section>
  );
}
