import type { OwnerHouse, OwnerStage } from "@/lib/db/owner";

function formatRange(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  if (from && to) {
    const a = fmt(from);
    const b = fmt(to);
    return a === b ? a : `${a} – ${b}`;
  }
  return fmt((from ?? to)!);
}

function formatDay(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

export default function HouseHeader({
  house, percent, active, next, stageCount,
}: {
  house: OwnerHouse;
  percent: number;
  active: OwnerStage[];
  next?: OwnerStage;
  stageCount: number;
}) {
  const handover = formatRange(house.handover_from, house.handover_to);

  return (
    <header className="mb-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text/45">
        {house.storeys === 2 ? "Double storey" : "Single storey"}
        {house.suburb ? ` · ${house.suburb}` : ""}
      </p>
      <h1 className="mt-2 font-display text-[clamp(2rem,7vw,3rem)] leading-[1.02] tracking-tight">
        {house.address}
      </h1>

      {/*
        The most-asked question, answered before it's asked. A build produces
        nothing visible most days, and an owner who can't tell "on track" from
        "gone wrong" picks up the phone.
      */}
      {house.waiting_on && (
        <div className="mt-7 border-l-[3px] border-accent-primary bg-surface/50 px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-primary">
            Right now
          </p>
          <p className="mt-1.5 leading-relaxed">
            Waiting on {house.waiting_on}
            {house.waiting_on_eta && (
              <span className="text-text/65">, expected {formatDay(house.waiting_on_eta)}</span>
            )}
          </p>
        </div>
      )}

      <dl className="mt-8 grid grid-cols-1 gap-px border-y border-text/10 bg-text/10 sm:grid-cols-3">
        <div className="bg-bg py-4 pr-4">
          <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-text/45">
            Underway
          </dt>
          <dd className="mt-1.5 leading-snug">
            {active.length > 0
              ? active.map((s) => s.name).join(", ")
              : "Between stages"}
          </dd>
        </div>
        <div className="bg-bg py-4 pr-4 sm:pl-4">
          <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-text/45">
            Next
          </dt>
          <dd className="mt-1.5 leading-snug">
            {next ? next.name : "Finishing up"}
            {next?.estimated_end && (
              <span className="block text-sm text-text/55">
                estimated {formatDay(next.estimated_end)}
              </span>
            )}
          </dd>
        </div>
        <div className="bg-bg py-4 sm:pl-4">
          <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-text/45">
            Handover
          </dt>
          <dd className="mt-1.5 leading-snug">
            {handover ?? "To be confirmed"}
            {handover && <span className="block text-sm text-text/55">estimated</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-text/50">
          <span>Progress</span>
          <span className="tabular-nums">{percent}% of {stageCount} stages</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Build progress"
          className="h-1.5 w-full overflow-hidden bg-text/10"
        >
          <div className="h-full bg-accent-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </header>
  );
}
