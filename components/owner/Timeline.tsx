type Photo = { id: string; key: string; caption: string | null; url: string };
type Update = { id: string; kind: string; body: string; occurred_at: string; photos: Photo[] };

const KIND_LABEL: Record<string, string> = {
  progress: "Progress",
  milestone: "Milestone",
  delay: "Timing",
  weather: "Weather",
  message: "A note from your builder",
  decision: "Needs your decision",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function Timeline({ updates }: { updates: Update[] }) {
  if (updates.length === 0) {
    return (
      <section className="border-t border-text/10 pt-8">
        <h2 className="mb-3 font-display text-2xl tracking-tight">Nothing posted yet</h2>
        <p className="max-w-prose leading-relaxed text-text/65">
          Updates will appear here as work starts. You&apos;ll get an email each time, so there&apos;s
          no need to keep checking.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-6 font-display text-2xl tracking-tight">What&apos;s been happening</h2>
      <ol className="flex flex-col">
        {updates.map((u) => (
          <li key={u.id} className="border-t border-text/10 py-7 first:border-t-0 first:pt-0">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <time
                dateTime={u.occurred_at}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/45"
              >
                {formatWhen(u.occurred_at)}
              </time>
              {u.kind !== "progress" && (
                <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-accent-primary">
                  {KIND_LABEL[u.kind] ?? u.kind}
                </span>
              )}
            </div>

            <p className="max-w-prose leading-relaxed">{u.body}</p>

            {u.photos.length > 0 && (
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {u.photos.map((p) => (
                  <li key={p.id}>
                    {/*
                      Served from a signed URL that changes on every render, so
                      next/image would cache nothing and burn transformation
                      quota on each scroll. A plain img is the right tool.
                    */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption ?? `Site photo from ${formatWhen(u.occurred_at)}`}
                      loading="lazy"
                      className="aspect-[4/3] w-full bg-surface object-cover"
                    />
                    {p.caption && (
                      <span className="mt-1 block text-xs leading-snug text-text/55">
                        {p.caption}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
