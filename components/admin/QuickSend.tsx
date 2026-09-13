"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, X } from "lucide-react";
import { uploadPhoto } from "@/lib/capture/photo";

type Slot = { name: string; label: string; options: string[] };
type Template = {
  key: string;
  label: string;
  category: string;
  kind: string;
  slots: Slot[];
  wantsPhoto: boolean;
  sendsImmediately: boolean;
  preview: string;
};

type Attached = { id: string; name: string; state: "uploading" | "ready" | "failed" };

/**
 * The on-site screen.
 *
 * Designed against the conditions rather than a desk: large targets because his
 * hands are dusty and the phone is in a rugged case, no drag gestures because
 * capacitive touch degrades when wet, and no free-text input anywhere — every
 * blank is a picker. A keyboard on a slab in the sun is the thing being
 * designed out.
 *
 * Photos upload the moment they are taken, so the send is instant and a dropped
 * signal costs one photo rather than the whole update.
 */
export default function QuickSend({ houseId }: { houseId: string }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [photos, setPhotos] = useState<Attached[]>([]);
  const [open, setOpen] = useState<Template | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/pm/quick-send?houseId=${houseId}`)
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => setResult({ ok: false, text: "Couldn't load the messages. Pull to refresh." }));
  }, [houseId]);

  const addPhotos = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        const id = crypto.randomUUID();
        setPhotos((p) => [...p, { id, name: file.name, state: "uploading" }]);
        try {
          await uploadPhoto(houseId, file, { photoId: id, origin: "in_app" });
          setPhotos((p) => p.map((x) => (x.id === id ? { ...x, state: "ready" } : x)));
        } catch {
          setPhotos((p) => p.map((x) => (x.id === id ? { ...x, state: "failed" } : x)));
        }
      }
    },
    [houseId]
  );

  function start(t: Template) {
    setResult(null);
    if (t.slots.length === 0) {
      void send(t, {});
      return;
    }
    setChoices({});
    setOpen(t);
  }

  async function send(t: Template, slots: Record<string, string>) {
    setSending(true);
    try {
      const res = await fetch("/api/pm/quick-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseId,
          templateKey: t.key,
          slots,
          photoIds: photos.filter((p) => p.state === "ready").map((p) => p.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't send.");

      setResult({ ok: true, text: data.message });
      setPhotos([]);
      setOpen(null);
      router.refresh();
    } catch (cause) {
      setResult({ ok: false, text: cause instanceof Error ? cause.message : "That didn't send." });
    } finally {
      setSending(false);
    }
  }

  const categories = Array.from(new Set(templates.map((t) => t.category)));
  const readyCount = photos.filter((p) => p.state === "ready").length;

  return (
    <div>
      {result && (
        <div
          role="status"
          className={
            "mb-5 rounded-lg px-4 py-3 text-sm leading-relaxed " +
            (result.ok ? "bg-gold/15 text-gold" : "bg-red-500/15 text-red-300")
          }
        >
          {result.text}
        </div>
      )}

      {/* Photos first: he shoots, then says what happened. */}
      <label
        htmlFor="quick-photos"
        className="flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed border-white/15 px-5 py-7 text-white/70 transition-colors hover:border-gold/50 hover:text-white"
      >
        <Camera size={22} aria-hidden="true" />
        <span className="text-base font-medium">
          {readyCount > 0 ? `${readyCount} photo${readyCount === 1 ? "" : "s"} ready` : "Add photos"}
        </span>
      </label>
      <input
        id="quick-photos"
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="sr-only"
        onChange={(e) => e.target.files && addPhotos(e.target.files)}
      />

      {photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {photos.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-full bg-dark-lighter px-3 py-1.5 text-xs text-white/70"
            >
              {p.state === "uploading" && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
              {p.state === "ready" && <Check size={13} className="text-gold" aria-hidden="true" />}
              {p.state === "failed" && <X size={13} className="text-red-400" aria-hidden="true" />}
              <span className="max-w-[9rem] truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-9 flex flex-col gap-7">
        {categories.map((category) => (
          <section key={category}>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
              {category}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {templates
                .filter((t) => t.category === category)
                .map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => start(t)}
                    disabled={sending}
                    className="min-h-[64px] rounded-lg border border-white/10 bg-dark-card px-4 py-3.5 text-left transition-colors hover:border-gold/50 disabled:opacity-40"
                  >
                    <span className="block text-base font-medium text-white">{t.label}</span>
                    {!t.sendsImmediately && (
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
                        Saves as draft — call them first
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>

      {/* Slot picker. Options only — never a keyboard. */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 sm:items-center sm:justify-center">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-dark-card p-6 sm:max-w-md sm:rounded-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <h3 className="font-display text-xl text-white">{open.label}</h3>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Cancel"
                className="flex-none rounded-full p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {open.slots.map((slot) => (
              <fieldset key={slot.name} className="mb-6">
                <legend className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                  {slot.label}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {slot.options.map((option) => {
                    const selected = choices[slot.name] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setChoices((c) => ({ ...c, [slot.name]: option }))}
                        className={
                          "min-h-[44px] rounded-full border px-4 py-2 text-sm transition-colors " +
                          (selected
                            ? "border-gold bg-gold/20 text-gold"
                            : "border-white/15 text-white/75 hover:border-white/35")
                        }
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <button
              type="button"
              disabled={sending || open.slots.some((s) => !choices[s.name])}
              onClick={() => send(open, choices)}
              className="min-h-[52px] w-full rounded-lg bg-gold px-6 font-medium text-dark transition-opacity disabled:opacity-40"
            >
              {sending ? "Sending…" : open.sendsImmediately ? "Send to owners" : "Save as draft"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
