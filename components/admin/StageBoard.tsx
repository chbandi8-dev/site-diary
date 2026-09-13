"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = { id: string; name: string; phase: string | null; status: string };

const CYCLE: Record<string, string> = {
  not_started: "scheduled",
  scheduled: "in_progress",
  in_progress: "complete",
  complete: "not_started",
  on_hold: "in_progress",
  not_applicable: "not_started",
};

const LABEL: Record<string, string> = {
  not_started: "—",
  scheduled: "Booked",
  in_progress: "Underway",
  on_hold: "On hold",
  complete: "Done",
  not_applicable: "N/A",
};

const TONE: Record<string, string> = {
  not_started: "border-white/10 text-white/35",
  scheduled: "border-white/25 text-white/70",
  in_progress: "border-gold bg-gold/20 text-gold",
  on_hold: "border-orange-400/50 text-orange-300",
  complete: "border-white/10 bg-white/5 text-white/50",
  not_applicable: "border-white/5 text-white/20",
};

/**
 * Where the build is up to.
 *
 * Tapping a stage cycles it: booked, underway, done. Several can be underway at
 * once, because they are — brickwork runs while the roof is tiled. Nothing here
 * touches a progress claim.
 *
 * This matters more than it looks: the owner's page reads its "underway" and
 * "next" lines straight off these, and the milestone buttons on the capture
 * screen only appear for stages that are actually active. Stale stages mean a
 * page that quietly lies and a "slab poured" button that never shows up.
 */
export default function StageBoard({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function cycle(stage: Stage) {
    setBusy(stage.id);
    try {
      await fetch(`/api/pm/stages/${stage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: CYCLE[stage.status] ?? "in_progress" }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // Everything active, plus a little either side. The full 31 is a wall he does
  // not need while standing on a slab.
  const active = stages.filter((s) => s.status === "in_progress" || s.status === "on_hold");
  const firstActive = stages.findIndex((s) => s.status === "in_progress");
  const nearby = stages.slice(
    Math.max(0, (firstActive === -1 ? stages.findIndex((s) => s.status !== "complete") : firstActive) - 1),
    Math.max(4, (firstActive === -1 ? 4 : firstActive + 4))
  );
  const shown = open ? stages : Array.from(new Set([...active, ...nearby]));

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Where it&apos;s up to
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
        >
          {open ? "Show less" : `All ${stages.length} stages`}
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {shown.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={busy === s.id}
              onClick={() => cycle(s)}
              className={
                "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors disabled:opacity-40 " +
                TONE[s.status]
              }
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{s.name}</span>
                {s.phase && (
                  <span className="block truncate text-[11px] text-white/30">{s.phase}</span>
                )}
              </span>
              <span className="flex-none font-mono text-[10px] uppercase tracking-[0.12em]">
                {LABEL[s.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-white/35">
        Tap to move a stage on. More than one can be underway at a time.
      </p>
    </section>
  );
}
