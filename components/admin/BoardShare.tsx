"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Loader2, Share2, X } from "lucide-react";
import WhatsAppButton from "./WhatsAppButton";

/**
 * A link that shows where every build is up to, for people who are not owners.
 *
 * The question he gets every Monday — "where's everything at?" — comes from the
 * builder he works for and the developer running the estate, and answering it
 * was a phone call or a spreadsheet kept by hand. This is one link that answers
 * it and keeps answering it.
 *
 * Scoped to an estate when the asker only has lots in that estate, which is the
 * common case: a developer is entitled to know about their own release and
 * nothing else. The board itself carries no owner details and no money — see
 * `lib/db/board.ts`, which is where that decision lives rather than here.
 *
 * The URL is shown once, on creation. Only its hash is stored, so it cannot be
 * shown again — which is the same trade the owner links make, and for the same
 * reason.
 */

export type BoardLinkRow = {
  id: string;
  label: string;
  hint: string;
  estate: string | null;
  lastUsedAt: string | null;
  useCount: number;
};

export default function BoardShare({
  links,
  developments,
}: {
  links: BoardLinkRow[];
  developments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [estate, setEstate] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/board-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), developmentId: estate || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      setUrl(data.url);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/pm/board-links?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Share a board
        </h2>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setUrl(null);
          }}
          className="text-sm text-white/45 underline underline-offset-4 hover:text-white"
        >
          {open ? "Close" : "New link"}
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-dark-card p-5">
        <p className="text-sm leading-relaxed text-white/50">
          One link that shows where every build is up to — the phase, what&apos;s underway,
          and anything behind its dates. No owner details, no costs. For the builder or the
          developer, not for homeowners.
        </p>

        {open && (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            {error && (
              <p role="alert" className="mb-3 text-sm text-danger">
                {error}
              </p>
            )}

            {url ? (
              <>
                <p className="mb-2 text-sm text-white/60">
                  Send it now — it won&apos;t be shown again.
                </p>
                <code className="mb-3 block overflow-x-auto rounded-lg bg-dark px-4 py-3 font-mono text-xs text-gold">
                  {url}
                </code>
                <div className="flex flex-wrap gap-2">
                  <WhatsAppButton
                    message={`Here's where all the builds are up to, updated as the work happens: ${url}`}
                    label="Send on WhatsApp"
                    chooseLabel="Send on WhatsApp"
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className="flex min-h-[46px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/75"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label
                  htmlFor="board-label"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
                >
                  Who is it for
                </label>
                <input
                  id="board-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Aldwyn Property Group"
                  className="mb-3 min-h-[48px] w-full rounded-lg border border-white/10 bg-dark px-4 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
                />

                {developments.length > 0 && (
                  <>
                    <label
                      htmlFor="board-estate"
                      className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
                    >
                      What they see
                    </label>
                    <select
                      id="board-estate"
                      value={estate}
                      onChange={(e) => setEstate(e.target.value)}
                      className="mb-3 min-h-[48px] w-full rounded-lg border border-white/10 bg-dark px-4 text-white focus:border-gold focus:outline-none"
                    >
                      <option value="">Every build</option>
                      {developments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} — that estate only
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <button
                  type="button"
                  onClick={create}
                  disabled={busy || label.trim().length === 0}
                  className="flex min-h-[48px] items-center gap-2 rounded-lg bg-gold px-5 text-sm font-semibold text-dark disabled:opacity-35"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                  Make the link
                </button>
              </>
            )}
          </div>
        )}

        {links.length > 0 && (
          <ul className="mt-4 flex flex-col border-t border-white/[0.06] pt-2">
            {links.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 truncate text-sm text-white/80">
                    <Link2 size={13} aria-hidden="true" className="flex-none text-white/30" />
                    {l.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/40">
                    {l.estate ? `${l.estate} only` : "Every build"} · ends {l.hint} ·{" "}
                    {l.useCount === 0
                      ? "not opened yet"
                      : `opened ${l.useCount} time${l.useCount === 1 ? "" : "s"}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => revoke(l.id)}
                  title="Stop this link working"
                  className="flex min-h-[40px] flex-none items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-white/50 transition-colors hover:border-danger/40 hover:text-danger"
                >
                  <X size={13} aria-hidden="true" />
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
