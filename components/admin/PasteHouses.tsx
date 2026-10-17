"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ClipboardPaste, Loader2, X } from "lucide-react";

/**
 * Paste the list he already keeps.
 *
 * He has twenty-odd houses in Notes, written the same way every time: an
 * address, Owner, Project status, Next week schedule. Typing them in one at a
 * time is why a new tool stays empty for a month. This reads that exact shape
 * for nothing, shows what it understood, and saves nothing until he taps.
 *
 * It does not use AI — see lib/paste-import.ts for why a parser is the safer
 * reader of a list of addresses.
 */

type Preview = {
  address: string;
  suburb: string | null;
  owners: { name: string; phone: string | null }[];
  status: string[];
  next: string[];
  plan: { stage: string; status: "complete" | "in_progress" | "scheduled" }[];
  unmatched: string[];
  duplicate: boolean;
};

const WORD = { complete: "Done", in_progress: "Underway", scheduled: "Booked" } as const;

export default function PasteHouses() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [done, setDone] = useState<{ created: { id: string; address: string }[]; skipped: string[] } | null>(null);

  function close() {
    setOpen(false);
    setPreview(null);
    setDone(null);
    setError(null);
    setText("");
  }

  async function call(commit: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/import-houses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, commit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      if (commit) {
        setDone(data);
        router.refresh();
      } else {
        setPreview(data.houses);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const toAdd = preview?.filter((p) => !p.duplicate).length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-white/45 underline underline-offset-4 hover:text-white"
      >
        <ClipboardPaste size={13} aria-hidden="true" />
        Paste a list
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Paste a list of houses"
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-dark-lighter sm:max-h-[86vh] sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="flex flex-none items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
              <div>
                <h2 className="font-display text-lg text-white">
                  {done ? "Done" : preview ? "Check before it's added" : "Paste a list of houses"}
                </h2>
                <p className="mt-0.5 text-xs text-white/40">
                  {done ? "You can close this" : preview ? "Nothing is saved yet" : "As many as you like, in one go"}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-white/45 hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {error && (
                <p
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/[0.07] px-4 py-3 text-sm leading-relaxed text-danger"
                >
                  <AlertCircle size={15} aria-hidden="true" className="mt-0.5 flex-none" />
                  {error}
                </p>
              )}

              {!preview && !done && (
                <>
                  <label htmlFor="paste-houses" className="sr-only">
                    Your list
                  </label>
                  <textarea
                    id="paste-houses"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={12}
                    placeholder={"12 Example Street, Parramatta\n\nOwner\nJane Smith\n\nProject status:\nRoof tiles done\n\nNext week schedule:\nGutters and downpipes"}
                    className="w-full resize-y rounded-xl border border-white/10 bg-dark p-4 text-[15px] leading-relaxed text-white placeholder:text-white/20 focus:border-gold focus:outline-none"
                  />
                  <p className="mt-2 text-xs leading-relaxed text-white/35">
                    Each house starts with its address. Put a mobile after a name if you have
                    it — <span className="text-white/55">Jane Smith 0412 345 678 &amp; Tom Smith 0498 765 432</span> —
                    and the WhatsApp button works straight away.
                  </p>
                </>
              )}

              {preview && !done && (
                <ul className="flex flex-col gap-3">
                  {preview.map((h) => (
                    <li
                      key={h.address}
                      className={
                        "rounded-xl border p-4 " +
                        (h.duplicate ? "border-white/[0.06] bg-dark/40" : "border-white/15 bg-dark")
                      }
                    >
                      <p className="font-medium text-white">
                        {h.address}
                        {h.suburb && <span className="font-normal text-white/45"> · {h.suburb}</span>}
                      </p>

                      {h.duplicate ? (
                        <p className="mt-1.5 text-sm text-white/50">
                          Already on your list — this one is skipped.
                        </p>
                      ) : (
                        <dl className="mt-2.5 flex flex-col gap-2 text-sm">
                          <div>
                            <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-white/30">Owners</dt>
                            <dd className="text-white/75">
                              {h.owners.length === 0
                                ? "None"
                                : h.owners.map((o) => (
                                    <span key={o.name} className="block">
                                      {o.name}
                                      {o.phone && <span className="text-white/45"> · {o.phone}</span>}
                                    </span>
                                  ))}
                            </dd>
                          </div>
                          {h.plan.length > 0 && (
                            <div>
                              <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-white/30">Stages</dt>
                              <dd className="text-white/75">
                                {h.plan.map((p) => `${p.stage.split(":")[0]} — ${WORD[p.status]}`).join("  ·  ")}
                              </dd>
                            </div>
                          )}
                          {h.next.length > 0 && (
                            <div>
                              <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-white/30">Next week</dt>
                              <dd className="text-white/75">{h.next.join(" · ")}</dd>
                            </div>
                          )}
                          {h.unmatched.length > 0 && (
                            <p className="text-xs leading-relaxed text-white/40">
                              Not tied to a stage (kept in the next-week note):{" "}
                              {h.unmatched.join(", ")}
                            </p>
                          )}
                        </dl>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {done && (
                <ul className="flex flex-col gap-2">
                  {done.created.map((c) => (
                    <li key={c.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-dark px-4 py-3 text-sm">
                      <Check size={15} aria-hidden="true" className="flex-none text-gold" />
                      <span className="min-w-0 flex-1 text-white/80">{c.address} added</span>
                      <Link
                        href={`/admin/houses/${c.id}`}
                        onClick={close}
                        className="text-xs text-gold underline underline-offset-4"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                  {done.skipped.map((s) => (
                    <li key={s} className="rounded-lg border border-white/[0.06] px-4 py-3 text-sm text-white/45">
                      {s} — skipped, already on your list
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer
              className="flex flex-none gap-3 border-t border-white/[0.07] px-5 py-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {done ? (
                <button type="button" onClick={close} className="min-h-[52px] flex-1 rounded-xl bg-gold text-[15px] font-semibold text-dark">
                  Close
                </button>
              ) : preview ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="min-h-[52px] rounded-xl border border-white/12 px-4 text-sm text-white/70"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => call(true)}
                    disabled={busy || toAdd === 0}
                    className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-[15px] font-semibold text-dark disabled:opacity-35"
                  >
                    {busy && <Loader2 size={17} className="animate-spin" />}
                    {toAdd === 1 ? "Add this house" : `Add these ${toAdd} houses`}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => call(false)}
                  disabled={busy || text.trim().length < 10}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-[15px] font-semibold text-dark disabled:opacity-35"
                >
                  {busy && <Loader2 size={17} className="animate-spin" />}
                  Check it
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
