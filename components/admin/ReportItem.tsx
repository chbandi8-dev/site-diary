"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";


/**
 * One owner report, with the reply inline.
 *
 * Two outcomes, both of which send. "Nothing wrong" is a real answer and still
 * needs a sentence — a report that closes silently is worse than no system at
 * all, because the owner now knows their message went nowhere.
 */
export default function ReportItem({
  id, kind, status, body, photoUrl, ownerName, ownerEmail, createdAt, house,
}: {
  id: string;
  kind: string;
  status: string;
  body: string;
  photoUrl: string | null;
  ownerName: string;
  ownerEmail: string | null;
  createdAt: string;
  house: React.ReactNode;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [outcome, setOutcome] = useState<"resolved" | "no_action_needed" | "in_progress">("resolved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);

  async function open() {
    setReplying(true);
    // Opening it is reading it. The owner sees "read by your builder" straight
    // away, which is most of what a follow-up message is actually asking for.
    if (status === "submitted") {
      await fetch(`/api/pm/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledge: true }),
      }).catch(() => undefined);
      router.refresh();
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pm/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply, status: outcome }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't send.");
      setReplying(false);
      setReply("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border border-white/5 bg-dark-card p-5">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-medium text-white">{house}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-gold">{kind}</span>
        <span className={"font-mono text-[11px] tabular-nums " + (days >= 2 ? "text-gold" : "text-white/35")}>
          {days === 0 ? "today" : `${days}d ago`}
        </span>

      </div>

      <p className="leading-relaxed text-white/80">{body}</p>

      {photoUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photoUrl}
          alt={`Photo attached by ${ownerName}`}
          className="mt-3 max-h-80 w-auto rounded-lg border border-white/10"
        />
      )}

      <p className="mt-1.5 text-sm text-white/40">
        — {ownerName}
        {ownerEmail && <span className="text-white/25"> · {ownerEmail}</span>}
      </p>

      {!replying ? (
        <button
          type="button"
          onClick={open}
          className="mt-4 min-h-[44px] rounded-lg bg-gold px-5 font-medium text-dark"
        >
          Reply
        </button>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {error && <p className="text-sm text-danger">{error}</p>}

          <label htmlFor={`reply-${id}`} className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
            Your reply
          </label>
          <textarea
            id={`reply-${id}`}
            rows={3}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="That's the waterproofing membrane — it gets covered when the tiling starts next week."
            className="w-full rounded-lg border border-white/10 bg-dark px-4 py-3 leading-relaxed text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
          />

          <fieldset>
            <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
              Outcome
            </legend>
            <div className="flex flex-wrap gap-2">
              {[
                { v: "resolved", l: "Sorted" },
                { v: "in_progress", l: "Working on it" },
                { v: "no_action_needed", l: "Nothing wrong" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setOutcome(o.v as typeof outcome)}
                  className={
                    "min-h-[44px] rounded-full border px-4 text-sm " +
                    (outcome === o.v
                      ? "border-gold bg-gold/20 text-gold"
                      : "border-white/15 text-white/70")
                  }
                >
                  {o.l}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={send}
              disabled={busy || reply.trim().length === 0}
              className="min-h-[48px] rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send reply"}
            </button>
            <button
              type="button"
              onClick={() => setReplying(false)}
              className="min-h-[48px] px-4 text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
