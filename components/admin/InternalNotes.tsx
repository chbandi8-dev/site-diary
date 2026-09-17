"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2 } from "lucide-react";

type Note = { id: string; body: string; createdAt: string; author: string };

/**
 * Notes only he sees.
 *
 * The point of this is that he needs somewhere to put the half of the job that
 * is not for clients — who is late, what he is chasing, what he suspects. Without
 * it, every entry carries the weight of being a message to a customer, and he
 * stops logging.
 *
 * The placeholder is doing real work. Site notes are discoverable if a build
 * ever goes to a dispute, and "the brickie is hopeless" read aloud at a hearing
 * helps nobody. A dated, factual note is just as useful to him and reads as a
 * site diary rather than as evidence against him.
 */
export default function InternalNotes({
  houseId,
  notes,
}: {
  houseId: string;
  notes: Note[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, body }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't save.");
      setBody("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/pm/notes?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="mt-12">
      <h2 className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        <Lock size={12} aria-hidden="true" />
        Your notes — owners never see these
      </h2>

      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}

      <div className="rounded-lg border border-white/5 bg-dark-card p-4">
        <label htmlFor={`note-${houseId}`} className="sr-only">
          Add a private note
        </label>
        <textarea
          id={`note-${houseId}`}
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Bricklayer 3 days late — called 11am, rescheduled to Thursday."
          className="w-full resize-none rounded-lg border border-white/10 bg-dark px-4 py-3 leading-relaxed text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-xs leading-relaxed text-white/35">
            Keep these factual and dated. If a build ever goes to a dispute these are
            discoverable, and a note that reads like a site diary helps you where venting
            doesn&apos;t.
          </p>
          <button
            type="button"
            onClick={add}
            disabled={busy || !body.trim()}
            className="min-h-[42px] flex-none rounded-lg bg-gold px-5 text-sm font-medium text-dark disabled:opacity-40"
          >
            {busy ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>

      {notes.length > 0 && (
        <ol className="mt-4 flex flex-col">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 border-t border-white/5 py-3">
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[11px] text-white/30">
                  {new Date(n.createdAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                  {n.author && <span className="text-white/20"> · {n.author}</span>}
                </span>
                <p className="mt-0.5 text-sm leading-relaxed text-white/70">{n.body}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(n.id)}
                aria-label="Delete note"
                className="flex-none rounded p-1.5 text-white/30 hover:bg-white/5 hover:text-white/70"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
