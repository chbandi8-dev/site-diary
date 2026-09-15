import { CloudRain } from "lucide-react";

type WetDay = { id: string; date: Date; note: string | null };

/**
 * Why the dates move.
 *
 * "Is my house going to be late?" is the question underneath most owner
 * anxiety, and a list of specific days answers it better than any paragraph.
 * An owner who watched it rain for a week and then sees those exact days here
 * stops wondering whether they are being managed.
 *
 * The wording is careful on purpose. It says what was lost and nothing more:
 * no promise that the time has been absorbed, and no claim that the handover
 * date is unaffected. Reassurance written here would be quoted back at him in
 * the extension-of-time claim these same days support.
 */
export default function WetDays({ days }: { days: WetDay[] }) {
  if (days.length === 0) return null;

  const recent = days.slice(0, 8);

  return (
    <section className="mt-12">
      <h2 className="mb-1 font-display text-2xl tracking-tight">Days lost to weather</h2>
      <p className="mb-5 max-w-prose text-[15px] leading-relaxed text-text/65">
        {days.length === 1
          ? "One day so far where the weather stopped work on your site."
          : `${days.length} days so far where the weather stopped work on your site.`}{" "}
        We log them as they happen so you can see exactly where the time has gone.
      </p>

      <ul className="flex flex-col">
        {recent.map((d) => (
          <li key={d.id} className="flex flex-wrap items-baseline gap-x-4 border-t border-text/10 py-3">
            <span className="w-32 flex-none text-[15px]">
              {d.date.toLocaleDateString("en-AU", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
            <span className="min-w-0 flex-1 text-[15px] text-text/65">
              {d.note ?? "No work on site"}
            </span>
          </li>
        ))}
      </ul>

      {days.length > recent.length && (
        <p className="mt-3 flex items-center gap-2 text-sm text-text/50">
          <CloudRain size={14} aria-hidden="true" />
          and {days.length - recent.length} more earlier in the build.
        </p>
      )}
    </section>
  );
}
