"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/money";

type Variation = {
  id: string;
  reference: string;
  description: string;
  amountCents: number;
  status: string;
  sentAt: Date | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  decidedBy: string | null;
};

function day(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The one place on this page that costs money.
 *
 * Treated differently from everything else on purpose: nothing is a single tap,
 * the amount is never buried in a paragraph, and the decision takes a code sent
 * to the owner's own inbox. The friction is the feature — an owner who feels
 * they agreed to something by accident is a dispute, and a dispute costs both
 * of them far more than the extra fifteen seconds.
 */
export default function Variations({
  variations,
  canDecide,
}: {
  variations: Variation[];
  canDecide: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [intent, setIntent] = useState<"approve" | "decline">("approve");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (variations.length === 0) return null;

  const open = variations.filter((v) => v.status === "sent");
  const settled = variations.filter((v) => v.status !== "sent");

  function begin(id: string, decision: "approve" | "decline") {
    setActive(id);
    setIntent(decision);
    setCode("");
    setReason("");
    setSentTo(null);
    setError(null);
  }

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/owner/variations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "That didn't work.");
    return data;
  }

  async function requestCode(id: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await post({ action: "code", variationId: id });
      setSentTo(data.sentTo ?? "your email");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(id: string) {
    setBusy(true);
    setError(null);
    try {
      await post({
        action: "decide",
        variationId: id,
        code,
        decision: intent,
        reason: intent === "decline" && reason.trim() ? reason.trim() : undefined,
      });
      setActive(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      {open.length > 0 && (
        <>
          <h2 className="mb-1 font-display text-2xl tracking-tight">
            {open.length === 1 ? "A variation to approve" : "Variations to approve"}
          </h2>
          <p className="mb-4 max-w-prose text-[15px] leading-relaxed text-text/65">
            Extra work costs extra, so nothing here goes ahead until you say so. Nothing is
            charged while it sits here.
          </p>

          <ul className="flex flex-col gap-4">
            {open.map((v) => (
              <li
                key={v.id}
                className="border-l-[3px] border-accent-primary bg-white p-5 shadow-[0_1px_2px_rgba(28,27,25,.05)]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-text/45">
                    {v.reference}
                  </h3>
                  <p className="font-display text-2xl tracking-tight">{money(v.amountCents)}</p>
                </div>

                <p className="mt-2 max-w-prose leading-relaxed">{v.description}</p>

                {v.sentAt && (
                  <p className="mt-2 text-sm text-text/50">Sent to you on {day(v.sentAt)}.</p>
                )}

                {!canDecide ? (
                  <p className="mt-4 text-sm text-text/55">
                    Add your name and email below. We send a short code there to confirm it&apos;s
                    really you before anything is agreed.
                  </p>
                ) : active !== v.id ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => begin(v.id, "approve")}
                      className="min-h-[48px] bg-text px-6 text-[15px] text-white transition-opacity hover:opacity-90"
                    >
                      Approve {money(v.amountCents)}
                    </button>
                    <button
                      type="button"
                      onClick={() => begin(v.id, "decline")}
                      className="min-h-[48px] border border-text/20 px-6 text-[15px] transition-colors hover:border-text/50"
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 border-t border-text/10 pt-5">
                    <p className="text-[15px] font-medium">
                      {intent === "approve"
                        ? `Approving ${money(v.amountCents)}`
                        : "Declining this variation"}
                    </p>

                    {error && (
                      <p role="alert" className="mt-3 text-sm text-accent-primary">
                        {error}
                      </p>
                    )}

                    {intent === "decline" && (
                      <div className="mt-4 flex flex-col gap-1.5">
                        <label htmlFor={`why-${v.id}`} className="text-sm text-text/60">
                          Anything you want to say about why (optional)
                        </label>
                        <textarea
                          id={`why-${v.id}`}
                          rows={2}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="border border-text/20 px-3 py-2 text-[15px] focus:border-accent-primary focus:outline-none"
                        />
                      </div>
                    )}

                    {!sentTo ? (
                      <div className="mt-4">
                        <p className="max-w-prose text-sm leading-relaxed text-text/60">
                          We&apos;ll email you a six-digit code. Typing it back is what puts your
                          name on this decision.
                        </p>
                        <button
                          type="button"
                          onClick={() => requestCode(v.id)}
                          disabled={busy}
                          className="mt-3 min-h-[48px] bg-text px-6 text-[15px] text-white disabled:opacity-40"
                        >
                          {busy ? "Sending…" : "Email me the code"}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <p className="text-sm text-text/60">
                          Code sent to <span className="font-medium text-text">{sentTo}</span>. It
                          expires in 15 minutes.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <input
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                            placeholder="000000"
                            aria-label="Six-digit code"
                            className="w-36 border border-text/20 px-3 py-2.5 font-mono text-xl tracking-[0.3em] focus:border-accent-primary focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => confirm(v.id)}
                            disabled={busy || code.length !== 6}
                            className="min-h-[48px] bg-text px-6 text-[15px] text-white disabled:opacity-40"
                          >
                            {busy
                              ? "Confirming…"
                              : intent === "approve"
                                ? "Confirm approval"
                                : "Confirm decline"}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => requestCode(v.id)}
                          disabled={busy}
                          className="mt-3 text-sm text-text/50 underline underline-offset-4 hover:text-text"
                        >
                          Send it again
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setActive(null)}
                      className="mt-4 block text-sm text-text/50 underline underline-offset-4 hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {settled.length > 0 && (
        <div className={open.length > 0 ? "mt-8" : ""}>
          <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-text/45">
            Already decided
          </h3>
          <ul className="flex flex-col">
            {settled.map((v) => (
              <li key={v.id} className="border-t border-text/10 py-3">
                <p className="text-[15px]">
                  <span className="font-mono text-xs text-text/45">{v.reference}</span>{" "}
                  {v.description}
                </p>
                <p className="mt-0.5 text-sm text-text/55">
                  {money(v.amountCents)} ·{" "}
                  {v.status === "approved"
                    ? `approved${v.decidedBy ? ` by ${v.decidedBy}` : ""}${
                        v.approvedAt ? ` on ${day(v.approvedAt)}` : ""
                      }`
                    : `declined${v.decidedBy ? ` by ${v.decidedBy}` : ""}${
                        v.declinedAt ? ` on ${day(v.declinedAt)}` : ""
                      }`}
                  {v.declineReason && ` — ${v.declineReason}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
