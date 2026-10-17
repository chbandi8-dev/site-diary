"use client";

import { useEffect, useState } from "react";
import { toWhatsAppNumber } from "@/lib/phone";
import { sendOnWhatsApp } from "@/lib/whatsapp";
import { send as outboxSend } from "@/lib/outbox";
import { useRouter } from "next/navigation";
import { MessageCircle, Users, X } from "lucide-react";
import VoiceNote from "./VoiceNote";

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

/**
 * The on-site screen.
 *
 * Designed against the conditions rather than a desk: large targets because his
 * hands are dusty and the phone is in a rugged case, no drag gestures because
 * capacitive touch degrades when wet, and no free-text input anywhere — every
 * blank is a picker. A keyboard on a slab in the sun is the thing being
 * designed out.
 */
export default function QuickSend({
  houseId,
  stages,
  owners,
}: {
  houseId: string;
  stages: { id: string; name: string; status: string }[];
  /** For the WhatsApp hand-off — email goes automatically, this does not. */
  owners: { id: string; name: string; phone: string | null }[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState<Template | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [undo, setUndo] = useState<{ id: string; until: number } | null>(null);
  /**
   * What was just sent, kept so it can be handed to WhatsApp.
   *
   * WhatsApp cannot be sent from a server without a paid Business account, and
   * buying one to send twenty-five messages a week would be the most expensive
   * line in this product. Opening the app with the message already written
   * costs nothing and takes one tap — which is what he does today anyway,
   * except he has to type it.
   */
  const [lastSent, setLastSent] = useState<string | null>(null);
  /**
   * His own wording of the message in the sheet, once he has changed it. Null
   * means the template's words go out untouched.
   */
  const [edited, setEdited] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftKind, setDraftKind] = useState<"progress" | "delay" | "milestone">("progress");
  /**
   * Which stage this is about.
   *
   * Pre-filled with whatever is underway, because that is right almost every
   * time and an optional field nobody fills in is an empty column. He can
   * change it or clear it; nothing depends on it being set.
   */
  const [stageId, setStageId] = useState<string>(
    () => stages.find((s) => s.status === "in_progress")?.id ?? ""
  );

  useEffect(() => {
    fetch(`/api/pm/quick-send?houseId=${houseId}`)
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() =>
        setResult({
          ok: false,
          text: "Couldn't load the messages — looks like there's no signal here. Try again once you've got bars.",
        })
      );
  }, [houseId]);

  function start(t: Template) {
    setResult(null);
    setChoices({});
    setEdited(null);
    // Always open the sheet, even with nothing to fill in. He is sending prose
    // in his own voice to a client; he should see it first. Eight of these
    // otherwise sent irreversibly on one touch of a 64px button in a grid where
    // every button looks the same.
    setOpen(t);
  }

  /** The body as the owner will read it, with choices substituted live. */
  function preview(t: Template, chosen: Record<string, string>): string {
    return t.slots.reduce(
      (text, slot) => text.split(`{${slot.name}}`).join(chosen[slot.name] ?? `\u2026`),
      t.preview
    );
  }

  /**
   * Owners hear from him on WhatsApp. With exactly one owner and a mobile on
   * file the chat opens the moment the update is recorded, with the words
   * already in it. With several, each gets their own button — one tap records
   * the update once and opens that person's chat, and the others stay in the
   * row below for the next tap.
   */
  const soleOwner = owners.length === 1 && toWhatsAppNumber(owners[0].phone) ? owners[0] : null;
  const several = owners.length > 1;
  type Who = (typeof owners)[number] | "all";
  function toWhatsApp(message: string | null | undefined, who?: Who) {
    if (!message) return;
    if (who === "all") {
      void sendOnWhatsApp({ message, preferShareSheet: true });
      return;
    }
    const target = who ?? soleOwner;
    if (target) {
      void sendOnWhatsApp({
        message,
        phone: target.phone,
        preferShareSheet: !toWhatsAppNumber(target.phone),
      });
    }
  }

  /** One button per owner, for when there is more than one to tell. */
  function whoButtons(go: (who: Who) => void, disabled: boolean) {
    return (
      <div className="flex flex-col gap-2">
        {owners.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => go(o)}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-gold px-6 font-medium text-dark transition-opacity disabled:opacity-40"
          >
            <MessageCircle size={16} aria-hidden="true" />
            {sending ? "Sending…" : `Send to ${o.name.split(" ")[0]} on WhatsApp`}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => go("all")}
          className="min-h-[46px] w-full rounded-lg border border-white/15 px-6 text-sm text-white/70 hover:border-white/35 disabled:opacity-40"
        >
          Send to everyone — pick in WhatsApp
        </button>
      </div>
    );
  }

  async function send(t: Template, slots: Record<string, string>, who?: Who) {
    setSending(true);
    try {
      const outcome = edited
        ? await outboxSend(
            "/api/pm/updates",
            {
              houseId,
              body: edited,
              kind: t.kind,
              stageId: stageId || undefined,
              hold: !t.sendsImmediately,
            },
            t.label
          )
        : await outboxSend(
            "/api/pm/quick-send",
            {
              houseId,
              templateKey: t.key,
              slots,
              stageId: stageId || undefined,
            },
            t.label
          );

      if (!outcome.ok) {
        // Queued is not failed. The banner above says it is waiting, and the
        // form clears — retyping it later is exactly what this exists to stop.
        setResult({ ok: outcome.queued, text: outcome.error });
        if (outcome.queued) {
          setOpen(null);
        }
        return;
      }
      const data = outcome.data as { message: string; body?: string; published?: boolean; id: string };

      setResult({ ok: true, text: data.message });
      const sentText = edited ?? data.body ?? null;
      setLastSent(sentText);
      if (data.published) toWhatsApp(sentText, who);
      // Mis-taps on site are not rare, and there is no taking an email back
      // once the send job has run. The window is short but it covers the
      // "wrong house" moment, which is the one that actually happens.
      if (data.published) setUndo({ id: data.id, until: Date.now() + 12_000 });
      setOpen(null);
      router.refresh();
    } catch (cause) {
      setResult({ ok: false, text: cause instanceof Error ? cause.message : "That didn't send." });
    } finally {
      setSending(false);
    }
  }

  /** Sends an update he wrote or dictated, rather than one from a template. */
  async function sendDraft(hold: boolean, who?: Who) {
    if (!draft?.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const outcome = await outboxSend(
        "/api/pm/updates",
        {
          houseId,
          body: draft,
          kind: draftKind,
          stageId: stageId || undefined,
          hold,
        },
        "Your update"
      );

      if (!outcome.ok) {
        setResult({ ok: outcome.queued, text: outcome.error });
        if (outcome.queued) {
          setDraft(null);
        }
        return;
      }
      const data = outcome.data as { message: string; published?: boolean; id: string };

      setResult({ ok: true, text: data.message });
      setLastSent(draft);
      if (data.published) toWhatsApp(draft, who);
      if (data.published) setUndo({ id: data.id, until: Date.now() + 12_000 });
      setDraft(null);
      router.refresh();
    } catch (cause) {
      setResult({ ok: false, text: cause instanceof Error ? cause.message : "That didn't send." });
    } finally {
      setSending(false);
    }
  }

  async function undoSend() {
    if (!undo) return;
    await fetch(`/api/pm/updates/${undo.id}`, { method: "DELETE" });
    setUndo(null);
    setResult({ ok: true, text: "Pulled back. Nothing was sent." });
    router.refresh();
  }

  const categories = Array.from(new Set(templates.map((t) => t.category)));

  return (
    <div>
      {result && (
        <div
          role="status"
          className={
            "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm leading-relaxed " +
            (result.ok ? "bg-gold/15 text-gold" : "bg-red-500/15 text-danger")
          }
        >
          <span>{result.text}</span>
          {undo && Date.now() < undo.until && (
            <button
              type="button"
              onClick={undoSend}
              className="min-h-[36px] rounded-lg border border-gold/50 px-3 font-medium"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {/* The email has already gone. This is the same words, handed to
          WhatsApp, for the owners who would rather hear from him there —
          which, for a builder, is most of them. */}
      {lastSent && owners.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-white/35">
            Send on WhatsApp
          </span>
          {owners.map((o) => {
            const hasNumber = Boolean(toWhatsAppNumber(o.phone));
            const first = o.name.split(" ")[0];
            return (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  sendOnWhatsApp({
                    message: lastSent,
                    phone: o.phone,
                    preferShareSheet: !hasNumber,
                  })
                }
                title={
                  hasNumber
                    ? `Open WhatsApp with ${first}`
                    : `No mobile for ${first} — this opens the share sheet so you can pick them`
                }
                className={
                  "flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors " +
                  (hasNumber
                    ? "border-emerald-400/40 text-emerald-300 hover:border-emerald-400"
                    : "border-white/12 text-white/45 hover:border-white/30 hover:text-white/70")
                }
              >
                <MessageCircle size={13} aria-hidden="true" />
                {first}
              </button>
            );
          })}

          {/* One tap, then WhatsApp's own recipient list — where several chats
              can be ticked and sent at once. A web page cannot address two
              numbers with one link, and it cannot read his contacts on an
              iPhone, so handing the message to the share sheet is the only
              route to "both of them, and the site foreman too". */}
          {owners.length > 1 && (
            <button
              type="button"
              onClick={() => sendOnWhatsApp({ message: lastSent, preferShareSheet: true })}
              title="Opens WhatsApp's own list — tick as many chats as you like"
              className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/12 px-3 text-sm text-white/55 transition-colors hover:border-white/30 hover:text-white"
            >
              <Users size={13} aria-hidden="true" />
              Everyone
            </button>
          )}
        </div>
      )}

      {/* Optional, and pre-filled. Filing an update against the stage it belongs
          to is what lets a photo be found again in two years — and it costs him
          nothing, because it is already right when the board is up to date. */}
      {stages.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label
            htmlFor="qs-stage"
            className="font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
          >
            Filed under
          </label>
          <select
            id="qs-stage"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className="min-h-[38px] flex-1 rounded-lg border border-white/10 bg-dark px-3 text-sm text-white focus:border-gold focus:outline-none"
          >
            <option value="">Nothing in particular</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "in_progress" ? " (underway)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* He says what happened, and the words appear for him to read. */}
      <div className="mb-5">
        <VoiceNote houseId={houseId} onDraft={(body) => { setDraft(body); setResult(null); }} />
      </div>

      {draft !== null && (
        <div className="mb-6 rounded-lg border border-gold/40 bg-dark-card p-5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-gold">
              What they&apos;ll read — edit anything
            </p>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-sm text-white/45 hover:text-white"
            >
              Discard
            </button>
          </div>

          <label htmlFor="draft-body" className="sr-only">
            The update
          </label>
          <textarea
            id="draft-body"
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-dark px-4 py-3 leading-relaxed text-white focus:border-gold focus:outline-none"
          />

          <fieldset className="mt-4">
            <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
              What kind of news is it
            </legend>
            <div className="flex flex-wrap gap-2">
              {[
                { v: "progress", l: "Just progress" },
                { v: "milestone", l: "A milestone" },
                { v: "delay", l: "A delay" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setDraftKind(o.v as typeof draftKind)}
                  className={
                    "min-h-[42px] rounded-full border px-4 text-sm " +
                    (draftKind === o.v
                      ? "border-gold bg-gold/20 text-gold"
                      : "border-white/15 text-white/70")
                  }
                >
                  {o.l}
                </button>
              ))}
            </div>
          </fieldset>

          {/* A delay is a phone call first, whoever wrote the words. */}
          {draftKind === "delay" && (
            <p className="mt-3 text-xs leading-relaxed text-gold">
              Delays save as a draft. Ring them first, then send it from Recently below.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {several && draftKind !== "delay" ? (
              <div className="w-full">
                {whoButtons((who) => sendDraft(false, who), sending || !draft.trim())}
              </div>
            ) : (
            <button
              type="button"
              onClick={() => sendDraft(false)}
              disabled={sending || !draft.trim()}
              className="min-h-[50px] rounded-lg bg-gold px-6 font-medium text-dark disabled:opacity-40"
            >
              {sending
                ? "Sending…"
                : draftKind === "delay"
                  ? "Save as draft"
                  : soleOwner
                    ? `Send to ${soleOwner.name.split(" ")[0]} on WhatsApp`
                    : "Send to owners"}
            </button>
            )}
            {draftKind !== "delay" && (
              <button
                type="button"
                onClick={() => sendDraft(true)}
                disabled={sending}
                className="min-h-[50px] rounded-lg border border-white/15 px-5 text-white/70 hover:border-white/35"
              >
                Hold it for now
              </button>
            )}
          </div>
        </div>
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

            {/* The words as they will go out. Editable once the blanks below are
                chosen — before then there are still gaps in it. */}
            <div className="mb-5 rounded-lg bg-dark px-4 py-3.5">
              <label
                htmlFor="qs-text"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-white/35"
              >
                {open.slots.every((s) => choices[s.name])
                  ? "What they'll read — edit anything"
                  : "What they'll read — pick the details first"}
              </label>
              <textarea
                id="qs-text"
                rows={5}
                readOnly={!open.slots.every((s) => choices[s.name])}
                value={edited ?? preview(open, choices)}
                onChange={(e) => setEdited(e.target.value)}
                className="w-full resize-y rounded-lg border border-transparent bg-transparent text-sm leading-relaxed text-white/85 focus:border-gold focus:outline-none"
              />
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
                        onClick={() => {
                          setChoices((c) => ({ ...c, [slot.name]: option }));
                          // The blanks changed, so the words are rebuilt from them.
                          setEdited(null);
                        }}
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

            {several && open.sendsImmediately ? (
              whoButtons(
                (who) => send(open, choices, who),
                sending || open.slots.some((s) => !choices[s.name])
              )
            ) : (
            <button
              type="button"
              disabled={sending || open.slots.some((s) => !choices[s.name])}
              onClick={() => send(open, choices)}
              className="min-h-[52px] w-full rounded-lg bg-gold px-6 font-medium text-dark transition-opacity disabled:opacity-40"
            >
              {sending
                ? "Sending…"
                : !open.sendsImmediately
                  ? "Save as draft"
                  : soleOwner
                    ? `Send to ${soleOwner.name.split(" ")[0]} on WhatsApp`
                    : "Send to owners"}
            </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
