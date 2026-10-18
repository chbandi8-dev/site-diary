"use client";

import { MessageCircle } from "lucide-react";
import { sendOnWhatsApp } from "@/lib/whatsapp";

/**
 * Today's list, handed to WhatsApp.
 *
 * The evening message goes by email, and an email can fail to arrive or sit
 * unread. This is the same list, one tap away on the screen it describes, for
 * sending to himself, a foreman or his wife. No number is given on purpose:
 * WhatsApp's own chooser opens, and he picks the chat.
 */
export default function ShareList({ message }: { message: string }) {
  return (
    <button
      type="button"
      onClick={() => sendOnWhatsApp({ message, preferShareSheet: true })}
      className="mt-4 flex min-h-[44px] items-center gap-2 rounded-lg border border-emerald-400/40 px-4 text-sm text-emerald-300 hover:border-emerald-400"
    >
      <MessageCircle size={14} aria-hidden="true" />
      Send this list on WhatsApp
    </button>
  );
}
