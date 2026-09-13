"use client";

import Reveal from "./Reveal";
import PhotoGrid from "./PhotoGrid";

type Photo = { id: string; key: string; caption: string | null; url: string };
type Update = { id: string; kind: string; body: string; occurred_at: string; photos: Photo[] };

const KIND_LABEL: Record<string, string> = {
  milestone: "Milestone",
  delay: "Timing",
  weather: "Weather",
  message: "A note from your builder",
  decision: "Needs your decision",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function monthOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export default function Timeline({ updates }: { updates: Update[] }) {
  if (updates.length === 0) {
    return (
      <section className="border-t border-text/10 pt-10">
        <h2 className="mb-3 font-display text-2xl tracking-tight">Nothing posted yet</h2>
        <p className="max-w-prose leading-relaxed text-text/65">
          Updates will appear here as work starts. You&apos;ll get an email each time, so there&apos;s
          no need to keep checking back.
        </p>
      </section>
    );
  }

  let lastMonth = "";

  return (
    <section className="mt-16">
      <h2 className="mb-8 font-display text-[clamp(1.5rem,4vw,2rem)] tracking-tight">
        What&apos;s been happening
      </h2>

      <ol className="relative flex flex-col">
        {/* The spine. Decorative — the dates carry the meaning. */}
        <span
          aria-hidden="true"
          className="absolute left-[5px] top-2 bottom-2 w-px bg-text/12 sm:left-[7px]"
        />

        {updates.map((u, i) => {
          const month = monthOf(u.occurred_at);
          const showMonth = month !== lastMonth;
          lastMonth = month;

          return (
            <li key={u.id} className="relative pl-7 sm:pl-10">
              {showMonth && (
                <Reveal>
                  <p className="-ml-7 mb-5 mt-9 font-mono text-[10px] uppercase tracking-[0.16em] text-text/40 first:mt-0 sm:-ml-10">
                    {month}
                  </p>
                </Reveal>
              )}

              <Reveal delay={Math.min(i, 4) * 0.04} className="pb-9">
                <span
                  aria-hidden="true"
                  className={
                    "absolute left-0 mt-[7px] block h-[11px] w-[11px] rounded-full border-2 border-bg sm:h-[15px] sm:w-[15px] " +
                    (u.kind === "milestone" ? "bg-accent-primary" : "bg-text/25")
                  }
                />

                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <time
                    dateTime={u.occurred_at}
                    className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/45"
                  >
                    {formatWhen(u.occurred_at)}
                  </time>
                  {KIND_LABEL[u.kind] && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-accent-primary">
                      {KIND_LABEL[u.kind]}
                    </span>
                  )}
                </div>

                <p
                  className={
                    "max-w-prose leading-relaxed " +
                    (u.kind === "milestone"
                      ? "font-display text-xl leading-snug tracking-tight sm:text-2xl"
                      : "")
                  }
                >
                  {u.body}
                </p>

                <PhotoGrid photos={u.photos} label={formatWhen(u.occurred_at)} />
              </Reveal>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
