"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Send, Trash2, X } from "lucide-react";

type Stage = { id: string; name: string; phase: string | null; status: string };

/**
 * The middle states, cycled by their own small button.
 *
 * Kept off the tick because the tick has one job. Booked and Underway still
 * matter — the owner's page reads "currently underway" straight off them — but
 * they are not what he is doing when he walks off a slab that has just been
 * poured.
 */
const NEXT_STATE: Record<string, string> = {
  not_started: "scheduled",
  scheduled: "in_progress",
  in_progress: "on_hold",
  on_hold: "not_applicable",
  not_applicable: "not_started",
  complete: "not_started",
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
export default function StageBoard({
  stages,
  houseId,
}: {
  stages: Stage[];
  houseId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ stage: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAfter, setNewAfter] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  async function setStatus(stage: Stage, status: string) {
    setBusy(stage.id);
    setError(null);
    try {
      const res = await fetch(`/api/pm/stages/${stage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      // Offered, never sent on his behalf. Marking a stage done is a record
      // keeping action; emailing twenty-five owners is not, and conflating
      // them would make him hesitant to keep the board accurate.
      if (data?.suggested) setDraft({ stage: data.stageName, body: data.suggested });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  /**
   * The tick, and the whole point of it: tapping an unticked stage marks it
   * done, tapping a ticked one puts it back. Getting out of "done" used to take
   * four taps through Booked and Underway, so a mistap was a nuisance — and a
   * board that is annoying to correct is a board that stops being true.
   */
  const toggleDone = (stage: Stage) =>
    setStatus(stage, stage.status === "complete" ? "not_started" : "complete");

  async function addStage() {
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseId,
          name: newName.trim(),
          afterId: newAfter || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't add.");
      setNewName("");
      setNewAfter("");
      setShowAdd(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't add.");
    } finally {
      setAdding(false);
    }
  }

  async function removeStage(stage: Stage) {
    setBusy(stage.id);
    setError(null);
    try {
      const res = await fetch(`/api/pm/stages/${stage.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't delete.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't delete.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!draft) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, body: draft.body, kind: "milestone" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't send.");
      setSent(draft.stage);
      setDraft(null);
      router.refresh();
      setTimeout(() => setSent(null), 6000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't send.");
    } finally {
      setSending(false);
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
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setShowAdd(!showAdd);
              setOpen(true);
            }}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white"
          >
            <Plus size={13} aria-hidden="true" />
            Add
          </button>
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
          >
            {editing ? "Done" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
          >
            {open ? "Show less" : `All ${stages.length}`}
          </button>
        </div>
      </div>

      {error && !draft && (
        <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>
      )}

      {draft && (
        <div className="mb-4 rounded-lg border border-gold/25 bg-gold/[0.06] p-4">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-gold">
            {draft.stage} is done — tell them?
          </p>
          <textarea
            rows={4}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            aria-label="Message to the owners"
            className="w-full rounded-lg border border-white/10 bg-dark px-4 py-3 leading-relaxed text-white focus:border-gold focus:outline-none"
          />
          {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={sending || !draft.body.trim()}
              className="flex min-h-[44px] items-center gap-2 rounded-lg bg-gold px-5 text-sm font-medium text-dark disabled:opacity-40"
            >
              <Send size={14} aria-hidden="true" />
              {sending ? "Sending…" : "Send it"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm text-white/50 hover:text-white"
            >
              <X size={14} aria-hidden="true" />
              Not now
            </button>
          </div>
          <p className="mt-2 text-xs text-white/35">
            Edit it first if you like. The stage is already marked done either way.
          </p>
        </div>
      )}

      {sent && (
        <p role="status" className="mb-4 text-sm text-gold">
          Sent — the owners have been told {sent.toLowerCase()} is done.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {shown.map((s) => {
          const done = s.status === "complete";
          return (
            <li
              key={s.id}
              className={
                "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors " +
                TONE[s.status]
              }
            >
              {/* The tick: on, or off again. One job. */}
              <button
                type="button"
                disabled={busy === s.id}
                onClick={() => toggleDone(s)}
                aria-pressed={done}
                aria-label={done ? `Mark ${s.name} not done` : `Mark ${s.name} done`}
                className={
                  "flex min-h-[44px] flex-1 items-center gap-3 rounded-lg px-2 text-left disabled:opacity-40"
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    "flex h-6 w-6 flex-none items-center justify-center rounded border-2 " +
                    (done ? "border-gold bg-gold text-dark" : "border-white/25")
                  }
                >
                  {done && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span
                    className={
                      "block truncate text-[15px] font-medium " + (done ? "line-through" : "")
                    }
                  >
                    {s.name}
                  </span>
                  {s.phase && (
                    <span className="block truncate text-[11px] text-white/30">{s.phase}</span>
                  )}
                </span>
              </button>

              {/* Booked, underway, on hold — the states between not-started and
                  done, kept off the tick so it stays a tick. */}
              {!done && (
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => setStatus(s, NEXT_STATE[s.status] ?? "scheduled")}
                  className="min-h-[44px] flex-none rounded-lg px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/50 hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  {LABEL[s.status]}
                </button>
              )}

              {editing && (
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => removeStage(s)}
                  aria-label={`Remove ${s.name}`}
                  className="min-h-[44px] flex-none rounded-lg px-2 text-white/30 hover:bg-white/5 hover:text-red-300 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {showAdd && (
        <div className="mt-3 rounded-lg border border-white/10 bg-dark-card p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="stage-name" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                What to call it
              </label>
              <input
                id="stage-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Pool and pool fencing"
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
              <p className="text-xs text-white/30">
                Tap the box and use your keyboard&apos;s microphone if you&apos;d rather say it.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="stage-after" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Goes after
              </label>
              <select
                id="stage-after"
                value={newAfter}
                onChange={(e) => setNewAfter(e.target.value)}
                className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white focus:border-gold focus:outline-none"
              >
                <option value="">At the very end</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addStage}
                disabled={adding || !newName.trim()}
                className="min-h-[44px] rounded-lg bg-gold px-5 text-sm font-medium text-dark disabled:opacity-40"
              >
                {adding ? "Adding…" : "Add it to this house"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="min-h-[44px] rounded-lg px-3 text-sm text-white/50 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs leading-relaxed text-white/30">
              This adds it to this house only. To change what every future house starts
              with, edit the standard list from the Houses page.
            </p>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-white/35">
        Tap the tick to mark a stage done, tap it again to undo. The word on the right
        cycles Booked, Underway and On hold — more than one stage can be underway at a time.
      </p>
    </section>
  );
}
