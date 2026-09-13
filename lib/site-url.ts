/**
 * The public base URL, resolved once and loudly.
 *
 * Every owner-facing link is built from this: the WhatsApp link he pastes, and
 * the link in every email. A missing value used to fall back to
 * `http://localhost:3000`, which would have sent every owner tapping their
 * link to their own machine, and to an empty string in emails, producing
 * "See the photos: /my". Both fail quietly and look like the product is broken.
 */
export function siteUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. Owner links and email links are built " +
        "from it, so they would point nowhere."
    );
  }
  return base.replace(/\/$/, "");
}
