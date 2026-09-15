"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, X } from "lucide-react";

type Decision = {
  id: string;
  question: string;
  dueDate: string | null;
  status: string;
  askedAt: string;
  answeredAt: string | null;
  answer: string | null;
};

/**
 * Asking the owner for something, on the record.
 *
 * The common selections are one tap, because the whole value of this is that
 * he actually uses it instead of asking on the phone — a decision asked by
 * phone leaves no trace, and it is the trace that settles the argument about
 * who held the build up.
 */
const COMMON = [
  { q: "Bathroom tile selection", c: "Fixing stage can't start until these are chosen." },
  { q: "Kitchen tile selection", c: "Tiling can't be booked until these are chosen." },
  { q: "Tapware selection", c: "Fit-off waits on this." },
  { q: "Paint colours", c: "Painting can't be booked until these are locked in." },
  { q: "External colours", c: "Render and roof can't proceed without these." },
  { q: "Flooring selection", c: "Flooring install waits on this." },
  { q: "Benchtop stone", c: "Stone takes about two weeks to fabricate once chosen." },
  { q: "Electrical points and lighting", c: "Rough-in can't be signed off until this is set." },
];

export default function DecisionsPanel({
  houseId,
  decisions,
}: {
  houseId: string;
  decisions: Decision[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [consequence, setConsequence] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waiting = decisions.filter((d) => d.status === "open");

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseId,
          question,
          consequence: consequence || undefined,
          dueDate: dueDate || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't send.");
      setOpen(false);
      setQuestion("");
      setConsequence("");
      setDueDate("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't send.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    await fetch(`/api/pm/decisions?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Waiting on them
          {waiting.length > 0 && (
            <span className="ml-3 rounded-full bg-gold/15 px-2.5 py-1 text-[10px] text-gold">
              {waiting.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
        >
          {open ? "Cancel" : "Ask for something"}
        </button>
      </div>

      {open && (
        <div className="mb-4 rounded-lg border border-white/5 bg-dark-card p-5">
          {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}

          <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
            Common ones
          </p>
          <div className="mb-5 flex flex-wrap gap-2">
            {COMMON.map((c) => (
              <button
                key={c.q}
                type="button"
                onClick={() => { setQuestion(c.q); setConsequence(c.c); }}
                className={
                  "min-h-[42px] rounded-full border px-4 text-sm " +
                  (question === c.q
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-white/15 text-white/70 hover:border-white/35")
                }
              >
                {c.q}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dec-q" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                What you need
              </label>
              <input
                id="dec-q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Bathroom tile selection"
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="dec-c" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                What happens if it&apos;s late — they see this
              </label>
              <input
                id="dec-c"
                value={consequence}
                onChange={(e) => setConsequence(e.target.value)}
                placeholder="Fixing stage can't start until these are chosen."
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="dec-d" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Needed by
              </label>
              <input
                id="dec-d"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="self-start rounded-lg border border-white/10 bg-dark px-3 py-2.5 text-white focus:border-gold focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={ask}
              disabled={busy || !question.trim()}
              className="min-h-[48px] self-start rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {busy ? "Sending…" : "Ask them"}
            </button>
          </div>
        </div>
      )}

      {decisions.length > 0 ? (
        <ul className="flex flex-col">
          {decisions.map((d) => {
            const overdue =
              d.status === "open" && d.dueDate && new Date(d.dueDate).getTime() < Date.now();
            return (
              <li key={d.id} className="flex items-start gap-3 border-t border-white/5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/80">{d.question}</p>
                  <p className="mt-0.5 text-xs text-white/40">
                    Asked{" "}
                    {new Date(d.askedAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}
                    {d.answeredAt ? (
                      <span className="text-gold">
                        {" "}
                        · answered{" "}
                        {new Date(d.answeredAt).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                        })}
                        {d.answer && `: ${d.answer}`}
                      </span>
                    ) : (
                      <span className={overdue ? "text-gold" : ""}>
                        {" "}
                        · still waiting
                        {d.dueDate &&
                          ` (due ${new Date(d.dueDate).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                          })})`}
                      </span>
                    )}
                  </p>
                </div>
                {d.status === "open" && (
                  <button
                    type="button"
                    onClick={() => withdraw(d.id)}
                    aria-label="No longer needed"
                    className="flex-none rounded p-1.5 text-white/30 hover:bg-white/5 hover:text-white/70"
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-white/5 bg-dark-card px-5 py-4 text-sm text-white/45">
          <Clock size={14} aria-hidden="true" />
          Nothing outstanding from them.
        </p>
      )}
    </section>
  );
}
