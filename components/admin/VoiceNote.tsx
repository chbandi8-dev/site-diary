"use client";

import { useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { useDictation } from "./useDictation";

/**
 * Say what happened; it writes the update.
 *
 * Two ways in, because one of them fails on some phones and the other never
 * does. Hold-to-talk uses the browser's own speech recognition where it exists;
 * the text box below always works, and on a phone his keyboard has a microphone
 * on it anyway. Either way the words land in the same box.
 *
 * The write-up is the part that earns its keep. Dictation alone gets "yeah so
 * the brickies got about half the front done, waiting on the windows still" onto
 * the screen — which is not something he would send a client. The draft turns
 * that into two calm sentences he will.
 *
 * He always reads it before it goes. Nothing generated reaches an owner
 * unreviewed: it is his name on the message.
 */

export default function VoiceNote({
  houseId,
  onDraft,
}: {
  houseId: string;
  onDraft: (body: string) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const {
    listening,
    asking,
    supported,
    error: micError,
    toggle,
  } = useDictation(setTranscript);

  async function writeUp() {
    setDrafting(true);
    setNote(null);
    try {
      const res = await fetch("/api/pm/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't write that up.");

      if (data.internalOnly) {
        setNote(data.message);
        return;
      }
      onDraft(data.body);
      setTranscript("");
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Couldn't write that up.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-dark-card p-4">
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        Say what happened
      </h2>

      {/*
        The box comes first, and the in-page microphone is offered underneath
        it rather than above.

        On a phone the keyboard's own microphone is the better tool anyway —
        it is Google's or Apple's speech engine rather than the browser's, it
        handles accents better, and it works on devices where the page is never
        given microphone access at all. Leading with a button that fails on
        some phones, and burying the thing that always works, had it exactly
        backwards.
      */}
      <label htmlFor={`vn-${houseId}`} className="sr-only">
        What happened on site
      </label>
      <textarea
        id={`vn-${houseId}`}
        rows={4}
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Tap here, then use the microphone on your keyboard — or type it."
        className="w-full rounded-lg border border-white/10 bg-dark px-4 py-3 text-base leading-relaxed text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
      />

      {supported && (
        <button
          type="button"
          onClick={() => toggle(transcript)}
          className={
            "mt-2 flex min-h-[40px] items-center gap-2 text-sm transition-colors " +
            (listening ? "text-gold" : "text-white/45 hover:text-white")
          }
        >
          {listening ? <Square size={14} aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}
          {asking
            ? "Allow the microphone to continue…"
            : listening
              ? "Listening — tap when you're done"
              : "Or record straight into the page"}
        </button>
      )}

      {micError && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-danger">
          {micError}
        </p>
      )}

      {note && (
        <p role="status" className="mt-3 text-sm leading-relaxed text-gold">
          {note}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-white/35">
          Talk the way you would to a mate. It gets tidied into something the owner can read,
          and you see it before it goes anywhere.
        </p>
        <button
          type="button"
          onClick={writeUp}
          disabled={drafting || transcript.trim().length < 3}
          className="flex min-h-[46px] flex-none items-center gap-2 rounded-lg bg-gold px-5 font-medium text-dark disabled:opacity-40"
        >
          {drafting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {drafting ? "Writing…" : "Write it up"}
        </button>
      </div>
    </section>
  );
}
