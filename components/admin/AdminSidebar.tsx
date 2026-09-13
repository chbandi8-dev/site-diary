"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, FolderOpen, Wrench, FileText,
  MessageSquare, Star, Settings, LogOut, ChevronRight, X,
  HardHat, Inbox, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard", exact: true },
  // The owner update system. Placed above the marketing CMS because this is
  // the part he opens every day.
  { href: "/admin/houses", icon: HardHat, label: "Houses" },
  { href: "/admin/reports", icon: Inbox, label: "From owners" },
  { href: "/admin/friday", icon: CalendarCheck, label: "Friday email" },
  { href: "/admin/projects", icon: FolderOpen, label: "Projects" },
  { href: "/admin/services", icon: Wrench, label: "Services" },
  { href: "/admin/content", icon: FileText, label: "Site Content" },
  { href: "/admin/testimonials", icon: Star, label: "Testimonials" },
  { href: "/admin/messages", icon: MessageSquare, label: "Messages" },
];

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  unreadCount?: number;
}

export default function AdminSidebar({ isOpen = true, onClose, unreadCount = 0 }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

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
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map(({ href, icon: Icon, label, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-all group",
                  active
                    ? "bg-gold/10 text-gold border border-gold/20"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon size={16} className={active ? "text-gold" : ""} />
                <span className="flex-1">{label}</span>
                {label === "Messages" && unreadCount > 0 && (
                  <span className="bg-gold text-dark text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
                {active && <ChevronRight size={14} />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          <Link
            href="/admin/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all"
          >
            <Settings size={16} />
            Settings
          </Link>
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
