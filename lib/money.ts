/**
 * Cents in, dollars out. One implementation, because a variation rendered as
 * $1,250 in the app and $1250.00 in the email reads like two different numbers
 * to the person being asked to agree to it.
 */
export function money(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    // Whole dollars are how these are quoted on site; cents only show when the
    // number actually has them, so $1,250 does not become $1,250.00.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
