"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle, Check, Eye, Loader2, Lock, Mic, Square, Wand2, X,
} from "lucide-react";
import { useDictation } from "./useDictation";
import type { ActionPayload, ProposedAction } from "@/lib/assistant-actions";

/**
 * Say it once, check it, done.
 *
 * The app had grown to fourteen panels across six screens, every one of them
 * correct and every one of them a tap he does not have standing in a driveway
 * at four o'clock. What he actually does is talk — to the brickie, to the
 * owner, to himself in the ute on the way to the next lot. This is that,
 * pointed at the database:
 *
 *   "Lot 114, frame's done, roof starts Tuesday. Private note — brickie still
 *    owes me two days. Draft the owners something about the frame going up.
 *    And put down yesterday as a wet day at Kellyville Ridge."
 *
 * Six taps' worth of screens, one breath, and a checklist to approve.
 *
 * THE APPROVAL STEP IS NOT A FORMALITY. Nothing here is applied until he ticks
 * it. Speech recognition mishears addresses constantly — that is the whole
 * reason `lib/intake.ts` exists in the shape it does — and the cost of a
 * mishearing landing silently is a stage marked complete on somebody else's
 * build, or a message to a homeowner he never wrote. So: every action is shown
 * with the house spelled out in full, every piece of free text is editable
 * here, and anything he unticks never happens.
 *
 * The microphone is offered but never relied on. On his phone the in-page
 * microphone is refused by the browser at a level nothing here can fix, so the
 * box is always a plain textarea he can dictate into with the keyboard's own
 * microphone — which works everywhere and is what he will mostly use.
 */

type Stage = "speak" | "review" | "done";

type Result = { ok: boolean; done?: string; error?: string };

const EXAMPLES = [
  "Lot 114, frame's done and the roof starts Tuesday",
  "Private note on Wentworth — brickie still owes me two days",
  "Draft the owners at D'Arcy Road something about the tiling being finished",
  "Yesterday was a wet day at Kellyville Ridge",
  "New house, 22 Hillcrest Avenue Baulkham Hills, double storey, the Rileys",
];

/** The house he is looking at, so "the frame's done" needs no address. */
function houseFromPath(pathname: string): string | null {
  const match = pathname.match(
    /^\/admin\/houses\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match?.[1] ?? null;
}

export default function Assistant() {
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("speak");
  const [transcript, setTranscript] = useState("");
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Result[]>([]);

  const box = useRef<HTMLTextAreaElement>(null);
  const { listening, asking, supported, error: micError, toggle } = useDictation(setTranscript);

  // Never on the login screen — there is nobody to act for yet.
  const hidden = pathname.startsWith("/admin/login");

  const close = useCallback(() => {
    setOpen(false);
    // Left as it was for a moment, so reopening after an accidental dismissal
    // does not cost him the sentence he just said.
    setTimeout(() => {
      setStage("speak");
      setTranscript("");
      setActions([]);
      setResults([]);
      setError(null);
      setNote(null);
    }, 250);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open && stage === "speak") box.current?.focus();
  }, [open, stage]);

  async function interpret() {
    setThinking(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/pm/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, houseId: houseFromPath(pathname) ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't come back.");

      const proposed: ProposedAction[] = data.actions ?? [];
      if (proposed.length === 0) {
        setError(
          data.note ||
            "Couldn't work out what to do with that. Try naming the house and what happened — \"Lot 114, frame's done\"."
        );
        return;
      }
      setActions(proposed);
      setChosen(Object.fromEntries(proposed.map((a) => [a.id, true])));
      setNote(data.note ?? null);
      setStage("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't come back.");
    } finally {
      setThinking(false);
    }
  }

  function editBody(id: string, text: string) {
    setActions((current) =>
      current.map((a) => {
        if (a.id !== id || !a.bodyField) return a;
        return { ...a, payload: { ...a.payload, [a.bodyField]: text } as ActionPayload };
      })
    );
  }

  async function run() {
    const ticked = actions.filter((a) => chosen[a.id]);
    if (ticked.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/assistant/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: ticked.map((a) => a.payload) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      setResults(data.results ?? []);
      setStage("done");
      // The pages behind the sheet are server-rendered, so they need telling.
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (hidden) return null;

  const tickedCount = actions.filter((a) => chosen[a.id]).length;

  return (
    <>
      {/* The button. Bottom right, thumb-height, on every screen — the one
          control that does not care which page he is on. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Say what happened"
        className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2.5 rounded-full bg-gold pl-4 pr-5 text-dark shadow-lg shadow-black/40 transition-transform active:scale-95 sm:bottom-7 sm:right-7"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <Mic size={20} aria-hidden="true" />
        <span className="text-sm font-semibold">Say it</span>
      </button>

      {!open ? null : (
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
            aria-label="Say what happened"
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-dark-lighter sm:max-h-[86vh] sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="flex flex-none items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
              <div className="min-w-0">
                <h2 className="font-display text-lg text-white">
                  {stage === "speak"
                    ? "Say what happened"
                    : stage === "review"
                      ? "Check before it happens"
                      : "Done"}
                </h2>
                <p className="mt-0.5 truncate text-xs text-white/40">
                  {stage === "speak"
                    ? "Several things at once is fine"
                    : stage === "review"
                      ? "Untick anything you don't want"
                      : "You can close this"}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {error && (
                <p
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm leading-relaxed text-red-200"
                >
                  <AlertCircle size={15} aria-hidden="true" className="mt-0.5 flex-none" />
                  {error}
                </p>
              )}

              {stage === "speak" && (
                <>
                  <label htmlFor="sd-say" className="sr-only">
                    What happened
                  </label>
                  <textarea
                    id="sd-say"
                    ref={box}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={6}
                    placeholder="Tap the microphone on your keyboard and talk, or type it…"
                    className="w-full resize-y rounded-xl border border-white/10 bg-dark p-4 text-[15px] leading-relaxed text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
                  />

                  <p className="mt-2 text-xs leading-relaxed text-white/35">
                    The microphone on your keyboard works best — tap the box, then the little
                    mic beside the space bar.
                  </p>

                  {supported && (
                    <button
                      type="button"
                      onClick={() => toggle(transcript)}
                      className={
                        "mt-3 inline-flex min-h-[48px] items-center gap-2 rounded-lg border px-4 text-sm transition-colors " +
                        (listening
                          ? "border-gold bg-gold/10 text-gold"
                          : "border-white/12 text-white/70 hover:border-white/30 hover:text-white")
                      }
                    >
                      {asking ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      ) : listening ? (
                        <Square size={15} aria-hidden="true" />
                      ) : (
                        <Mic size={16} aria-hidden="true" />
                      )}
                      {asking ? "Asking…" : listening ? "Stop" : "Use this page's microphone"}
                    </button>
                  )}

                  {micError && (
                    <p className="mt-2 text-xs leading-relaxed text-white/45">{micError}</p>
                  )}

                  <div className="mt-6">
                    <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-white/30">
                      Things you can say
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {EXAMPLES.map((e) => (
                        <li key={e}>
                          <button
                            type="button"
                            onClick={() =>
                              setTranscript((t) => (t.trim() ? `${t.trim()} ${e}.` : `${e}.`))
                            }
                            className="w-full rounded-lg border border-white/[0.07] bg-dark px-3.5 py-2.5 text-left text-[13px] leading-snug text-white/50 transition-colors hover:border-white/20 hover:text-white/80"
                          >
                            &ldquo;{e}&rdquo;
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {stage === "review" && (
                <>
                  {note && (
                    <p className="mb-4 rounded-lg border border-white/[0.07] bg-dark px-4 py-3 text-sm leading-relaxed text-white/55">
                      {note}
                    </p>
                  )}

                  <ul className="flex flex-col gap-3">
                    {actions.map((a) => {
                      const on = Boolean(chosen[a.id]);
                      const text = a.bodyField
                        ? ((a.payload as unknown as Record<string, string>)[a.bodyField] ?? "")
                        : "";
                      return (
                        <li
                          key={a.id}
                          className={
                            "rounded-xl border transition-colors " +
                            (on ? "border-white/15 bg-dark" : "border-white/[0.06] bg-dark/40")
                          }
                        >
                          <label className="flex cursor-pointer items-start gap-3 p-4">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) =>
                                setChosen((c) => ({ ...c, [a.id]: e.target.checked }))
                              }
                              className="mt-0.5 h-5 w-5 flex-none accent-gold"
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className={
                                  "block text-[15px] font-medium leading-snug " +
                                  (on ? "text-white" : "text-white/40")
                                }
                              >
                                {a.title}
                              </span>
                              {/* Never truncated. Which house this lands on is
                                  the one thing on this screen he has to be
                                  certain of. */}
                              <span className="mt-0.5 block text-xs leading-snug text-white/45">
                                {a.houseLabel}
                              </span>
                            </span>
                            <span
                              className={
                                "flex flex-none items-center gap-1 rounded-full px-2 py-1 text-[10px] " +
                                (a.seenBy === "owners"
                                  ? "bg-gold/15 text-gold"
                                  : "bg-white/[0.07] text-white/45")
                              }
                            >
                              {a.seenBy === "owners" ? (
                                <Eye size={10} aria-hidden="true" />
                              ) : (
                                <Lock size={10} aria-hidden="true" />
                              )}
                              {a.seenBy === "owners" ? "Owners" : "Only you"}
                            </span>
                          </label>

                          {on && a.bodyField && (
                            <div className="px-4 pb-4">
                              <label
                                htmlFor={`body-${a.id}`}
                                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/30"
                              >
                                {a.bodyLabel}
                              </label>
                              <textarea
                                id={`body-${a.id}`}
                                value={text}
                                onChange={(e) => editBody(a.id, e.target.value)}
                                rows={3}
                                className="w-full resize-y rounded-lg border border-white/10 bg-dark-card p-3 text-sm leading-relaxed text-white focus:border-gold focus:outline-none"
                              />
                            </div>
                          )}

                          {on && a.footnote && (
                            <p className="px-4 pb-4 text-xs leading-relaxed text-white/35">
                              {a.footnote}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {stage === "done" && (
                <ul className="flex flex-col gap-2">
                  {results.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg border border-white/[0.07] bg-dark px-4 py-3 text-sm"
                    >
                      {r.ok ? (
                        <Check size={15} aria-hidden="true" className="mt-0.5 flex-none text-gold" />
                      ) : (
                        <AlertCircle
                          size={15}
                          aria-hidden="true"
                          className="mt-0.5 flex-none text-red-300"
                        />
                      )}
                      <span className={r.ok ? "text-white/75" : "text-red-200"}>
                        {r.ok ? r.done : r.error}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer
              className="flex flex-none items-center gap-3 border-t border-white/[0.07] px-5 py-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {stage === "speak" && (
                <button
                  type="button"
                  onClick={interpret}
                  disabled={transcript.trim().length < 3 || thinking}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-[15px] font-semibold text-dark transition-opacity disabled:opacity-35"
                >
                  {thinking ? (
                    <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Wand2 size={17} aria-hidden="true" />
                  )}
                  {thinking ? "Working it out…" : "Work it out"}
                </button>
              )}

              {stage === "review" && (
                <>
                  <button
                    type="button"
                    onClick={() => setStage("speak")}
                    className="min-h-[52px] rounded-xl border border-white/12 px-4 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={run}
                    disabled={tickedCount === 0 || saving}
                    className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-[15px] font-semibold text-dark transition-opacity disabled:opacity-35"
                  >
                    {saving ? (
                      <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Check size={17} aria-hidden="true" />
                    )}
                    {saving
                      ? "Doing it…"
                      : tickedCount === 1
                        ? "Do this one"
                        : `Do these ${tickedCount}`}
                  </button>
                </>
              )}

              {stage === "done" && (
                <button
                  type="button"
                  onClick={close}
                  className="min-h-[52px] flex-1 rounded-xl bg-gold text-[15px] font-semibold text-dark"
                >
                  Close
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
