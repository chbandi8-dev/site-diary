export const dynamic = "force-dynamic";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg text-text">{children}</div>;
}
