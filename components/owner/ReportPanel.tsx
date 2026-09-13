"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
type Report = {
  id: string;
  kind: string;
  status: string;
  body: string;
  createdAt: string;
  replyBody: string | null;
  fromName: string;
};

type Viewer = { id: string; name: string; email: string | null } | null;

const KINDS = [
  {
    value: "question",
    label: "A question",
    hint: "Something you'd like explained — including anything in a photo that looks odd.",
  },
  {
    value: "issue",
    label: "Something looks wrong",
    hint: "Something you think needs fixing while the build is going on.",
  },
  {
    value: "maintenance",
    label: "Needs attention",
    hint: "Something that's come up since handover.",
  },
] as const;

const STATUS_LABEL: Record<string, string> = {
  submitted: "Sent",
  acknowledged: "Read by your builder",
  in_progress: "Being looked at",
  resolved: "Sorted",
  no_action_needed: "Answered",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function ReportPanel({
  viewer,
  reports,
}: {
  viewer: Viewer;
  reports: Report[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("question");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      let photoId: string | undefined;

      if (file) {
        const form = new FormData();
        form.append("file", file);
        const up = await fetch("/api/owner/photos", { method: "POST", body: form });
        if (!up.ok) throw new Error((await up.json()).error ?? "That photo wouldn't upload.");
        photoId = (await up.json()).photoId;
      }

      const res = await fetch("/api/owner/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body, photoId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't send.");

      setBody("");
      setFile(null);
      setSent(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-14 border-t border-text/10 pt-10">
      <h2 className="mb-2 font-display text-2xl tracking-tight">Tell your builder something</h2>
      <p className="mb-7 max-w-prose leading-relaxed text-text/65">
        Anything at all — a question, something that looks wrong in a photo, or something that
        needs attention. He&apos;ll see it straight away and you&apos;ll get a reply. Questions are
        answered within one business day; he&apos;s on site Monday to Friday.
      </p>

      {sent && (
        <div
          role="status"
          className="mb-6 border-l-[3px] border-accent-secondary bg-surface/50 px-4 py-3 text-sm leading-relaxed"
        >
          Sent. Your builder has been notified, and you&apos;ll see below when he&apos;s read it.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-6 border-l-[3px] border-accent-primary bg-surface/60 px-4 py-3 text-sm leading-relaxed"
        >
          {error}
        </div>
      )}

      {!viewer ? (
        <p className="border-l-[3px] border-accent-secondary bg-surface/50 px-4 py-3 leading-relaxed">
          Add your name and email above first, so your builder knows who to reply to.
        </p>
      ) : (
      <form onSubmit={submit} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-text/50">
            What is it
          </legend>
          {KINDS.map((k) => (
            <label
              key={k.value}
              className="flex cursor-pointer items-start gap-3 border border-text/10 bg-white px-4 py-3 has-[:checked]:border-accent-primary"
            >
              <input
                type="radio"
                name="report-kind"
                id={`report-kind-${k.value}`}
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="mt-1 accent-[rgb(var(--color-accent-primary))]"
              />
              <span>
                <span className="block font-medium">{k.label}</span>
                <span className="block text-sm leading-snug text-text/60">{k.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="report-body"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/50"
          >
            What have you noticed
          </label>
          <textarea
            id="report-body"
            required
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="There's a gap under the window frame in today's photo — is that meant to be there?"
            className="w-full border border-text/15 bg-white px-4 py-3 leading-relaxed focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="report-photo"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/50"
          >
            Add a photo (optional, but it helps)
          </label>
          <input
            id="report-photo"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:border file:border-text/15 file:bg-white file:px-4 file:py-2 file:text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={busy || body.trim().length === 0}
          className="self-start bg-accent-primary px-6 py-3.5 font-medium text-white transition-opacity disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send to your builder"}
        </button>
      </form>
      )}

      {reports.length > 0 && (
        <div className="mt-12">
          <h3 className="mb-5 font-display text-xl tracking-tight">What you&apos;ve raised</h3>
          <ol className="flex flex-col">
            {reports.map((r) => (
              <li key={r.id} className="border-t border-text/10 py-5">
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3">
                  <time className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/45">
                    {formatWhen(r.createdAt)}
                  </time>
                  <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-accent-primary">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <p className="max-w-prose leading-relaxed">{r.body}</p>
                <p className="mt-1 text-sm text-text/45">— {r.fromName}</p>
                {r.replyBody && (
                  <div className="mt-3 border-l-2 border-accent-secondary pl-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-text/45">
                      Your builder replied
                    </p>
                    <p className="mt-1 max-w-prose leading-relaxed">{r.replyBody}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
