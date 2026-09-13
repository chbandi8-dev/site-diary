"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { OwnerStage } from "@/lib/db/owner";

/**
 * Where the build is up to, as named phases rather than a percentage.
 *
 * A number invites arithmetic the build cannot support: lock-up sits near the
 * halfway mark by stage count and about a third by time, and he would spend the
 * rest of the project explaining the gap. Phases with real names — "Frame &
 * roof", "Enclosing the house" — tell the owner more and promise less.
 *
 * Several phases can be lit at once, because several stages genuinely run at
 * once. Brickwork happens while the roof is tiled.
 */
export default function PhaseRail({
  phases,
}: {
  phases: { name: string; state: "done" | "active" | "ahead" }[];
}) {
  const reduced = useReducedMotion();

  return (
    <ol className="mt-8 flex flex-col gap-0 sm:flex-row sm:gap-1.5">
      {phases.map((phase, i) => (
        <li key={phase.name} className="flex flex-1 items-center gap-3 sm:block">
          <motion.span
            aria-hidden="true"
            className={
              "block h-1 flex-none rounded-full sm:h-1.5 sm:w-full " +
              (phase.state === "done"
                ? "bg-accent-primary"
                : phase.state === "active"
                  ? "bg-accent-primary/45"
                  : "bg-text/12")
            }
            initial={reduced ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{ transformOrigin: "left" }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease: [0.22, 0.61, 0.36, 1] }}
          />
          <span
            className={
              "block py-1.5 text-[13px] leading-snug sm:mt-2 sm:py-0 " +
              (phase.state === "active"
                ? "font-medium text-text"
                : phase.state === "done"
                  ? "text-text/55"
                  : "text-text/35")
            }
          >
            {phase.name}
            {phase.state === "active" && (
              <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-accent-primary sm:ml-0 sm:block sm:mt-0.5">
                Now
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Groups stages into the owner-facing phases, preserving their order. */
export function toPhases(
  stages: OwnerStage[]
): { name: string; state: "done" | "active" | "ahead" }[] {
  const order: string[] = [];
  const byPhase = new Map<string, OwnerStage[]>();

  for (const stage of stages) {
    if (stage.status === "not_applicable") continue;
    const phase = stage.phase ?? "In progress";
    if (!byPhase.has(phase)) {
      byPhase.set(phase, []);
      order.push(phase);
    }
    byPhase.get(phase)!.push(stage);
  }

  // Position of the work actually happening. Everything ordered before it is
  // behind them, whether or not every administrative stage was ever ticked off
  // — nobody back-fills "Selections & colours", and a rail showing "Before we
  // start" as un-started while the frame goes up is exactly the argument this
  // was meant to avoid.
  const frontier = Math.max(
    ...stages
      .filter((s) => s.status === "in_progress" || s.status === "complete")
      .map((s) => s.position),
    -1
  );

  return order.map((name) => {
    const group = byPhase.get(name)!;
    if (group.some((s) => s.status === "in_progress")) return { name, state: "active" as const };
    if (group.every((s) => s.status === "complete")) return { name, state: "done" as const };
    if (Math.max(...group.map((s) => s.position)) < frontier) return { name, state: "done" as const };
    return { name, state: "ahead" as const };
  });
}
