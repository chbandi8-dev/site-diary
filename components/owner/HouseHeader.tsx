"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { OwnerHouse, OwnerStage } from "@/lib/db/owner";
import PhaseRail, { toPhases } from "./PhaseRail";

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

const ease = [0.22, 0.61, 0.36, 1] as const;

export default function HouseHeader({
  house,
  stages,
  active,
  next,
}: {
  house: OwnerHouse;
  stages: OwnerStage[];
  active: OwnerStage[];
  next?: OwnerStage;
}) {
  const reduced = useReducedMotion();
  const handover = formatRange(house.handover_from, house.handover_to);

  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease },
        };

  return (
    <header>
      <motion.p
        {...rise(0)}
        className="font-mono text-[11px] uppercase tracking-[0.16em] text-text/45"
      >
        {house.storeys === 2 ? "Double storey" : "Single storey"}
        {house.suburb ? ` · ${house.suburb}` : ""}
      </motion.p>

      <motion.h1
        {...rise(0.06)}
        className="mt-2.5 font-display text-[clamp(2.25rem,8vw,3.75rem)] leading-[1.0] tracking-[-0.02em]"
      >
        {house.address}
      </motion.h1>

      {/*
        The question that generates most of his incoming calls, answered before
        it's asked. Placed above everything else on purpose.
      */}
      {house.waiting_on && (
        <motion.div
          {...rise(0.12)}
          className="mt-8 border-l-[3px] border-accent-primary bg-surface/45 px-5 py-4"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-primary">
            Right now
          </p>
          <p className="mt-1.5 leading-relaxed">
            Waiting on {house.waiting_on}
            {house.waiting_on_eta && (
              <span className="text-text/65">, expected {formatDay(house.waiting_on_eta)}</span>
            )}
          </p>
        </motion.div>
      )}

      <motion.dl
        {...rise(0.18)}
        className="mt-9 grid grid-cols-1 gap-px border-y border-text/10 bg-text/10 sm:grid-cols-3"
      >
        {[
          {
            term: "Underway",
            value: active.length > 0 ? active.map((s) => s.name).join(", ") : "Between stages",
            note: null as string | null,
          },
          {
            term: "Next",
            value: next ? next.name : "Finishing up",
            note: next?.estimated_end ? `estimated ${formatDay(next.estimated_end)}` : null,
          },
          {
            term: "Handover",
            value: handover ?? "To be confirmed",
            note: handover ? "estimated" : null,
          },
        ].map((cell, i) => (
          <div key={cell.term} className={"bg-bg py-4 pr-4" + (i > 0 ? " sm:pl-4" : "")}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-text/45">
              {cell.term}
            </dt>
            <dd className="mt-1.5 leading-snug">
              {cell.value}
              {cell.note && <span className="block text-sm text-text/55">{cell.note}</span>}
            </dd>
          </div>
        ))}
      </motion.dl>

      <PhaseRail phases={toPhases(stages)} />
    </header>
  );
}
