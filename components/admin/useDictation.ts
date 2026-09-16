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
 *
 * And a fourth, which is why the button appeared dead on his phone: starting
 * recognition does not reliably ask for the microphone. On several mobile
 * browsers it fails outright rather than prompting, so the permission dialog
 * he needed to accept never appeared. Asking through getUserMedia first always
 * prompts, and turns "nothing happened" into a dialog with an Allow button.
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

/**
 * Asks for the microphone, and therefore raises the browser's own permission
 * dialog. The stream is stopped immediately — the speech engine opens its own,
 * and leaving this one running would sit a recording indicator on his screen
 * for the rest of the session.
 */
async function requestMicrophone(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (cause) {
    const name = (cause as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "The microphone is blocked for this site. Tap the padlock beside the address bar, then Permissions, then allow the Microphone — or just type it in below.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No microphone was found on this device. Type it in below instead.";
    }
    return "Couldn't get to the microphone. Type it in below instead.";
  }
}

/** Said plainly, with what to do instead. */
function explain(code: string | undefined): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "This browser won't give the page the microphone. Use the microphone on your keyboard instead — tap the box above and look for it on the keyboard.";
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

/**
 * Whether the in-page microphone has already been refused on this device.
 *
 * Remembered so a button that cannot work stops being offered. Some phones
 * refuse it at the operating system level, where nothing in the page can help,
 * and re-presenting it every visit only invites the same dead end.
 */
const DENIED_KEY = "sd_mic_denied";

function wasDenied(): boolean {
  try {
    return localStorage.getItem(DENIED_KEY) === "1";
  } catch {
    // Private windows and blocked site data. Offering the button is the
    // harmless side to fail on.
    return false;
  }
}

function rememberDenied() {
  try {
    localStorage.setItem(DENIED_KEY, "1");
  } catch {
    // Nothing to do — it simply gets offered again next time.
  }
}

export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  // True only while the permission dialog is up. Without it the button sits
  // unchanged behind the dialog, which on a first tap reads as nothing having
  // happened — the exact impression this whole change exists to remove.
  const [asking, setAsking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [denied, setDenied] = useState(false);
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
    setDenied(wasDenied());

    return () => {
      wanted.current = false;
      try {
        r.abort();
      } catch {
        // Already gone.
      }
    };
  }, [onText]);

  const toggle = useCallback(async (current: string) => {
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

    // Before anything else, so the browser actually asks. This is the tap that
    // raises the Allow dialog; until it is accepted there is no point starting
    // recognition, and starting it first is what made the button look dead.
    setAsking(true);
    const refusal = await requestMicrophone();
    setAsking(false);
    if (refusal) {
      setError(refusal);
      rememberDenied();
      setDenied(true);
      return;
    }

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

  return {
    listening,
    asking,
    // Offered only where it can actually work.
    supported: supported && !denied,
    error,
    toggle,
    clearError: () => setError(null),
  };
}
