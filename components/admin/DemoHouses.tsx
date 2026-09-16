"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";

/**
 * Two example houses, one tap.
 *
 * The seed script needs a terminal. This does the same thing from the phone,
 * which is where this product is actually used — and an empty system
 * demonstrates none of the parts that only exist once there is data behind
 * them.
 */
export default function DemoHouses({ present }: { present: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/demo", { method });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't work.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-lg border border-dashed border-white/10 bg-dark-card p-5">
      <div className="flex items-start gap-3">
        <FlaskConical size={15} aria-hidden="true" className="mt-0.5 flex-none text-white/30" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm text-white/80">Example houses</h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-white/40">
            {present
              ? "Two made-up houses are in your list — one mid-build with an owner waiting on an answer, one at handover with a defects list half done. Everything on them is invented. Clear them before the real houses go in."
              : "Adds two made-up houses so you can see the parts that only appear once there is something to show: a decision waiting on an owner, a variation to approve, days lost to weather, and a defects list. Nothing is emailed to anyone."}
          </p>

          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}

          <button
            type="button"
            onClick={() => run(present ? "DELETE" : "POST")}
            disabled={busy}
            className={
              "mt-4 flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-medium disabled:opacity-40 " +
              (present
                ? "border border-white/15 text-white/70 hover:border-white/35"
                : "bg-gold text-dark")
            }
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {busy
              ? present
                ? "Removing…"
                : "Adding…"
              : present
                ? "Remove the example houses"
                : "Add two example houses"}
          </button>
        </div>
      </div>
    </div>
  );
}
