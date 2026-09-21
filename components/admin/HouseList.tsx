"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Clock, Loader2, Search, Trash2 } from "lucide-react";

type Row = {
  id: string;
  address: string;
  suburb: string | null;
  underway: string[];
  waitingOn: string | null;
  /** Days since the last published update, or -1 for never. */
  daysQuiet: number;
  reports: number;
  drafts: number;
  needsAttention: boolean;
};

const DAYS_QUIET_BEFORE_FLAG = 5;

/**
 * The run sheet, with a way to find one house in it.
 *
 * Ordered by what needs him, which is right for the morning read and wrong for
 * the moment a homeowner rings and he has thirty seconds to find their build.
 * At twenty-five houses that was a scroll through a list whose order he cannot
 * predict, because it changes daily by design.
 *
 * Filtering happens here rather than on the server: twenty-five rows are
 * already loaded, and a round trip per keystroke would be slower than the
 * scrolling it replaces.
 */
export default function HouseList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Which row is asking. One at a time, and never armed by default.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  /**
   * Deleting from the list.
   *
   * The common case is a duplicate from the microphone or an address typed
   * wrong five minutes ago, and walking into the house to get rid of it is a
   * silly amount of work for that. So the list deletes a house with nothing
   * filed against it after one confirm.
   *
   * A house with updates, photos or notes on it is refused here and sent to
   * its own page, where the address has to be typed out. That is where the
   * weight belongs: on the ones where something would actually be lost.
   */
  async function remove(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/pm/houses/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't delete.");
      setConfirming(null);
      router.refresh();
    } catch (cause) {
      setError({
        id,
        message: cause instanceof Error ? cause.message : "That didn't delete.",
      });
    } finally {
      setDeleting(null);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    // Street, suburb, and what's underway — because "the one with the roof on"
    // is how he thinks about them as often as by address.
    return rows.filter((r) =>
      [r.address, r.suburb ?? "", r.waitingOn ?? "", ...r.underway]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  return (
    <>
      {rows.length > 6 && (
        <div className="relative mb-4">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a house — street, suburb, or what's underway"
            aria-label="Find a house"
            className="min-h-[48px] w-full rounded-lg border border-white/10 bg-dark-card pl-11 pr-4 text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
          />
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {shown.map((h) => (
          <li key={h.id} className="flex flex-col gap-2">
            <div className="flex items-stretch gap-2">
            <Link
              href={`/admin/houses/${h.id}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg border border-white/5 bg-dark-card px-5 py-4 transition-colors hover:border-gold/40"
            >
              <div className="min-w-0">
                <span className="block truncate font-medium text-white">{h.address}</span>
                <span className="mt-0.5 block truncate text-sm text-white/45">
                  {h.underway.length > 0 ? h.underway.join(" · ") : "Nothing marked as underway"}
                  {h.waitingOn && ` — waiting on ${h.waitingOn}`}
                </span>
              </div>

              <div className="flex flex-none items-center gap-3">
                {h.drafts > 0 && (
                  <span
                    className="rounded-full bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold"
                    title="Written but not sent"
                  >
                    {h.drafts} not sent
                  </span>
                )}
                {h.reports > 0 && (
                  <span className="flex items-center gap-1 text-gold" title="Waiting on an answer">
                    <AlertCircle size={14} aria-hidden="true" />
                    {h.reports}
                  </span>
                )}
                <span
                  className={
                    "flex items-center gap-1.5 font-mono text-xs tabular-nums " +
                    (h.daysQuiet < 0 || h.daysQuiet >= DAYS_QUIET_BEFORE_FLAG
                      ? "text-gold"
                      : "text-white/35")
                  }
                >
                  <Clock size={13} aria-hidden="true" />
                  {h.daysQuiet < 0 ? "never" : `${h.daysQuiet}d`}
                </span>
              </div>
            </Link>

            {/* Outside the link, so a tap on it is never a tap on the house. */}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming((c) => (c === h.id ? null : h.id));
              }}
              aria-label={`Delete ${h.address}`}
              title={`Delete ${h.address}`}
              className={
                "flex w-11 flex-none items-center justify-center rounded-lg border transition-colors " +
                (confirming === h.id
                  ? "border-danger/50 text-danger"
                  : "border-white/5 text-white/20 hover:border-white/20 hover:text-white/50")
              }
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
            </div>

            {/* Under its own row rather than in a dialog, so the house about to
                go is still on screen while he decides. */}
            {(confirming === h.id || error?.id === h.id) && (
              <div className="rounded-lg border border-danger/25 bg-danger/[0.06] px-5 py-4">
              {error?.id === h.id ? (
                <>
                  <p className="text-sm leading-relaxed text-white/80">{error.message}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirming(null);
                      }}
                      className="min-h-[42px] rounded-lg border border-white/15 px-4 text-sm text-white/70"
                    >
                      Leave it
                    </button>
                    <Link
                      href={`/admin/houses/${h.id}`}
                      className="flex min-h-[42px] items-center rounded-lg bg-gold px-4 text-sm font-semibold text-dark"
                    >
                      Open the house
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-white/80">
                    Delete <span className="font-medium text-white">{h.address}</span>? Its
                    stages go with it, and it can&apos;t be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="min-h-[42px] flex-1 rounded-lg border border-white/15 text-sm text-white/70"
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(h.id)}
                      disabled={deleting === h.id}
                      className="flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-danger text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {deleting === h.id && <Loader2 size={15} className="animate-spin" />}
                      Delete
                    </button>
                  </div>
                </>
              )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {shown.length === 0 && rows.length > 0 && (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-8 text-center text-white/45">
          No house matches &ldquo;{query}&rdquo;.
        </p>
      )}
    </>
  );
}
