"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hold-to-talk, made survivable on a phone.
 *
 * The browser's speech API is the only free way to dictate, and on mobile it
 * misbehaves in three specific ways that each look to the user like the button
 * is broken:
 *
 *  1. `continuous` is widely ignored. Android Chrome stops listening after a
 *     pause of a second or two, so a sentence with a breath in it gets cut in
 *     half. Restarting on `end` is the only way to hold a session open.
 *  2. Errors arrive on a callback and nothing shows them. A blocked microphone
 *     produced a button that highlighted, did nothing, and un-highlighted.
 *  3. Every restart resets the result list, so anything already said is lost
 *     unless it is banked first.
 *
 * None of this is fixable in the API — it is worked around here, and the
 * typing fallback stays visible throughout, because on some phones it simply
 * will not work at all and the keyboard's own microphone will.
 */

type Recognition = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

/** Said plainly, with what to do instead. */
function explain(code: string | undefined): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Your browser blocked the microphone. Allow it from the padlock beside the address bar — or just type it in below, the keyboard microphone works too.";
    case "audio-capture":
      return "No microphone available. Type it in below instead.";
    case "network":
      return "Speech recognition needs a connection and couldn't reach it. Type it in below instead.";
    case "no-speech":
      return "Didn't catch anything — try again, or type it in below.";
    // Fires whenever recognition is stopped deliberately, including by us.
    case "aborted":
      return null;
    default:
      return "The microphone stopped working. Type it in below instead.";
  }
}

export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<Recognition | null>(null);
  // What previous recognition sessions produced. Every restart clears the
  // API's own result list, so this is what stops a restart erasing the
  // first half of a sentence.
  const banked = useRef("");
  // Whether the user still wants to be listening, as opposed to the engine
  // having stopped on its own. Restarting depends on telling those apart.
  const wanted = useRef(false);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Impl = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Impl) return;

    const r = new Impl();
    r.continuous = true;
    // Interim results are what make the button feel alive. Without them the
    // screen stays empty until the speaker stops, which reads as a hang.
    r.interimResults = true;
    r.lang = "en-AU";

    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      onText((banked.current + " " + heard).trim());
    };

    r.onerror = (e) => {
      const message = explain(e?.error);
      if (message) {
        setError(message);
        wanted.current = false;
        setListening(false);
      }
    };

    r.onend = () => {
      if (!wanted.current) {
        setListening(false);
        return;
      }
      // Stopped on its own mid-sentence. Bank what we have and pick up again.
      banked.current = "";
      try {
        r.start();
      } catch {
        // Some engines refuse an immediate restart. Give up quietly rather
        // than loop — the words so far are already in the box.
        wanted.current = false;
        setListening(false);
      }
    };

    recognition.current = r;
    setSupported(true);

    return () => {
      wanted.current = false;
      try {
        r.abort();
      } catch {
        // Already gone.
      }
    };
  }, [onText]);

  const toggle = useCallback((current: string) => {
    const r = recognition.current;
    if (!r) return;

    if (wanted.current) {
      wanted.current = false;
      try {
        r.stop();
      } catch {
        // Already stopped.
      }
      setListening(false);
      return;
    }

    setError(null);
    // Anything already typed or said is kept, so the button can be used again
    // to add a sentence rather than starting over.
    banked.current = current.trim();
    wanted.current = true;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Couldn't start the microphone. Type it in below instead.");
      wanted.current = false;
    }
  }, []);

  return { listening, supported, error, toggle, clearError: () => setError(null) };
}
