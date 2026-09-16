/**
 * Australian mobile numbers, normalised for a wa.me link.
 *
 * WhatsApp wants digits only, with the country code and no leading zero.
 * He will type it however it sits in his phone — 0412 345 678,
 * +61 412 345 678, (02) 9876 5432 — and all of those have to work, because
 * the alternative is a link that silently opens a chat with nobody.
 */
export function toWhatsAppNumber(input: string | null | undefined): string | null {
  if (!input) return null;

  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;

  // Already international.
  if (digits.startsWith("+")) {
    const bare = digits.slice(1);
    return bare.length >= 8 ? bare : null;
  }
  if (digits.startsWith("61") && digits.length >= 10) return digits;

  // Australian domestic: drop the trunk zero and add the country code.
  if (digits.startsWith("0") && digits.length === 10) return `61${digits.slice(1)}`;

  // A bare mobile without the leading zero.
  if (digits.startsWith("4") && digits.length === 9) return `61${digits}`;

  // Anything else is left alone rather than guessed at — an invented country
  // code opens a chat with a stranger.
  return digits.length >= 10 ? digits : null;
}

/** The link that opens WhatsApp with the message already written. */
export function whatsAppLink(phone: string | null | undefined, message: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
