import { Check } from "lucide-react";
import AddDefect from "./AddDefect";

type Defect = {
  id: string;
  reference: string | null;
  location: string | null;
  description: string;
  status: string;
  raisedByOwner: boolean;
  resolvedAt: Date | null;
};

/**
 * The list from the walk-through, as the owner sees it.
 *
 * This is the tensest fortnight of the build: they have walked through with a
 * notepad, everything on it feels urgent, and they are about to release the
 * final payment. What settles it is not how fast the items get fixed — it is
 * being able to see that the list exists, that it is being worked down, and
 * that nothing they said has been quietly dropped.
 *
 * Their own items are marked as theirs. So are his, and that matters more than
 * it looks: an owner seeing six items the builder found before they did reads
 * the whole list differently.
 */
export default function Defects({
  defects,
  canAdd,
}: {
  defects: Defect[];
  /**
   * Whether this house is at the point where a walk-through list makes sense.
   * Offered with an empty list too — the first item is the one somebody is
   * standing in front of right now.
   */
  canAdd: boolean;
}) {
  if (defects.length === 0 && !canAdd) return null;

  const done = defects.filter((d) => d.status === "resolved");
  const outstanding = defects.filter((d) => d.status !== "resolved");
  const theirs = defects.filter((d) => d.raisedByOwner).length;

  return (
    <section className="mt-12">
      <h2 className="mb-1 font-display text-2xl tracking-tight">Your defects list</h2>
      <p className="mb-5 max-w-prose text-[15px] leading-relaxed text-text/65">
        {defects.length === 0
          ? "Nothing on the list yet. As you walk through, add anything you notice and it goes straight to your builder."
          : `${done.length} of ${defects.length} done.` +
            (theirs > 0 ? ` ${theirs} of these came from your walk-through` : "") +
            (theirs > 0 && defects.length - theirs > 0
              ? ", the rest we picked up ourselves."
              : ".")}
      </p>

      {outstanding.length > 0 && (
        <ul className="flex flex-col">
          {outstanding.map((d) => (
            <li key={d.id} className="flex items-start gap-3 border-t border-text/10 py-3">
              <span className="mt-0.5 w-5 flex-none font-mono text-xs text-text/40">
                {d.reference}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{d.description}</p>
                <p className="mt-0.5 text-sm text-text/50">
                  {d.location && `${d.location} · `}
                  {d.status === "in_progress"
                    ? "being fixed now"
                    : d.status === "disputed"
                      ? "we'd like to talk this one through with you"
                      : "not started yet"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className={outstanding.length > 0 ? "mt-7" : ""}>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.13em] text-text/45">
            Done
          </h3>
          <ul className="flex flex-col">
            {done.map((d) => (
              <li key={d.id} className="flex items-start gap-3 border-t border-text/10 py-3">
                <Check size={15} aria-hidden="true" className="mt-0.5 flex-none text-accent-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-text/55">{d.description}</p>
                  <p className="mt-0.5 text-sm text-text/40">
                    {d.location && `${d.location} · `}
                    {d.resolvedAt &&
                      `finished ${d.resolvedAt.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "long",
                      })}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canAdd && <AddDefect />}
    </section>
  );
}
