export const dynamic = "force-dynamic";

export default function NoAccess() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-text/45">
        Your build
      </p>
      <h1 className="mb-4 font-display text-[clamp(1.9rem,6vw,2.5rem)] leading-[1.08] tracking-tight">
        This link isn&apos;t working
      </h1>
      <p className="leading-relaxed text-text/65">
        It may have been replaced with a newer one, or it might be missing a few characters — links
        sometimes get cut short when they&apos;re forwarded.
      </p>
      <p className="mt-4 leading-relaxed text-text/65">
        Ask your builder to send you a fresh link. It takes them one tap, and the new one will keep
        working from then on.
      </p>
    </main>
  );
}
