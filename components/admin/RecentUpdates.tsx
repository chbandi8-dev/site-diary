"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";

type Row = {
  id: string;
  body: string;
  occurredAt: string;
  published: boolean;
};

/**
 * What he has logged, and the missing half of the draft rule.
 *
 * Every delay template saves as a draft on purpose, so he can ring the owner
 * before they read that their house slipped. This is where he comes back
 * afterwards — usually to add a sentence of his own first, because a templated
 * delay is never quite the whole story.
 */
export default function RecentUpdates({ updates }: { updates: Row[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  async function call(id: string, init: RequestInit, okText: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/pm/updates/${id}`, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      setNote({ id, ok: true, text: data.message ?? okText });
      setEditing(null);
      router.refresh();
    } catch (cause) {
      setNote({ id, ok: false, text: cause instanceof Error ? cause.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  const send = (id: string, body?: string) =>
    call(
      id,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ? { body, publish: true } : { publish: true }),
      },
      "Sent."
    );

  const remove = (id: string) =>
    call(id, { method: "DELETE" }, "Taken off their page.");

  const drafts = updates.filter((u) => !u.published);

  return (
    <section className="mt-12">
      <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        Recently
        {drafts.length > 0 && (
          <span className="ml-3 rounded-full bg-gold/15 px-2.5 py-1 text-[10px] text-gold">
            {drafts.length} not sent
          </span>
        )}
      </h2>

      <ol className="flex flex-col">
        {updates.map((u) => (
          <li key={u.id} className="border-t border-white/5 py-4 first:border-t-0">
            <div className="mb-1.5 flex items-baseline gap-3">
              <time className="font-mono text-[11px] text-white/35">
                {new Date(u.occurredAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                })}
              </time>
              {!u.published && (
                <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-gold">
                  Not sent yet
                </span>
              )}
            </div>

            {editing === u.id ? (
              <div className="flex flex-col gap-3">
                <label htmlFor={`draft-${u.id}`} className="sr-only">
                  Edit before sending
                </label>
                <textarea
                  id={`draft-${u.id}`}
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-dark px-4 py-3 leading-relaxed text-white focus:border-gold focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !draft.trim()}
                    onClick={() => send(u.id, draft)}
                    className="flex min-h-[46px] items-center gap-2 rounded-lg bg-gold px-5 font-medium text-dark disabled:opacity-40"
                  >
                    <Send size={15} aria-hidden="true" />
                    Send to owners
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="min-h-[46px] px-4 text-white/50 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-white/75">{u.body}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {!u.published && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => send(u.id)}
                        className="flex min-h-[40px] items-center gap-2 rounded-lg bg-gold px-4 text-sm font-medium text-dark disabled:opacity-40"
                      >
                        <Send size={14} aria-hidden="true" />
                        Send now
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditing(u.id); setDraft(u.body); }}
                        className="min-h-[40px] rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35"
                      >
                        Edit first
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(u.id)}
                    className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/50 hover:border-white/35 hover:text-white/80 disabled:opacity-40"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {u.published ? "Take off their page" : "Discard"}
                  </button>
                </div>
              </>
            )}

            {note?.id === u.id && (
              <p role="status" className={"mt-2.5 text-sm " + (note.ok ? "text-gold" : "text-danger")}>
                {note.text}
              </p>
            )}
          </li>
        ))}
        {updates.length === 0 && (
          <li className="py-3 text-sm text-white/40">Nothing logged yet.</li>
        )}
      </ol>
    </section>
  );
}
