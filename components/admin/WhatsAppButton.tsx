"use client";

import { useState } from "react";
import { Send, Users } from "lucide-react";
import { sendOnWhatsApp, canShareText } from "@/lib/whatsapp";
import { toWhatsAppNumber } from "@/lib/phone";

/**
 * One WhatsApp button, used everywhere.
 *
 * Two shapes, decided by whether a phone number is on file:
 *
 *  - With a number: straight into that person's chat.
 *  - Without one: the share sheet, which on an iPhone is the only way to reach
 *    his contact list. Safari gives a web page no access to the address book,
 *    so there is nothing to "import" — but the sheet lets him pick the person,
 *    or a group, from the real list, and that is the outcome he wanted.
 *
 * When both are possible it offers both, because "send to the owner" and "send
 * to whoever" are different jobs and he should not have to guess which the
 * button does.
 *
 * The message is on the clipboard before either route is taken, so a tap that
 * goes nowhere never costs him the words.
 */
export default function WhatsAppButton({
  message,
  phone,
  label = "Send on WhatsApp",
  chooseLabel = "Send to someone else",
  variant = "solid",
  className = "",
}: {
  message: string;
  phone?: string | null;
  label?: string;
  chooseLabel?: string;
  variant?: "solid" | "outline";
  className?: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const direct = Boolean(toWhatsAppNumber(phone));

  async function go(preferShareSheet: boolean) {
    setNote(null);
    const result = await sendOnWhatsApp({ message, phone, preferShareSheet });
    if (!result.ok) {
      setNote(
        result.copied
          ? "WhatsApp didn't open — the message is copied, paste it into a chat."
          : "WhatsApp didn't open. Copy the message and paste it into a chat."
      );
    }
  }

  const base =
    "flex min-h-[46px] items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors ";
  const solid = "bg-gold text-dark";
  const outline = "border border-white/15 text-white/75 hover:border-white/30 hover:text-white";

  return (
    <div className={"flex flex-wrap gap-2 " + className}>
      <button type="button" onClick={() => go(false)} className={base + (variant === "solid" ? solid : outline)}>
        <Send size={15} aria-hidden="true" />
        {direct ? label : chooseLabel}
      </button>

      {/* Only when a direct chat is possible AND choosing is too — otherwise
          the first button already is the picker. */}
      {direct && canShareText() && (
        <button type="button" onClick={() => go(true)} className={base + outline}>
          <Users size={15} aria-hidden="true" />
          {chooseLabel}
        </button>
      )}

      {note && (
        <p role="status" className="w-full text-xs leading-relaxed text-white/50">
          {note}
        </p>
      )}
    </div>
  );
}
