"use client";

import { useEffect, useState } from "react";
import { CloudOff, Loader2, WifiOff } from "lucide-react";
import { drain, pending, subscribe, type Pending } from "@/lib/outbox";

/**
 * Registers the service worker, and says what is waiting to go.
 *
 * The bar only appears when there is something to say. A permanent connection
 * indicator is noise on a phone that is online almost all the time, and it
 * would stop being read long before the day it mattered.
 */
export default function OfflineBar() {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setQueue(pending());
    setOffline(navigator.onLine === false);

    const unsubscribe = subscribe(setQueue);

    async function flush() {
      setOffline(false);
      setSending(true);
      await drain();
      setQueue(pending());
      setSending(false);
    }

    const goneOffline = () => setOffline(true);
    window.addEventListener("online", flush);
    window.addEventListener("offline", goneOffline);

    // On open, and then slowly. The `online` event is the main trigger, but it
    // does not fire for a connection that was technically up and merely useless
    // — which on a building site is most of them.
    void flush();
    const timer = setInterval(() => void drain().then(() => setQueue(pending())), 60_000);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unregistered worker costs the home screen icon's offline page and
        // nothing else. Not worth telling him about.
      });
    }

    return () => {
      unsubscribe();
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", goneOffline);
      clearInterval(timer);
    };
  }, []);

  if (queue.length === 0 && !offline) return null;

  return (
    <div
      role="status"
      className={
        "sticky top-0 z-30 flex items-center gap-2 px-5 py-2.5 text-sm " +
        (queue.length > 0
          ? "bg-gold/15 text-gold"
          : "bg-white/[0.06] text-white/60")
      }
    >
      {sending ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : queue.length > 0 ? (
        <CloudOff size={14} aria-hidden="true" />
      ) : (
        <WifiOff size={14} aria-hidden="true" />
      )}

      {queue.length > 0 ? (
        <span>
          {sending
            ? `Sending ${queue.length}…`
            : `${queue.length} waiting to send${offline ? " — no signal" : ""}. ` +
              "Nothing's lost; it goes out on its own."}
        </span>
      ) : (
        <span>No signal. Anything you write is kept and sent when you&apos;re back.</span>
      )}
    </div>
  );
}
