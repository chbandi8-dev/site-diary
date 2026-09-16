"use client";

/**
 * Sends that survive a dead spot.
 *
 * New estates and site sheds have no signal, and tapping Send there used to
 * fail — losing whatever he had just dictated, at the exact moment he was
 * standing in front of the thing he was describing. He would write it again in
 * the ute, or not at all.
 *
 * A send that cannot reach the server is now kept on the phone and retried: the
 * moment the browser sees a connection, when the app is next opened, and on a
 * slow timer in between. He is told it is waiting rather than told it failed,
 * because it has not failed — it has not gone yet, and it will.
 *
 * Deliberately plain: localStorage, a JSON array, no library. The queue is
 * never more than a few short messages, and a background-sync implementation
 * that only works in Chrome would be worse than one that works everywhere.
 */

const KEY = "sd_outbox_v1";
const MAX = 50;

export type Pending = {
  id: string;
  url: string;
  body: unknown;
  /** What to call it on screen while it waits. */
  label: string;
  queuedAt: number;
  attempts: number;
};

type Listener = (pending: Pending[]) => void;
const listeners = new Set<Listener>();

function read(): Pending[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Pending[]) : [];
  } catch {
    // Private windows, blocked site data, corrupt JSON. An empty queue is the
    // safe reading — better than throwing inside a send handler.
    return [];
  }
}

function write(items: Pending[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    // Out of quota or blocked. Nothing useful to do, and failing the send for
    // it would defeat the point.
  }
  listeners.forEach((l) => l(items));
}

export function pending(): Pending[] {
  return read();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sends now, or keeps it for later.
 *
 * Returns how it went so the screen can say the right thing: "sent" and
 * "saved, it'll go when you're back" are different messages and he needs to
 * know which one he got.
 */
export async function send(
  url: string,
  body: unknown,
  label: string
): Promise<{ ok: true; data: unknown } | { ok: false; queued: boolean; error: string }> {
  if (navigator.onLine !== false) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data };

      // The server answered and said no. Queueing would retry a request it has
      // already rejected, forever — this is a real failure and he should see it.
      return {
        ok: false,
        queued: false,
        error: (data as { error?: string }).error ?? "That didn't send.",
      };
    } catch {
      // Never reached the server. That is the case worth keeping.
    }
  }

  const item: Pending = {
    id: crypto.randomUUID(),
    url,
    body,
    label,
    queuedAt: Date.now(),
    attempts: 0,
  };
  write([...read(), item]);

  return {
    ok: false,
    queued: true,
    error: "No signal — saved, and it'll go out on its own once you're back in range.",
  };
}

let draining = false;

/** Tries everything waiting. Safe to call as often as you like. */
export async function drain(): Promise<number> {
  if (draining || navigator.onLine === false) return 0;
  draining = true;
  let sent = 0;

  try {
    for (const item of read()) {
      try {
        const res = await fetch(item.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
        });

        if (res.ok) {
          write(read().filter((p) => p.id !== item.id));
          sent++;
          continue;
        }

        // A refusal the server actually issued will be refused again. Dropped
        // rather than retried forever, so one bad item cannot block the rest.
        if (res.status >= 400 && res.status < 500) {
          write(read().filter((p) => p.id !== item.id));
          continue;
        }

        // A server error might pass. Counted, and given up on eventually.
        const next = read().map((p) =>
          p.id === item.id ? { ...p, attempts: p.attempts + 1 } : p
        );
        write(next.filter((p) => p.attempts < 8));
      } catch {
        // Signal went again mid-drain. Leave it queued and stop — the rest will
        // not do any better right now.
        break;
      }
    }
  } finally {
    draining = false;
  }

  return sent;
}
