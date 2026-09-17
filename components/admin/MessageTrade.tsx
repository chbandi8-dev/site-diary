"use client";

import { useState } from "react";
import { Camera, Check, Copy, MessageCircle, Users } from "lucide-react";
import { whatsAppLink } from "@/lib/phone";
import type { Trade } from "./Trades";

type Defect = { reference: string | null; location: string | null; description: string };
type Photo = { id: string; caption: string | null; url: string };

/**
 * Messaging a trade about this house, with the message already written.
 *
 * Every one of these is something he types out several times a week, on a
 * phone, usually one-handed, usually while walking. The address is the part he
 * gets wrong when he is doing five of them in a row — and "are you right for
 * Thursday" sent about the wrong house is worse than not sending it.
 *
 * It does not send. It opens WhatsApp with the text in place and he taps send
 * himself, which is both what he does today and the only thing possible without
 * a paid Business account. It also means he reads it once more before it goes.
 */
export default function MessageTrade({
  address,
  suburb,
  trades,
  underway,
  openDefects,
  photos,
}: {
  address: string;
  suburb: string | null;
  trades: Trade[];
  underway: string[];
  openDefects: Defect[];
  photos: Photo[];
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  /**
   * Sending a photo with the message.
   *
   * A wa.me link carries text and nothing else — there is no way to attach an
   * image to one, on any platform. The share sheet is the only route, and it
   * does take files on both iOS and Android.
   *
   * The trade-off is that the sheet chooses the app and the person, so it is
   * one more tap than the text-only path — and on some phones WhatsApp keeps
   * the image and drops the caption. The message is copied to the clipboard at
   * the same time for exactly that case: if it does not come through, it is
   * already waiting to be pasted.
   */
  async function shareWithPhoto() {
    if (!photo) return;
    setSharing(true);
    setShareError(null);

    try {
      // Copied first, so it is on the clipboard even if the share is cancelled.
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 6000);
      } catch {
        // Clipboard refused. The share may still carry the text.
      }

      const blob = await (await fetch(photo.url)).blob();
      const file = new File([blob], `${address.replace(/[^a-z0-9]+/gi, "-")}.jpg`, {
        type: blob.type || "image/jpeg",
      });

      const canShareFiles =
        typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      if (!canShareFiles) {
        setShareError(
          "This browser won't send a photo from a web page. Send the message, then attach the photo from your camera roll."
        );
        return;
      }

      await navigator.share({ files: [file], text: message });
    } catch (cause) {
      // A cancelled share sheet throws too, and is not worth an error message.
      if ((cause as { name?: string })?.name !== "AbortError") {
        setShareError("That didn't open. The message is on your clipboard either way.");
      }
    } finally {
      setSharing(false);
    }
  }

  const where = suburb ? `${address}, ${suburb}` : address;
  const stage = underway[0]?.toLowerCase();

  const templates = [
    {
      label: "Still right for tomorrow?",
      text: `Hi — are you still right to be at ${where} tomorrow? Let me know either way so I can move the others around if not.`,
    },
    {
      label: "When can you get there?",
      text: `Hi — when can you get to ${where}? ${
        stage ? `We're at ${stage} and ready for you.` : "Site's ready for you."
      } Give me a day and I'll work around it.`,
    },
    {
      label: "Hold off — wet",
      text: `Hi — hold off on ${where} for now, it's too wet to get anything done. I'll let you know as soon as it's right.`,
    },
    {
      label: "Access and parking",
      text: `Hi — for ${where}: park on the street, the site key is in the lockbox and I'll text you the code when you're on your way. Bins and toilet are on site.`,
    },
    {
      label: "Chasing an invoice",
      text: `Hi — can you send through your invoice for ${where} when you get a minute? I'll get it processed this week.`,
    },
    ...(openDefects.length > 0
      ? [
          {
            label: `Defects to fix (${openDefects.length})`,
            text: [
              `Hi — a few things to sort at ${where}:`,
              ``,
              ...openDefects.map(
                (d, i) =>
                  `${i + 1}. ${d.location ? `${d.location} — ` : ""}${d.description}`
              ),
              ``,
              `Let me know when you can get there.`,
            ].join("\n"),
          },
        ]
      : []),
  ];

  // The trade whose stage is underway first — the person he is most likely to
  // be messaging about this house today.
  const sorted = [...trades].sort((a, b) => {
    const relevant = (t: Trade) =>
      underway.some((s) => s.toLowerCase().includes(t.trade.toLowerCase().slice(0, 5))) ? 0 : 1;
    return relevant(a) - relevant(b) || a.name.localeCompare(b.name);
  });

  const picked = sorted.find((t) => t.id === chosen);
  const link = picked ? whatsAppLink(picked.phone, message) : null;

  if (trades.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Message a trade
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm text-white/50 underline underline-offset-4 hover:text-white"
        >
          {open ? "Close" : "Open"}
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-white/5 bg-dark-card p-5">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
            Who
          </p>
          <div className="mb-5 flex flex-wrap gap-2">
            {sorted.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setChosen(chosen === t.id ? null : t.id)}
                className={
                  "min-h-[40px] rounded-full border px-4 text-sm " +
                  (chosen === t.id
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-white/15 text-white/70 hover:border-white/35")
                }
              >
                {t.name}
                <span className="ml-1.5 text-xs opacity-60">{t.trade}</span>
              </button>
            ))}
          </div>

          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
            What
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setMessage(t.text)}
                className="min-h-[38px] rounded-full border border-white/15 px-4 text-sm text-white/70 hover:border-white/35"
              >
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Message"
            placeholder="Pick one above, or write your own — the address is already filled in for you."
            className="w-full rounded-lg border border-white/10 bg-dark px-4 py-3 leading-relaxed text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
          />

          {photos.length > 0 && (
            <>
              <p className="mb-2 mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                A photo with it — optional
              </p>
              <div className="mb-1 flex gap-2 overflow-x-auto pb-2">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPhoto(photo?.id === p.id ? null : p)}
                    aria-label={p.caption ?? "Photo of this house"}
                    aria-pressed={photo?.id === p.id}
                    className={
                      "relative h-20 w-20 flex-none overflow-hidden rounded-lg border-2 " +
                      (photo?.id === p.id ? "border-gold" : "border-transparent")
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                    {photo?.id === p.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-dark/50">
                        <Check size={18} className="text-gold" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-4">
            {shareError && (
              <p role="alert" className="mb-3 text-sm text-danger">{shareError}</p>
            )}
            {copied && (
              <p role="status" className="mb-3 flex items-center gap-1.5 text-sm text-gold">
                <Copy size={13} aria-hidden="true" />
                Message copied — paste it if WhatsApp only takes the photo.
              </p>
            )}

            {photo && picked ? (
              <button
                type="button"
                onClick={shareWithPhoto}
                disabled={sharing}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/90 px-6 font-medium text-dark hover:bg-emerald-400 disabled:opacity-40"
              >
                <Camera size={16} aria-hidden="true" />
                {sharing ? "Opening…" : "Send the photo and message"}
              </button>
            ) : link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/90 px-6 font-medium text-dark hover:bg-emerald-400"
              >
                <MessageCircle size={16} aria-hidden="true" />
                Open WhatsApp to {picked?.name.split(" ")[0]}
              </a>
            ) : (
              <p className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-sm text-white/35">
                <Users size={14} aria-hidden="true" />
                {!picked
                  ? "Pick who it's going to."
                  : `${picked.name} has no mobile saved — add one on the trades page.`}
              </p>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-white/30">
            {photo
              ? "Opens your phone's share sheet — pick WhatsApp, then the person. A photo can't go through a plain WhatsApp link, so this is the way round it."
              : "Opens WhatsApp with the message ready."}{" "}
            You still tap send, so you get one last read of it — and nothing is sent to a
            trade automatically, ever.
          </p>
        </div>
      )}
    </section>
  );
}
