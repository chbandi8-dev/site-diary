"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Pencil, Trash2, X } from "lucide-react";

/**
 * Fixing the details, and getting rid of a house that should not be there.
 *
 * Both exist because of the microphone. Dictation mangles Sydney addresses —
 * "Wentworthville" arrives as "Wentworth Bill" — and until now a house saved
 * with a wrong address stayed wrong forever: there was no screen anywhere that
 * could change it, and no way to remove the duplicate created by saying it
 * again. That is a poor answer to a builder who has just been misheard.
 *
 * Deleting is deliberately awkward. Everything hanging off the house goes with
 * it — every stage, update, photo, variation, defect and note — so it will not
 * run until the address has been typed out in full. A dialog with a red button
 * is something you tap by reflex; typing "14 Wattle Grove" is not. The same
 * screen offers the answer that is usually the right one instead: a finished
 * build should be marked handed over, which keeps the record.
 */

export default function HouseSettings({
  houseId,
  address,
  suburb,
  lotNumber,
  storeys,
  holdings,
}: {
  houseId: string;
  address: string;
  suburb: string | null;
  lotNumber: string | null;
  storeys: number;
  /** What would be destroyed, counted on the server so the warning is true. */
  holdings: { updates: number; photos: number; notes: number; documents: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [danger, setDanger] = useState(false);
  const [typed, setTyped] = useState("");

  const [form, setForm] = useState({
    address,
    suburb: suburb ?? "",
    lotNumber: lotNumber ?? "",
    storeys: storeys === 2 ? 2 : 1,
  });

  const matches =
    typed.trim().replace(/\s+/g, " ").toLowerCase() ===
    address.trim().replace(/\s+/g, " ").toLowerCase();

  function close() {
    setOpen(false);
    setDanger(false);
    setTyped("");
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pm/houses/${houseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address.trim(),
          suburb: form.suburb.trim() || null,
          lotNumber: form.lotNumber.trim() || null,
          storeys: form.storeys === 2 ? 2 : 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      close();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pm/houses/${houseId}?confirm=${encodeURIComponent(typed.trim())}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't delete.");
      router.push("/admin/houses");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't delete.");
      setDeleting(false);
    }
  }

  const going = [
    holdings.updates ? `${holdings.updates} update${holdings.updates === 1 ? "" : "s"}` : null,
    holdings.photos ? `${holdings.photos} photo${holdings.photos === 1 ? "" : "s"}` : null,
    holdings.notes ? `${holdings.notes} private note${holdings.notes === 1 ? "" : "s"}` : null,
    holdings.documents
      ? `${holdings.documents} document${holdings.documents === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  // "1 update ... goes with it", but "1 update, 3 photos ... go with it".
  const goVerb = going.length === 1 && going[0]?.startsWith("1 ") ? "goes" : "go";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-white/55 transition-colors hover:border-white/25 hover:text-white"
      >
        <Pencil size={12} aria-hidden="true" />
        Edit details
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="House details"
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-dark-lighter sm:max-h-[86vh] sm:max-w-lg sm:rounded-2xl"
          >
            <header className="flex flex-none items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
              <h2 className="font-display text-lg text-white">House details</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {error && (
                <p
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/[0.07] px-4 py-3 text-sm leading-relaxed text-danger"
                >
                  <AlertCircle size={15} aria-hidden="true" className="mt-0.5 flex-none" />
                  {error}
                </p>
              )}

              <Field
                label="Address"
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
              />
              <Field
                label="Suburb"
                value={form.suburb}
                onChange={(v) => setForm((f) => ({ ...f, suburb: v }))}
              />
              <Field
                label="Lot number"
                value={form.lotNumber}
                placeholder="Only if it's in an estate"
                onChange={(v) => setForm((f) => ({ ...f, lotNumber: v }))}
              />

              <p className="mb-1.5 mt-4 font-mono text-[10px] uppercase tracking-[0.13em] text-white/35">
                Storeys
              </p>
              <div className="flex gap-2">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, storeys: n }))}
                    className={
                      "min-h-[44px] flex-1 rounded-lg border text-sm transition-colors " +
                      (form.storeys === n
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-white/10 text-white/60 hover:border-white/25")
                    }
                  >
                    {n === 1 ? "Single" : "Double"}
                  </button>
                ))}
              </div>

              {/* The awkward part, kept behind its own tap. */}
              <div className="mt-8 rounded-xl border border-danger/20 p-4">
                <h3 className="flex items-center gap-2 text-sm font-medium text-white">
                  <Trash2 size={14} aria-hidden="true" className="text-danger" />
                  Delete this house
                </h3>

                {!danger ? (
                  <>
                    <p className="mt-2 text-xs leading-relaxed text-white/45">
                      For one entered by mistake. If the build is finished, mark it handed
                      over on the Today tab instead — that keeps the record, which is the
                      whole point of a site diary if anyone ever disputes what happened.
                    </p>
                    <button
                      type="button"
                      onClick={() => setDanger(true)}
                      className="mt-3 min-h-[40px] rounded-lg border border-danger/30 px-3.5 text-sm text-danger transition-colors hover:bg-danger/[0.08]"
                    >
                      I want to delete it
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">
                      This cannot be undone.
                      {going.length > 0
                        ? ` ${going.join(", ")} filed against this house ${goVerb} with it.`
                        : " Every stage on this house goes with it."}
                    </p>
                    <label
                      htmlFor="confirm-address"
                      className="mb-1.5 mt-3 block text-xs leading-relaxed text-white/45"
                    >
                      Type <span className="text-white">{address}</span> to confirm.
                    </label>
                    <input
                      id="confirm-address"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      autoComplete="off"
                      className="min-h-[48px] w-full rounded-lg border border-white/10 bg-dark px-4 text-white placeholder:text-white/25 focus:border-danger focus:outline-none"
                      placeholder={address}
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDanger(false);
                          setTyped("");
                        }}
                        className="min-h-[44px] flex-1 rounded-lg border border-white/12 text-sm text-white/70"
                      >
                        Keep it
                      </button>
                      <button
                        type="button"
                        onClick={destroy}
                        disabled={!matches || deleting}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-danger text-sm font-semibold text-white transition-opacity disabled:opacity-30"
                      >
                        {deleting && <Loader2 size={15} className="animate-spin" />}
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <footer
              className="flex flex-none gap-3 border-t border-white/[0.07] px-5 py-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              <button
                type="button"
                onClick={close}
                className="min-h-[52px] rounded-xl border border-white/12 px-4 text-sm text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || form.address.trim().length < 3}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-[15px] font-semibold text-dark transition-opacity disabled:opacity-35"
              >
                {saving && <Loader2 size={17} className="animate-spin" />}
                Save
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = `f-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="mb-3">
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
      >
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[48px] w-full rounded-lg border border-white/10 bg-dark px-4 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
      />
    </div>
  );
}
