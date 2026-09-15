"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Decision = {
  id: string;
  question: string;
  detail: string | null;
  options: string[];
  dueDate: Date | null;
  consequence: string | null;
  status: string;
  answer: string | null;
  answeredAt: Date | null;
};

function day(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Choices the builder is waiting on.
 *
 * Placed above the timeline because it is the one thing on the page that asks
 * something of them rather than telling them something. An owner who misses a
 * tile selection holds up their own fixing stage and then, quite genuinely,
 * does not remember being asked.
 */
export default function Decisions({
  decisions,
  canAnswer,
}: {
  decisions: Decision[];
  canAnswer: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const open = decisions.filter((d) => d.status === "open");
  const answered = decisions.filter((d) => d.status === "answered");

  if (decisions.length === 0) return null;

  async function answer(decisionId: string, value: string) {
    if (!value.trim()) return;
    setBusy(decisionId);
    setError(null);
    try {
      const res = await fetch("/api/owner/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, answer: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't save.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-10">
      {open.length > 0 && (
        <>
          <h2 className="mb-4 font-display text-2xl tracking-tight">
            {open.length === 1 ? "We need a decision from you" : "We need some decisions from you"}
          </h2>

          {error && (
            <p role="alert" className="mb-4 border-l-[3px] border-accent-primary bg-surface/60 px-4 py-3 text-sm">
              {error}
            </p>
          )}

          <ul className="flex flex-col gap-4">
            {open.map((d) => {
              const overdue = d.dueDate && d.dueDate.getTime() < Date.now();
              return (
                <li
                  key={d.id}
                  className="border-l-[3px] border-accent-primary bg-white p-5 shadow-[0_1px_2px_rgba(28,27,25,.05)]"
                >
                  <h3 className="font-display text-lg leading-snug tracking-tight">{d.question}</h3>
                  {d.detail && (
                    <p className="mt-1.5 max-w-prose leading-relaxed text-text/70">{d.detail}</p>
                  )}

                  {d.dueDate && (
                    <p className={"mt-3 text-sm " + (overdue ? "font-medium text-accent-primary" : "text-text/60")}>
                      {overdue ? "This was needed by " : "We need this by "}
                      {day(d.dueDate)}.
                      {d.consequence && <span className="block mt-1">{d.consequence}</span>}
                    </p>
                  )}

                  {!canAnswer ? (
                    <p className="mt-4 text-sm text-text/55">
                      Add your name and email below and you&apos;ll be able to answer here.
                    </p>
                  ) : d.options.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {d.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          disabled={busy === d.id}
                          onClick={() => answer(d.id, option)}
                          className="min-h-[46px] border border-text/20 px-5 text-[15px] transition-colors hover:border-accent-primary hover:bg-accent-primary/5 disabled:opacity-40"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <label htmlFor={`answer-${d.id}`} className="sr-only">
                        Your answer
                      </label>
                      <input
                        id={`answer-${d.id}`}
                        value={drafts[d.id] ?? ""}
                        onChange={(e) => setDrafts((s) => ({ ...s, [d.id]: e.target.value }))}
                        placeholder="Your answer"
                        className="flex-1 border border-text/15 bg-white px-4 py-3 focus:border-accent-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={busy === d.id || !(drafts[d.id] ?? "").trim()}
                        onClick={() => answer(d.id, drafts[d.id] ?? "")}
                        className="min-h-[48px] bg-accent-primary px-6 font-medium text-white disabled:opacity-50"
                      >
                        {busy === d.id ? "Saving…" : "Send"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {answered.length > 0 && (
        <div className={open.length > 0 ? "mt-8" : ""}>
          <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-text/45">
            Already decided
          </h3>
          <ul className="flex flex-col gap-2">
            {answered.map((d) => (
              <li key={d.id} className="border-t border-text/10 py-3">
                <p className="text-[15px] leading-snug">{d.question}</p>
                <p className="mt-1 text-sm text-text/60">
                  <strong className="font-semibold text-text">{d.answer}</strong>
                  {d.answeredAt && (
                    <span>
                      {" "}
                      — {d.answeredAt.toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
