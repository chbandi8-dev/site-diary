"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Send } from "lucide-react";

type House = { id: string; address: string; suburb: string | null; recipients: number };

/**
 * Write once, check who it reaches, then send.
 *
 * Two screens rather than one, because this is the only thing in the app that
 * talks to every client at once. The step between is not friction for its own
 * sake — it is the only place a typo in a message to twenty-five families can
 * still be caught.
 */
const SUGGESTIONS = [
  {
    label: "Christmas shutdown",
    body: "A quick note about the Christmas break: the site closes from Monday 22 December and everyone is back on Monday 12 January. Nothing will move on your build over that period. If anything urgent comes up, ring me — I'll have my phone.",
  },
  {
    label: "Back after the break",
    body: "We're back on site from today and picking up where we left off. I'll send you an update as soon as there's something worth showing you.",
  },
  {
    label: "Heat stand-down",
    body: "It's too hot to have anyone on the roof or in a roof space safely today, so the crews have been stood down. We'll be back on it as soon as the temperature drops.",
  },
  {
    label: "Wet week",
    body: "It's been too wet to get much done on site this week. I log every day we lose to weather, so you can see exactly where the time has gone on your build page.",
  },
];

export default function Broadcast() {
  const router = useRouter();
  const [houses, setHouses] = useState<House[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pm/broadcast")
      .then((r) => r.json())
      .then((data) => {
        setHouses(data.houses ?? []);
        // Everyone, by default. Deselecting a house is the rare case; this is
        // for the things that are true of the whole portfolio.
        setChosen(new Set((data.houses ?? []).map((h: House) => h.id)));
      })
      .catch(() => setError("Couldn't load your houses."));
  }, []);

  const selected = (houses ?? []).filter((h) => chosen.has(h.id));
  const people = selected.reduce((n, h) => n + h.recipients, 0);

  function toggle(id: string) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), houseIds: Array.from(chosen) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't send.");
      setResult(data.message);
      setBody("");
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't send.");
    } finally {
      setSending(false);
    }
  }

  if (houses === null) {
    return <p className="text-sm text-white/40">Loading your houses…</p>;
  }

  return (
    <div>
      {result && (
        <p role="status" className="mb-5 rounded-lg border border-gold/25 bg-gold/[0.06] px-5 py-4 text-sm text-gold">
          {result}
        </p>
      )}
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}

      <div className="mb-5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => { setBody(s.body); setConfirming(false); }}
            className="min-h-[40px] rounded-full border border-white/15 px-4 text-sm text-white/70 hover:border-white/35"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bc-body" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
          What to tell everyone
        </label>
        <textarea
          id="bc-body"
          rows={6}
          value={body}
          onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
          placeholder="Tap here and use the microphone on your keyboard, or type it."
          className="rounded-lg border border-white/10 bg-dark px-4 py-3 text-base leading-relaxed text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
        />
        <p className="text-xs text-white/30">
          Goes out as it is written — this one isn&apos;t rewritten for you, because it
          is the same words to everybody.
        </p>
      </div>

      <h2 className="mb-2 mt-8 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        Going to
      </h2>
      <ul className="mb-5 flex flex-col">
        {houses.map((h) => (
          <li key={h.id} className="border-t border-white/5">
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={chosen.has(h.id)}
                onChange={() => toggle(h.id)}
                className="h-4 w-4 flex-none accent-gold"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white/85">{h.address}</span>
                <span className="block truncate text-xs text-white/35">
                  {h.suburb}
                  {h.recipients === 0
                    ? " · nobody signed up for emails — it'll show on their page only"
                    : ` · ${h.recipients} owner${h.recipients === 1 ? "" : "s"}`}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!body.trim() || chosen.size === 0}
          className="flex min-h-[48px] items-center gap-2 rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
        >
          <Megaphone size={16} aria-hidden="true" />
          Read it back to me
        </button>
      ) : (
        <div className="rounded-lg border border-gold/30 bg-gold/[0.06] p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-gold">
            About to send to {chosen.size} house{chosen.size === 1 ? "" : "s"}
            {people > 0 && ` · ${people} email${people === 1 ? "" : "s"}`}
          </p>
          <p className="mt-3 whitespace-pre-wrap border-l-2 border-gold/40 pl-4 leading-relaxed text-white/85">
            {body}
          </p>
          <p className="mt-3 text-xs text-white/40">
            There is no undo on this one. It lands on {chosen.size} timeline
            {chosen.size === 1 ? "" : "s"} at once.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="flex min-h-[48px] items-center gap-2 rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? "Sending…" : "Send it"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-[48px] rounded-lg border border-white/15 px-5 text-sm text-white/70 hover:border-white/35"
            >
              Go back and change it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
