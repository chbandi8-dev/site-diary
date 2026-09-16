import Link from "next/link";
import { requireStaff } from "@/lib/auth-guard";
import Broadcast from "@/components/admin/Broadcast";

export const dynamic = "force-dynamic";

/**
 * Its own page, away from any one house.
 *
 * Sending to everybody is rare and consequential, and it should never be one
 * mistap away from sending to one owner.
 */
export default async function BroadcastPage() {
  await requireStaff();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin" className="text-sm text-white/45 hover:text-white">
        ← Today
      </Link>

      <header className="mb-7 mt-4">
        <h1 className="font-display text-3xl text-white">Tell everyone</h1>
        <p className="mt-2 max-w-prose leading-relaxed text-white/50">
          One message to every house at once — the Christmas shutdown, a heat
          stand-down, a week of rain. It lands on each owner&apos;s timeline and is
          emailed to anyone signed up, exactly like any other update.
        </p>
      </header>

      <Broadcast />
    </div>
  );
}
