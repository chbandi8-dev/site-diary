"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Send, X } from "lucide-react";
import { money } from "@/lib/money";

type Variation = {
  id: string;
  reference: string;
  description: string;
  amountCents: number;
  status: string;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  decidedBy: string | null;
};

/**
 * Variations, raised on site.
 *
 * Two steps on purpose. Raising one is a scratchpad — he is often pricing it
 * while standing in the room. Sending it is the moment it becomes an offer, so
 * it is a separate deliberate tap, and after it nothing about the amount can be
 * edited.
 */
export default function VariationsPanel({
  houseId,
  variations,
}: {
  houseId: string;
  variations: Variation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstanding = variations.filter((v) => v.status === "sent");
  const approvedTotal = variations
    .filter((v) => v.status === "approved")
    .reduce((sum, v) => sum + v.amountCents, 0);

  async function call(init: RequestInit, query = "") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pm/variations${query}`, init);
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't work.");
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function raise() {
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      setError("That amount isn't a number.");
      return;
    }
    const ok = await call({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ houseId, description, amount: value }),
    });
    if (ok) {
      setOpen(false);
      setDescription("");
      setAmount("");
    }
  }

  const send = (id: string) =>
    call({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

  const discard = (id: string) =>
    call({ method: "DELETE" }, `?id=${encodeURIComponent(id)}`);

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Variations
          {outstanding.length > 0 && (
            <span className="ml-3 rounded-full bg-gold/15 px-2.5 py-1 text-[10px] text-gold">
              {outstanding.length} awaiting them
            </span>
          )}
          {approvedTotal !== 0 && (
            <span className="ml-2 text-[11px] normal-case tracking-normal text-white/35">
              {money(approvedTotal)} approved
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
        >
          {open ? "Cancel" : "Raise one"}
        </button>
      </div>

      {open && (
        <div className="mb-4 rounded-lg border border-white/5 bg-dark-card p-5">
          {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="var-d" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                What changed — they read this word for word
              </label>
              <textarea
                id="var-d"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Extra double power point and data point to the study, as asked for on site."
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="var-a" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Amount — a credit goes in as a negative
              </label>
              <input
                id="var-a"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="450"
                className="self-start rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
            </div>

            <p className="text-xs leading-relaxed text-white/35">
              Saving it doesn&apos;t send it. You get a chance to read it back before the
              owner sees anything, and once it&apos;s sent the amount is locked.
            </p>

            <button
              type="button"
              onClick={raise}
              disabled={busy || !description.trim() || amount.trim() === ""}
              className="min-h-[48px] self-start rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save as draft"}
            </button>
          </div>
        </div>
      )}

      {error && !open && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}

      {variations.length > 0 ? (
        <ul className="flex flex-col">
          {variations.map((v) => (
            <li key={v.id} className="flex items-start gap-3 border-t border-white/5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/80">
                  <span className="font-mono text-xs text-white/40">{v.reference}</span>{" "}
                  {v.description}
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  {money(v.amountCents)}
                  {v.status === "draft" && " · draft, not sent"}
                  {v.status === "sent" && " · waiting on them"}
                  {v.status === "approved" && (
                    <span className="text-gold">
                      {" "}
                      · approved{v.decidedBy && ` by ${v.decidedBy}`}
                      {v.approvedAt &&
                        ` on ${new Date(v.approvedAt).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                        })}`}
                    </span>
                  )}
                  {v.status === "declined" && (
                    <span>
                      {" "}
                      · declined{v.decidedBy && ` by ${v.decidedBy}`}
                      {v.declineReason && `: ${v.declineReason}`}
                    </span>
                  )}
                </p>
              </div>

              {v.status === "draft" && (
                <div className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    onClick={() => send(v.id)}
                    disabled={busy}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gold/40 px-3 text-xs text-gold disabled:opacity-40"
                  >
                    <Send size={12} aria-hidden="true" />
                    Send
                  </button>
                  <button
                    type="button"
                    onClick={() => discard(v.id)}
                    disabled={busy}
                    aria-label={`Discard ${v.reference}`}
                    className="rounded p-1.5 text-white/30 hover:bg-white/5 hover:text-white/70"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-white/5 bg-dark-card px-5 py-4 text-sm text-white/45">
          <FileText size={14} aria-hidden="true" />
          Nothing extra on this house yet.
        </p>
      )}
    </section>
  );
}
