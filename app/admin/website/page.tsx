import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { FolderOpen, Wrench, FileText, Star, MessageSquare, ArrowRight, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * The public website, kept apart from the builds.
 *
 * Everything here is marketing: what a stranger sees before they are a client.
 * It used to sit in the same list as the houses, which meant the first screen
 * of the morning offered testimonials next to owners waiting on answers. It is
 * a real job, just not a daily one, so it gets its own door.
 */
export default async function WebsiteHub() {
  await requireStaff();

  const [projects, services, testimonials, unread, messages] = await Promise.all([
    prisma.project.count(),
    prisma.service.count(),
    prisma.testimonial.count(),
    prisma.message.count({ where: { read: false } }),
    prisma.message.count(),
  ]);

  const sections = [
    {
      href: "/admin/website/messages",
      icon: MessageSquare,
      title: "Enquiries",
      blurb: "Contact form submissions from the public site.",
      count: messages === 0 ? "None yet" : `${messages} total`,
      badge: unread > 0 ? `${unread} unread` : null,
    },
    {
      href: "/admin/website/content",
      icon: FileText,
      title: "Page content",
      blurb: "Headlines, the about text, phone number and address.",
      count: "Homepage and contact details",
      badge: null,
    },
    {
      href: "/admin/website/projects",
      icon: FolderOpen,
      title: "Projects",
      blurb: "Completed builds shown in the portfolio.",
      count: projects === 0 ? "None yet" : `${projects} published`,
      badge: null,
    },
    {
      href: "/admin/website/services",
      icon: Wrench,
      title: "Services",
      blurb: "What the business offers, listed on the services page.",
      count: services === 0 ? "None yet" : `${services} listed`,
      badge: null,
    },
    {
      href: "/admin/website/testimonials",
      icon: Star,
      title: "Testimonials",
      blurb: "Client quotes shown on the homepage.",
      count: testimonials === 0 ? "None yet" : `${testimonials} published`,
      badge: null,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-white">Website</h1>
        <p className="mt-1 max-w-prose text-white/45">
          The public marketing site — separate from the builds. Nothing here is visible
          to the homeowners on their build pages.
        </p>
        <Link
          href="/"
          target="_blank"
          className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={13} aria-hidden="true" />
          Open the website
        </Link>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ href, icon: Icon, title, blurb, count, badge }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full flex-col rounded-lg border border-white/5 bg-dark-card p-5 transition-colors hover:border-white/15"
            >
              <div className="flex items-center gap-3">
                <Icon size={16} aria-hidden="true" className="text-white/30" />
                <h2 className="flex-1 text-white">{title}</h2>
                {badge && (
                  <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[10px] text-gold">
                    {badge}
                  </span>
                )}
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-white/45">{blurb}</p>
              <p className="mt-4 flex items-center gap-1 text-xs text-white/35 group-hover:text-white/60">
                {count}
                <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
