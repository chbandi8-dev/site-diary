import { getBuilder } from "@/lib/db/owner";

export const dynamic = "force-dynamic";

export default async function NoAccess() {
  const builder = await getBuilder();

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-text/45">
        {builder.name ?? "Your build"}
      </p>
      <h1 className="mb-4 font-display text-[clamp(1.9rem,6vw,2.5rem)] leading-[1.08] tracking-tight">
        This link isn&apos;t working
      </h1>
      <p className="leading-relaxed text-text/65">
        It may have been replaced with a newer one, or it might be missing a few characters — links
        sometimes get cut short when they&apos;re forwarded.
      </p>

      {/*
        The page previously said "ask your builder for a new link" without
        naming them or giving a number, so the one thing it told people to do
        was the one thing they could not do.
      */}
      <p className="mt-4 leading-relaxed text-text/65">
        {builder.phone ? (
          <>
            Give {builder.name ?? "your builder"} a call on{" "}
            <a href={`tel:${builder.phone.replace(/\s/g, "")}`} className="underline underline-offset-4">
              {builder.phone}
            </a>{" "}
            and they&apos;ll send a fresh one. It takes them one tap.
          </>
        ) : (
          <>Ask your builder to send you a fresh link — it takes them one tap.</>
        )}
      </p>
    </main>
  );
}
