"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, TrendingUp } from "lucide-react";

type StageForecast = { id: string; name: string; estimatedEnd: string | null; movedFrom: string | null };

type StageTarget = { id: string; name: string; dueBy: string; slipDays: number | null };

type Result = {
  stages: StageForecast[];
  handoverFrom: string | null;
  handoverTo: string | null;
  basis: string[];
  target: string | null;
  plan: { targets: StageTarget[]; floatDays: number; basis: string[] } | null;
  current: { handoverFrom: string | null; handoverTo: string | null };
};

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The forecast, previewed before it counts.
 *
 * He recalculates, reads what moved and why, and only then decides whether the
 * owners hear about it. Nothing here runs on a schedule: a handover date that
 * slides on its own, with no human agreeing it really slid, is how an owner
 * finds out their date changed from a robot at 3am.
 *
 * Telling them is a separate tick again, because a two-day shift inside the
 * existing window is not news, and emailing it as though it were teaches them
 * to ignore the ones that are.
 */
export default function ForecastPanel({
  houseId,
  history,
}: {
  houseId: string;
  history: { from: string; to: string; reason: string | null; createdAt: string; notified: boolean }[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [moveHandover, setMoveHandover] = useState(true);
  const [notifyOwners, setNotifyOwners] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recalculate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pm/forecast?houseId=${houseId}${target ? `&target=${target}` : ""}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't work that out.");
      setResult(data);
      if (data.target && !target) setTarget(String(data.target).slice(0, 10));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't work that out.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseId,
          targetHandover: target || undefined,
          reason: reason.trim() || undefined,
          moveHandover,
          notifyOwners: moveHandover && notifyOwners,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't save.");
      setResult(null);
      setReason("");
      setNotifyOwners(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  const moved = result?.stages.filter((s) => s.movedFrom) ?? [];
  const windowChanges =
    result &&
    (result.handoverFrom?.slice(0, 10) !== result.current.handoverFrom?.slice(0, 10) ||
      result.handoverTo?.slice(0, 10) !== result.current.handoverTo?.slice(0, 10));

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Forecast
        </h2>
        <button
          type="button"
          onClick={recalculate}
          disabled={busy}
          className="text-sm text-white/50 underline underline-offset-4 hover:text-white disabled:opacity-40"
        >
          {busy && !result ? "Working it out…" : "Recalculate"}
        </button>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}

      {result ? (
        <div className="rounded-lg border border-white/5 bg-dark-card p-5">
          <div className="mb-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
              Handover
            </p>
            <p className="mt-1 font-display text-2xl text-white">
              {day(result.handoverFrom)} — {day(result.handoverTo)}
            </p>
            {windowChanges && (
              <p className="mt-1 text-sm text-gold">
                Currently showing {day(result.current.handoverFrom)} —{" "}
                {day(result.current.handoverTo)} on their page.
              </p>
            )}
          </div>

          {/* The date the contract already committed to. Everything below is
              measured against it, so it sits above them. */}
          <div className="mb-5 flex flex-wrap items-end gap-3 border-t border-white/5 pt-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fc-target" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Date you&apos;ve promised
              </label>
              <input
                id="fc-target"
                type="date"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-lg border border-white/10 bg-dark px-3 py-2.5 text-white focus:border-gold focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={recalculate}
              disabled={busy}
              className="min-h-[44px] rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35 disabled:opacity-40"
            >
              Work it back
            </button>
          </div>

          {result.plan && (
            <div
              className={
                "mb-5 rounded-lg border p-4 " +
                (result.plan.floatDays < 0
                  ? "border-red-400/30 bg-red-400/[0.06]"
                  : "border-white/5 bg-dark")
              }
            >
              <p
                className={
                  "font-display text-xl " +
                  (result.plan.floatDays < 0 ? "text-red-300" : "text-gold")
                }
              >
                {result.plan.floatDays < 0
                  ? `${Math.abs(result.plan.floatDays)} working days behind`
                  : `${result.plan.floatDays} working days spare`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">
                {result.plan.basis[result.plan.basis.length - 1]}
              </p>
            </div>
          )}

          <ul className="mb-5 flex flex-col">
            {result.stages.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-4 border-t border-white/5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-white/70">{s.name}</span>
                <span className="flex-none text-right text-sm text-white/85">
                  {day(s.estimatedEnd)}
                  {s.movedFrom && (
                    <span className="ml-2 text-xs text-gold">was {day(s.movedFrom)}</span>
                  )}
                  {(() => {
                    const t = result.plan?.targets.find((x) => x.id === s.id);
                    if (!t || t.slipDays === null) return null;
                    // Only a real slip is called out. A day either way is noise
                    // on a programme measured in months.
                    if (Math.abs(t.slipDays) < 2) return null;
                    return (
                      <span
                        className={
                          "mt-0.5 block text-xs " +
                          (t.slipDays > 0 ? "text-red-300" : "text-white/35")
                        }
                      >
                        {t.slipDays > 0
                          ? `${t.slipDays}d late — due ${day(t.dueBy)}`
                          : `${-t.slipDays}d ahead of ${day(t.dueBy)}`}
                      </span>
                    );
                  })()}
                </span>
              </li>
            ))}
          </ul>

          {result.stages.length > 8 && (
            <p className="-mt-3 mb-5 text-xs text-white/30">
              and {result.stages.length - 8} more stages after that.
            </p>
          )}

          <div className="mb-5 rounded-lg border border-white/5 bg-dark p-4">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
              How this was worked out
            </p>
            <ul className="flex flex-col gap-1">
              {result.basis.map((b) => (
                <li key={b} className="text-xs leading-relaxed text-white/45">{b}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fc-r" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Why it moved — the owners read this
              </label>
              <input
                id="fc-r"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Six days lost to weather in June, and the windows arrived two weeks late."
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
            </div>

            <label className="flex items-start gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                checked={moveHandover}
                onChange={(e) => setMoveHandover(e.target.checked)}
                className="mt-1 h-4 w-4 flex-none accent-gold"
              />
              <span>
                Move the handover window on their page to these dates
                <span className="mt-0.5 block text-xs text-white/35">
                  Leave this off to save the stage dates for yourself without changing what
                  the owners see.
                </span>
              </span>
            </label>

            <label
              className={
                "flex items-start gap-3 text-sm " +
                (moveHandover ? "text-white/70" : "text-white/25")
              }
            >
              <input
                type="checkbox"
                disabled={!moveHandover}
                checked={moveHandover && notifyOwners}
                onChange={(e) => setNotifyOwners(e.target.checked)}
                className="mt-1 h-4 w-4 flex-none accent-gold"
              />
              <span>
                Email them about it
                <span className="mt-0.5 block text-xs text-white/35">
                  Worth it when the window really moves. A couple of days inside the same
                  window is not news, and sending it as though it were teaches them to
                  ignore the ones that are.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="flex min-h-[48px] items-center gap-2 rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {busy ? "Saving…" : `Save${moved.length > 0 ? ` (${moved.length} moved)` : ""}`}
              </button>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="min-h-[48px] rounded-lg border border-white/15 px-5 text-sm text-white/70 hover:border-white/35"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-white/5 bg-dark-card px-5 py-4 text-sm leading-relaxed text-white/45">
          <TrendingUp size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          Works out when each remaining stage finishes, from where the build is now —
          allowing for weekends, public holidays, the Christmas shutdown and the days this
          house has actually lost to weather. Put in the date you&apos;ve promised and it
          also works backwards, so every stage gets a date it has to hit and you can see
          which one is slipping. Nothing changes until you save it.
        </p>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
            Handover, as it has moved
          </p>
          <ul className="flex flex-col">
            {history.map((h, i) => (
              <li key={i} className="flex items-start gap-3 border-t border-white/5 py-2.5">
                <CalendarClock size={13} aria-hidden="true" className="mt-1 flex-none text-white/25" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/75">
                    {day(h.from)} — {day(h.to)}
                  </p>
                  <p className="mt-0.5 text-xs text-white/40">
                    set{" "}
                    {new Date(h.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {h.notified ? " · owners told" : " · not sent to owners"}
                    {h.reason && ` · ${h.reason}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
