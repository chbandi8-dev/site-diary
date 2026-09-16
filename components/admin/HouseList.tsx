"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Clock, Search } from "lucide-react";

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
  const [query, setQuery] = useState("");

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
          <li key={h.id}>
            <Link
              href={`/admin/houses/${h.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-dark-card px-5 py-4 transition-colors hover:border-gold/40"
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
