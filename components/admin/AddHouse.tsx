"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Square, Wand2, X } from "lucide-react";
import { useDictation } from "./useDictation";

/**
 * Adding a house by saying it out loud.
 *
 * Twenty fields typed on a phone at the end of a day on site is why there was
 * no way to add a house at all. Spoken, it is about fifteen seconds:
 *
 *   "Fourteen Wattle Grove, Kellyville. Double storey. Priya and Arun Raman.
 *    We're on the roof. Waiting on the windows, should be here Thursday.
 *    Handover looking like March, April next year."
 *
 * The interpretation is never trusted. It lands in an ordinary form, every
 * field editable, and nothing is created until he taps Add. A misheard address
 * costs one correction here; saved straight from speech it would cost a build
 * filed under the wrong house with photos already hanging off it.
 */

type Draft = {
  address: string;
  suburb: string | null;
  storeys: 1 | 2 | null;
  owners: { name: string; email: string | null }[];
  currentStage: string | null;
  waitingOn: string | null;
  waitingOnDate: string | null;
  handoverFrom: string | null;
  handoverTo: string | null;
  startDate: string | null;
};

const EMPTY: Draft = {
  address: "",
  suburb: null,
  storeys: null,
  owners: [],
  currentStage: null,
  waitingOn: null,
  waitingOnDate: null,
  handoverFrom: null,
  handoverTo: null,
  startDate: null,
};

export default function AddHouse({ stageNames }: { stageNames: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    listening,
    asking,
    supported,
    error: micError,
    toggle: toggleMic,
  } = useDictation(setTranscript);

  async function interpret() {
    setReading(true);
    setError(null);
    setDuplicate(null);
    try {
      const res = await fetch("/api/pm/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't come back.");
      setDraft({ ...EMPTY, ...data.draft });
      if (data.existing) {
        setDuplicate(
          `You already have ${data.existing.address}${
            data.existing.suburb ? `, ${data.existing.suburb}` : ""
          }. Check this isn't the same one.`
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't come back.");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/houses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: draft.address,
          suburb: draft.suburb || undefined,
          storeys: draft.storeys ?? 1,
          owners: draft.owners.filter((o) => o.name.trim()),
          currentStage: draft.currentStage || undefined,
          waitingOn: draft.waitingOn || undefined,
          waitingOnDate: draft.waitingOnDate || undefined,
          handoverFrom: draft.handoverFrom || undefined,
          handoverTo: draft.handoverTo || undefined,
          startDate: draft.startDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      reset();
      router.push(`/admin/houses/${data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setOpen(false);
    setDraft(null);
    setTranscript("");
    setDuplicate(null);
    setError(null);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const field =
    "w-full rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none";
  const label = "font-mono text-[11px] uppercase tracking-[0.12em] text-white/45";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] items-center gap-2 rounded-lg bg-gold px-5 text-sm font-medium text-dark"
      >
        <Mic size={15} aria-hidden="true" />
        Add a house
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-white/5 bg-dark-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-white">Add a house</h2>
          <p className="mt-0.5 text-xs text-white/40">
            Say it however you like. You check everything before it saves.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          aria-label="Cancel"
          className="rounded p-1.5 text-white/30 hover:bg-white/5 hover:text-white/70"
        >
          <X size={16} />
        </button>
      </div>

      {(error || micError) && (
        <p role="alert" className="mb-3 text-sm text-red-300">{error ?? micError}</p>
      )}

      {!draft ? (
        <>
          <p className="mb-3 rounded-lg border border-white/5 bg-dark px-4 py-3 text-xs leading-relaxed text-white/45">
            &ldquo;Fourteen Wattle Grove, Kellyville. Double storey. Priya and Arun Raman.
            We&rsquo;re on the roof, waiting on the windows, should be here Thursday.
            Handover looking like March, April next year.&rdquo;
          </p>

          {/* The box first: the keyboard's own microphone is the better tool on
              a phone, and the only one that works on every device. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="intake" className={label}>
              Tap here, then use the microphone on your keyboard
            </label>
            <textarea
              id="intake"
              rows={5}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="…or just type it."
              className={field + " text-base"}
            />
          </div>

          {supported && (
            <button
              type="button"
              onClick={() => toggleMic(transcript)}
              className={
                "mt-2 flex min-h-[40px] items-center gap-2 text-sm transition-colors " +
                (listening ? "text-gold" : "text-white/45 hover:text-white")
              }
            >
              {listening ? <Square size={14} /> : <Mic size={14} />}
              {asking
                ? "Allow the microphone…"
                : listening
                  ? "Stop and use this"
                  : "Or record straight into the page"}
            </button>
          )}

          <button
            type="button"
            onClick={interpret}
            disabled={reading || transcript.trim().length < 3}
            className="mt-4 flex min-h-[48px] items-center gap-2 rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
          >
            {reading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {reading ? "Reading it…" : "Fill in the form"}
          </button>
        </>
      ) : (
        <>
          {duplicate && (
            <p className="mb-4 rounded-lg border border-gold/25 bg-gold/[0.06] px-4 py-3 text-sm text-gold">
              {duplicate}
            </p>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="h-addr" className={label}>Address</label>
              <input
                id="h-addr"
                value={draft.address}
                onChange={(e) => set("address", e.target.value)}
                className={field}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="h-sub" className={label}>Suburb</label>
                <input
                  id="h-sub"
                  value={draft.suburb ?? ""}
                  onChange={(e) => set("suburb", e.target.value || null)}
                  className={field}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className={label}>Storeys</span>
                <div className="flex gap-2">
                  {[1, 2].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set("storeys", n as 1 | 2)}
                      className={
                        "min-h-[44px] flex-1 rounded-lg border text-sm " +
                        ((draft.storeys ?? 1) === n
                          ? "border-gold bg-gold/20 text-gold"
                          : "border-white/15 text-white/70 hover:border-white/35")
                      }
                    >
                      {n === 1 ? "Single" : "Double"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="h-stage" className={label}>Where it&apos;s up to</label>
              <select
                id="h-stage"
                value={draft.currentStage ?? ""}
                onChange={(e) => set("currentStage", e.target.value || null)}
                className={field}
              >
                <option value="">Not started yet</option>
                {stageNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <p className="text-xs text-white/30">
                Everything before this is marked complete. You can fix any of it on the
                stage board afterwards.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="h-wait" className={label}>Waiting on</label>
                <input
                  id="h-wait"
                  value={draft.waitingOn ?? ""}
                  onChange={(e) => set("waitingOn", e.target.value || null)}
                  placeholder="the window delivery"
                  className={field}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="h-wd" className={label}>Expected</label>
                <input
                  id="h-wd"
                  type="date"
                  value={draft.waitingOnDate ?? ""}
                  onChange={(e) => set("waitingOnDate", e.target.value || null)}
                  className={field}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="h-hf" className={label}>Handover from</label>
                <input
                  id="h-hf"
                  type="date"
                  value={draft.handoverFrom ?? ""}
                  onChange={(e) => set("handoverFrom", e.target.value || null)}
                  className={field}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="h-ht" className={label}>Handover to</label>
                <input
                  id="h-ht"
                  type="date"
                  value={draft.handoverTo ?? ""}
                  onChange={(e) => set("handoverTo", e.target.value || null)}
                  className={field}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className={label}>Owners</span>
              <p className="text-xs leading-relaxed text-white/35">
                Optional, and usually skipped. Owners add their own name and email when
                they open the link you send them — which is why a name without an email
                address here isn&apos;t saved.
              </p>
              {[0, 1].map((i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-2">
                  <input
                    aria-label={`Owner ${i + 1} name`}
                    value={draft.owners[i]?.name ?? ""}
                    onChange={(e) => {
                      const owners = [...draft.owners];
                      owners[i] = { name: e.target.value, email: owners[i]?.email ?? null };
                      set("owners", owners.filter((o, n) => o.name || n < i));
                    }}
                    placeholder="Name"
                    className={field}
                  />
                  <input
                    aria-label={`Owner ${i + 1} email`}
                    type="email"
                    value={draft.owners[i]?.email ?? ""}
                    onChange={(e) => {
                      const owners = [...draft.owners];
                      owners[i] = { name: owners[i]?.name ?? "", email: e.target.value || null };
                      set("owners", owners);
                    }}
                    placeholder="Email (optional)"
                    className={field}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving || !draft.address.trim()}
                className="min-h-[48px] rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
              >
                {saving ? "Adding…" : "Add this house"}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="min-h-[48px] rounded-lg border border-white/15 px-5 text-sm text-white/70 hover:border-white/35"
              >
                Say it again
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
