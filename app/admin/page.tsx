export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import Link from "next/link";
import { FolderOpen, Wrench, MessageSquare, Star, Plus, ArrowRight, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default async function AdminDashboard() {
  await requireStaff();
  const [projectCount, serviceCount, unreadMessages, testimonialCount, recentMessages] = await Promise.all([
    prisma.project.count(),
    prisma.service.count(),
    prisma.message.count({ where: { read: false } }),
    prisma.testimonial.count(),
    prisma.message.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const stats = [
    { label: "Projects", value: projectCount, icon: FolderOpen, href: "/admin/projects", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
    { label: "Services", value: serviceCount, icon: Wrench, href: "/admin/services", color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/20" },
    { label: "Unread Messages", value: unreadMessages, icon: MessageSquare, href: "/admin/messages", color: "text-gold", bg: "bg-gold/10 border-gold/20" },
    { label: "Testimonials", value: testimonialCount, icon: Star, href: "/admin/testimonials", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  ];

  const quickActions = [
    { label: "Add Project", href: "/admin/projects/new", icon: Plus },
    { label: "Edit Homepage", href: "/admin/content", icon: TrendingUp },
    { label: "View Messages", href: "/admin/messages", icon: MessageSquare },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome */}
      <div>
        <h2 className="font-display font-bold text-2xl text-white mb-1">Dashboard</h2>
        <p className="text-white/40 text-sm">Overview of your website content</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, href, color, bg }) => (
          <Link
            key={label}
            href={href}
            className="bg-dark-lighter border border-white/5 hover:border-white/10 rounded-sm p-5 transition-all group"
          >
            <div className={`w-10 h-10 rounded-sm border flex items-center justify-center mb-4 ${bg}`}>
              <Icon size={18} className={color} />
            </div>
            <div className={`text-3xl font-display font-bold mb-1 ${color}`}>{value}</div>
            <div className="text-white/40 text-xs flex items-center gap-1 group-hover:text-white/60 transition-colors">
              {label}
              <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Messages */}
        <div className="lg:col-span-2 bg-dark-lighter border border-white/5 rounded-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-semibold">Recent Messages</h3>
            <Link href="/admin/messages" className="text-gold text-xs hover:underline">View all</Link>
          </div>
          {recentMessages.length > 0 ? (
            <div className="space-y-3">
              {recentMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-3 p-3 bg-dark rounded-sm border border-white/5">
                  <div className="w-8 h-8 bg-gold/10 border border-gold/20 rounded-sm flex items-center justify-center flex-shrink-0">
                    <span className="text-gold text-xs font-bold">{msg.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{msg.name}</span>
                      {!msg.read && <span className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />}
                    </div>
                    <p className="text-white/40 text-xs truncate">{msg.message}</p>
                    <p className="text-white/20 text-xs mt-0.5">{formatDate(msg.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/30 text-sm text-center py-8">No messages yet</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-dark-lighter border border-white/5 rounded-sm p-6">
          <h3 className="text-white font-semibold mb-5">Quick Actions</h3>
          <div className="space-y-3">
            {quickActions.map(({ label, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className="flex items-center gap-3 p-3 bg-dark rounded-sm border border-white/5 hover:border-gold/20 text-white/60 hover:text-white transition-all group"
              >
                <div className="w-8 h-8 bg-gold/5 border border-gold/10 group-hover:bg-gold/10 group-hover:border-gold/20 rounded-sm flex items-center justify-center transition-all">
                  <Icon size={15} className="text-gold" />
                </div>
                <span className="text-sm">{label}</span>
                <ArrowRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-white/20 text-xs mb-2">Site Preview</p>
            <Link
              href="/"
              target="_blank"
              className="block text-center border border-white/10 hover:border-gold/30 text-white/50 hover:text-gold py-2 rounded-sm text-xs transition-all"
            >
              Open Website ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
