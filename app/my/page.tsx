import { redirect } from "next/navigation";
import Link from "next/link";
import { getMyHouses } from "@/lib/db/owner";

export const dynamic = "force-dynamic";

/**
 * Most owners have exactly one house, so send them straight to it rather than
 * making them tap through a list of one.
 */
export default async function MyBuilds() {
  const houses = await getMyHouses();

  if (houses.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="mb-3 font-display text-3xl tracking-tight">Nothing here yet</h1>
        <p className="max-w-prose leading-relaxed text-text/65">
          Your builder hasn&apos;t linked a build to this email address yet. If you think that&apos;s
          wrong, give them a call — it takes them a minute to fix.
        </p>
      </main>
    );
  }

  if (houses.length === 1) redirect(`/my/${houses[0].id}`);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="mb-8 font-display text-3xl tracking-tight">Your builds</h1>
      <ul className="flex flex-col gap-3">
        {houses.map((h) => (
          <li key={h.id}>
            <Link
              href={`/my/${h.id}`}
              className="block border border-text/10 bg-white px-5 py-4 transition-colors hover:border-accent-primary"
            >
              <span className="font-display text-xl tracking-tight">{h.address}</span>
              {h.suburb && <span className="block text-sm text-text/55">{h.suburb}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
