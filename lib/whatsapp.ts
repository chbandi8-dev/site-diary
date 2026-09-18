/**
 * Getting into WhatsApp from an app installed on a home screen.
 *
 * The buttons looked right and did nothing, and the reason is not obvious: an
 * anchor with target="_blank" inside an iOS standalone PWA is silently
 * swallowed. No new tab, no error, no navigation — the tap simply disappears.
 * Safari in a normal tab opens it fine, which is why it tested clean and
 * failed in his hand.
 *
 * So every WhatsApp route in the app now goes through here, and here does
 * three things in order:
 *
 * 1. Puts the message on the clipboard FIRST. Whatever happens next, the words
 *    are not lost — he can paste them into any chat himself. This is the
 *    difference between a failure that costs a tap and one that costs the
 *    message he just dictated.
 * 2. Offers the share sheet when the browser has one. On an iPhone this is the
 *    only way to reach his actual contact list: tap, pick WhatsApp, pick the
 *    person or the group. There is no contacts API on iOS — Safari will not
 *    give a web page the address book — so the share sheet is not a fallback
 *    here, it IS the feature.
 * 3. Navigates in the current window rather than a new one when running
 *    standalone. wa.me is a universal link; iOS hands it to the WhatsApp app
 *    and brings him back afterwards.
 */

import { whatsAppLink } from "@/lib/phone";

/** Installed to the home screen, where target="_blank" goes nowhere. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

/** Whether the share sheet can carry plain text — the "send to anyone" route. */
export function canShareText(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Refused in some embedded browsers, and not worth failing over — the
    // share sheet or the link may still carry it.
    return false;
  }
}

export type WhatsAppOutcome =
  | { ok: true; how: "shared" | "opened"; copied: boolean }
  | { ok: false; copied: boolean; reason: string };

/**
 * Hand a message to WhatsApp.
 *
 * With a phone number it opens that person's chat directly. Without one it
 * opens the share sheet so he can pick anybody — which is the only way to
 * reach the contact list on an iPhone.
 */
export async function sendOnWhatsApp(opts: {
  message: string;
  /** A number from his own records. Omit to let him choose the recipient. */
  phone?: string | null;
  /** Falls back to the share sheet when the number gives no usable link. */
  preferShareSheet?: boolean;
}): Promise<WhatsAppOutcome> {
  const { message, phone, preferShareSheet } = opts;
  const copied = await copy(message);
  const link = whatsAppLink(phone, message);

  // No number, or he asked to choose: the share sheet is the contact picker.
  if ((!link || preferShareSheet) && canShareText()) {
    try {
      await navigator.share({ text: message });
      return { ok: true, how: "shared", copied };
    } catch (cause) {
      // A cancelled sheet throws AbortError and is not a failure worth saying
      // anything about.
      if ((cause as { name?: string })?.name === "AbortError") {
        return { ok: true, how: "shared", copied };
      }
      // Anything else falls through to the link below.
    }
  }

  const target = link ?? `https://wa.me/?text=${encodeURIComponent(message)}`;

  if (isStandalone()) {
    // Same window. A new one never opens here, and the tap is lost.
    window.location.href = target;
    return { ok: true, how: "opened", copied };
  }

  const opened = window.open(target, "_blank", "noopener,noreferrer");
  if (!opened) {
    // Pop-up blocked, or an in-app browser that refuses new windows.
    window.location.href = target;
  }
  return { ok: true, how: "opened", copied };
}
