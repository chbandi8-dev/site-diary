/**
 * What a page looks like while the server is still thinking.
 *
 * Every admin page renders on demand and reads a fair amount of a build's
 * history, so a tap could sit on a motionless screen for the best part of a
 * second on a phone. Next.js will show this the instant a link is tapped
 * instead — which does not make anything faster, but is the difference between
 * "loading" and "broken", and that is the difference being complained about.
 *
 * Shaped roughly like the page it stands in for, so the layout does not jump
 * when the real thing arrives.
 */
export default function Skeleton({
  rows = 6,
  tiles = 0,
}: {
  rows?: number;
  tiles?: number;
}) {
  return (
    <div className="mx-auto max-w-5xl animate-pulse" aria-hidden="true">
      <div className="mb-8">
        <div className="h-8 w-48 rounded bg-white/[0.07]" />
        <div className="mt-3 h-4 w-64 rounded bg-white/[0.04]" />
      </div>

      {tiles > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg border border-white/5 bg-dark-card" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-lg border border-white/5 bg-dark-card"
            // Fades down the page so it reads as a list rather than a block.
            style={{ opacity: 1 - i * 0.1 }}
          />
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
