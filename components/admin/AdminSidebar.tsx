"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, LogOut, ChevronRight, X,
  HardHat, Inbox, CalendarCheck, Globe, Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two groups, not one list.
 *
 * Running the builds and editing the marketing website are different jobs on
 * different days, and mixing them buried the houses among testimonials. The
 * whole marketing CMS is now one entry with its own screen behind it: still one
 * click away, no longer competing for attention with the work he opens daily.
 */
const siteDiary = [
  { href: "/admin", icon: LayoutDashboard, label: "Today", exact: true },
  { href: "/admin/houses", icon: HardHat, label: "Houses" },
  { href: "/admin/reports", icon: Inbox, label: "From owners" },
  { href: "/admin/friday", icon: CalendarCheck, label: "Friday email" },
  { href: "/admin/broadcast", icon: Megaphone, label: "Tell everyone" },
];

const website = [{ href: "/admin/website", icon: Globe, label: "Website" }];

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  unreadCount?: number;
}

export default function AdminSidebar({ isOpen = true, onClose, unreadCount = 0 }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const renderItem = ({
    href,
    icon: Icon,
    label,
    exact,
  }: {
    href: string;
    icon: typeof LayoutDashboard;
    label: string;
    exact?: boolean;
  }) => {
    const active = isActive(href, exact);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "group flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-all",
          active
            ? "border border-gold/20 bg-gold/10 text-gold"
            : "text-white/50 hover:bg-white/5 hover:text-white"
        )}
      >
        <Icon size={16} className={active ? "text-gold" : ""} />
        <span className="flex-1">{label}</span>
        {label === "Website" && unreadCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-xs font-bold text-dark">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {active && <ChevronRight size={14} />}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {onClose && (
        <div
          className={cn(
            "fixed inset-0 bg-black/60 z-40 lg:hidden transition-opacity",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 w-64 bg-dark border-r border-white/5 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/5">
          <Link href="/" target="_blank" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gold flex items-center justify-center rounded-sm">
              <span className="text-dark font-display font-black text-base leading-none">B</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-none">Build Demo</div>
              <div className="text-gold text-xs mt-0.5">Admin Panel</div>
            </div>
          </Link>
          {onClose && (
            <button onClick={onClose} className="lg:hidden text-white/40 hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-6">
          <div className="space-y-1">
            {siteDiary.map((item) => renderItem(item))}
          </div>

          <div className="mt-8 border-t border-white/5 pt-6">
            <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.13em] text-white/25">
              Public site
            </p>
            <div className="space-y-1">{website.map((item) => renderItem(item))}</div>
          </div>
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm text-white/50 hover:text-red-400 hover:bg-red-400/5 transition-all"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
