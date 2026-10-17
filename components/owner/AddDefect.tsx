"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

const ROOMS = [
  "Kitchen", "Living", "Main bedroom", "Bed 2", "Bed 3",
  "Main bathroom", "Ensuite", "Laundry", "Hallway", "Garage", "External",
];

/**
 * An owner adding to their own defects list, with a photo.
 *
 * This is the handover walk-through, and they are doing it with a phone in one
 * hand. It stays open after each item, because nobody finds exactly one thing:
 * they work through a house room by room, and closing the form between items
 * would make them tap twice as much as they write.
 *
 * The photo matters more here than anywhere else in the product. "Scuff on the
 * architrave" means one thing to the person looking at it and another to the
 * builder reading it a week later, and the gap between those two readings is
 * most of what makes the defects period tense.
 */
export default function AddDefect() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/owner/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, location: location || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't send.");

      // Only the description clears. The room usually does not change
      // between two items, and retyping it every time is the thing that makes
      // people stop halfway down a list.
      setDescription("");
      setAdded((n) => n + 1);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 flex min-h-[48px] items-center gap-2 border border-text/20 px-5 text-[15px] transition-colors hover:border-accent-primary"
      >
        <Plus size={15} aria-hidden="true" />
        Add something you&apos;ve noticed
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 border-l-[3px] border-accent-primary bg-white p-5 shadow-[0_1px_2px_rgba(28,27,25,.05)]">
      <h3 className="font-display text-lg tracking-tight">Add to the list</h3>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-text/60">
        It goes straight onto the same list your builder is working from, and he&apos;s
        told about it. Add as many as you like — the form stays open.
      </p>

      {added > 0 && (
        <p role="status" className="mt-3 text-sm text-accent-primary">
          {added} added so far. Your builder has been told.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-accent-primary">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {ROOMS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setLocation(r === location ? "" : r)}
            className={
              "min-h-[38px] border px-3.5 text-sm transition-colors " +
              (location === r
                ? "border-accent-primary bg-accent-primary/10"
                : "border-text/20 hover:border-text/50")
            }
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="defect-body" className="text-sm text-text/60">
          What needs attention
        </label>
        <textarea
          id="defect-body"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Scuff on the architrave beside the linen cupboard"
          className="border border-text/20 px-3 py-2.5 text-[15px] focus:border-accent-primary focus:outline-none"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !description.trim()}
          className="min-h-[48px] bg-text px-6 text-[15px] text-white disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add it"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[48px] px-4 text-[15px] text-text/55 underline underline-offset-4 hover:text-text"
        >
          Done
        </button>
      </div>
    </form>
  );
}
