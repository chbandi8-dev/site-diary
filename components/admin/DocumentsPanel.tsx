"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Paperclip, X } from "lucide-react";

type Doc = {
  id: string;
  title: string;
  category: string;
  bytes: number | null;
  uploadedAt: string;
};

const CATEGORIES = [
  { value: "plans", label: "Plans" },
  { value: "permits", label: "Permits" },
  { value: "contract", label: "Contract" },
  { value: "certificates", label: "Certificates" },
  { value: "warranties", label: "Warranties" },
  { value: "other", label: "Other" },
];

function size(bytes: number | null): string {
  if (!bytes) return "";
  return bytes > 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(Math.round(bytes / 1000), 1)} KB`;
}

/**
 * Paperwork the owner is entitled to and currently has to ask for by text.
 *
 * The warning above the picker is not decoration. This shelf has no private
 * half, so the only thing standing between an internal quote and the client's
 * screen is him reading one line before he taps.
 */
export default function DocumentsPanel({
  houseId,
  documents,
}: {
  houseId: string;
  documents: Doc[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("plans");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const documentId = crypto.randomUUID();
      const res = await fetch("/api/pm/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          houseId,
          // Falling back to the filename means he can drop a file in without
          // typing anything, which is how this will mostly be used.
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          category,
          filename: file.name,
          contentType: file.type,
          bytes: file.size,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't upload.");
      const { uploadUrl } = await res.json();

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("The file didn't reach storage. Try again.");

      const confirmed = await fetch("/api/pm/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      if (!confirmed.ok) throw new Error((await confirmed.json()).error ?? "That didn't finish.");

      setTitle("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    await fetch(`/api/pm/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="mt-12">
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
        Documents
      </h2>

      <div className="rounded-lg border border-white/5 bg-dark-card p-5">
        <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-gold/80">
          <Paperclip size={13} className="mt-0.5 flex-none" aria-hidden="true" />
          Anything you put here is visible to the owner straight away. Keep quotes,
          margins and subbie paperwork out of it.
        </p>

        {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc-t" className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
              What to call it — blank uses the filename
            </label>
            <input
              id="doc-t"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Approved plans — Rev C"
              className="rounded-lg border border-white/10 bg-dark px-4 py-2.5 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={
                  "min-h-[38px] rounded-full border px-4 text-sm " +
                  (category === c.value
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-white/15 text-white/70 hover:border-white/35")
                }
              >
                {c.label}
              </button>
            ))}
          </div>

          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex min-h-[48px] items-center justify-center gap-2 self-start rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
          >
            <FileUp size={16} aria-hidden="true" />
            {busy ? "Uploading…" : "Choose a file"}
          </button>
          <p className="text-xs text-white/30">PDF, JPEG, PNG or WebP. Up to 25 MB.</p>
        </div>
      </div>

      {documents.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {documents.map((d) => (
            <li key={d.id} className="flex items-start gap-3 border-t border-white/5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/80">{d.title}</p>
                <p className="mt-0.5 text-xs text-white/40">
                  {CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category}
                  {size(d.bytes) && ` · ${size(d.bytes)}`} ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(d.id)}
                aria-label={`Remove ${d.title}`}
                className="flex-none rounded p-1.5 text-white/30 hover:bg-white/5 hover:text-white/70"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
