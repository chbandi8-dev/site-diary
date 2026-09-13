import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Server-side guard for staff pages.
 *
 * The middleware matcher already covers /admin, but a routing regex is a poor
 * single point of failure for an entire surface — one that omitted the bare
 * "/admin" path served the dashboard, and its list of customer enquiries, to
 * the public. Call this in the page as well so a matcher mistake costs nothing.
 */
export async function requireStaff(): Promise<{ id: string; role?: string }> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect("/admin/login");
  return { id: user.id, role: user.role };
}
