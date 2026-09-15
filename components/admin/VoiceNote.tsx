"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

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

type Recognition = {
  start: () => void;
  stop: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export default function VoiceNote({
  houseId,
  onDraft,
}: {
  houseId: string;
  onDraft: (body: string) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Impl = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Impl) return;

    const r = new Impl();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-AU";
    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      setTranscript(heard);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);

    recognition.current = r;
    setSupported(true);
  }, []);

  const toggle = useCallback(() => {
    const r = recognition.current;
    if (!r) return;
    if (listening) {
      r.stop();
      setListening(false);
    } else {
      setNote(null);
      r.start();
      setListening(true);
    }
  }, [listening]);

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

      {supported && (
        <button
          type="button"
          onClick={toggle}
          className={
            "mb-3 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-lg border-2 text-base font-medium transition-colors " +
            (listening
              ? "border-gold bg-gold/20 text-gold"
              : "border-dashed border-white/15 text-white/70 hover:border-gold/50 hover:text-white")
          }
        >
          {listening ? <Square size={20} aria-hidden="true" /> : <Mic size={22} aria-hidden="true" />}
          {listening ? "Listening — tap to stop" : "Hold the phone up and talk"}
        </button>
      )}

      <label htmlFor={`vn-${houseId}`} className="sr-only">
        What happened on site
      </label>
      <textarea
        id={`vn-${houseId}`}
        rows={3}
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder={
          supported
            ? "…or type it, or use the microphone on your keyboard."
            : "Tap here and use the microphone on your keyboard, or just type it."
        }
        className="w-full rounded-lg border border-white/10 bg-dark px-4 py-3 leading-relaxed text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
      />

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
