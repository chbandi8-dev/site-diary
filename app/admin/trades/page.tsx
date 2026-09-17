import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import Trades from "@/components/admin/Trades";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  await requireStaff();

  const trades = await prisma.trade.findMany({
    where: { archivedAt: null },
    orderBy: [{ trade: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, company: true, trade: true,
      phone: true, email: true, notes: true,
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/houses" className="text-sm text-white/45 hover:text-white">
        ← Houses
      </Link>

      <header className="mb-7 mt-4">
        <h1 className="font-display text-3xl text-white">Trades</h1>
        <p className="mt-2 max-w-prose leading-relaxed text-white/50">
          The people you ring. Add them once, and messaging one about a specific house
          becomes two taps with the address already written in.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/35">
          Nothing here is ever shown to a homeowner, and nothing is ever sent to a trade
          automatically — every message opens in WhatsApp for you to send yourself.
        </p>
      </header>

      <Trades trades={trades} />
    </div>
  );
}
