import Link from "next/link";

export const dynamic = "force-dynamic";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-text/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/my" className="font-display text-lg tracking-tight">
            Your build
          </Link>
          <Link
            href="/my/sign-out"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-text/45 hover:text-text"
          >
            Sign out
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
