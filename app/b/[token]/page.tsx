import { notFound } from "next/navigation";
import { readBoard } from "@/lib/db/board";
import { redeemBoardToken, recordBoardVisit } from "@/lib/board/session";
import { CircleAlert, HardHat } from "lucide-react";

export const dynamic = "force-dynamic";

/** Nobody indexes a link that is a credential. */
export const metadata = {
  title: "Where the builds are up to",
  robots: { index: false, follow: false },
};

/**
 * The board, for whoever he sends the link to.
 *
 * One page, no sign-in, read-only. It answers the question he gets asked every
 * Monday by the people who are not homeowners — the builder he works for, the
 * developer running the estate — and it answers only that question. Everything
 * on this page comes through `lib/db/board.ts`, which is the list of what these
 * readers are entitled to see.
 *
 * Light on purpose, unlike the staff app: this is read once on somebody else's
 * phone, often outdoors, and it is the only screen in the product with no
 * theme toggle to fix it with.
 */
export default async function Board({ params }: { params: { token: string } }) {
  const access = await redeemBoardToken(params.token);
  if (!access) notFound();

  const board = await readBoard(access.developmentId);
  await recordBoardVisit(access.linkId);

  const behind = board.rows.filter((r) => r.behindDays !== null).length;

  // Grouped by phase, in build order, so the shape of the job reads at a
  // glance rather than as an alphabetical list of addresses.
  const groups = board.phases
    .map((phase) => ({ phase, rows: board.rows.filter((r) => r.phase === phase) }))
    .filter((g) => g.rows.length > 0);
  const unplaced = board.rows.filter((r) => !r.phase);

  return (
    <div className="min-h-screen bg-[#F4F3EF] text-[#201F1C]">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
        <header className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/40">
            {board.estate ?? "Current builds"}
          </p>
          <h1 className="mt-1 font-display text-3xl">Where everything is up to</h1>
          <p className="mt-2 text-sm leading-relaxed text-black/55">
            {board.rows.length} build{board.rows.length === 1 ? "" : "s"} underway
            {behind > 0
              ? ` · ${behind} behind ${behind === 1 ? "its" : "their"} programme`
              : " · all holding their dates"}
            . Updated as the work happens.
          </p>
        </header>

        {board.rows.length === 0 ? (
          <p className="rounded-xl border border-black/[0.08] bg-white px-5 py-8 text-center text-black/45">
            Nothing underway just now.
          </p>
        ) : (
          <div className="flex flex-col gap-7">
            {[...groups, ...(unplaced.length ? [{ phase: "Not started", rows: unplaced }] : [])].map(
              (group) => (
                <section key={group.phase}>
                  <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.13em] text-black/40">
                    {group.phase}
                    <span className="ml-2 text-black/25">{group.rows.length}</span>
                  </h2>

                  <ul className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
                    {group.rows.map((r, i) => (
                      <li
                        key={r.id}
                        className={
                          "flex items-start gap-3 px-5 py-4 " +
                          (i > 0 ? "border-t border-black/[0.06]" : "")
                        }
                      >
                        <HardHat
                          size={15}
                          aria-hidden="true"
                          className="mt-0.5 flex-none text-black/25"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {r.title}
                            {r.suburb && (
                              <span className="font-normal text-black/40"> · {r.suburb}</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-black/50">
                            {r.underway.length > 0
                              ? r.underway.join(" · ")
                              : "Nothing marked as underway"}
                          </p>
                          {r.lastUpdate && (
                            <p className="mt-1 text-xs text-black/35">
                              Last update{" "}
                              {new Date(r.lastUpdate).toLocaleDateString("en-AU", {
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                          )}
                        </div>

                        {r.behindDays !== null && (
                          <span className="flex flex-none items-center gap-1 rounded-full bg-[#B91C1C]/10 px-2.5 py-1 text-[11px] text-[#B91C1C]">
                            <CircleAlert size={11} aria-hidden="true" />
                            {r.behindDays}d
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            )}
          </div>
        )}

        <p className="mt-10 text-xs leading-relaxed text-black/35">
          A read-only view. It shows where the work is up to and nothing else — no
          owner details, no costs. Ask the site manager if you need anything more.
        </p>
      </div>
    </div>
  );
}
