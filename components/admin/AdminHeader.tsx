"use client";

import { Menu, Bell, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";

interface AdminHeaderProps {
  onMenuClick?: () => void;
  title?: string;
  unreadCount?: number;
}

export default function AdminHeader({ onMenuClick, title = "Dashboard", unreadCount = 0 }: AdminHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="h-16 bg-dark border-b border-white/5 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-white/50 hover:text-white p-1"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-white font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />

        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-1.5 text-white/40 hover:text-gold text-xs transition-colors"
        >
          <ExternalLink size={13} />
          View Site
        </Link>

        {unreadCount > 0 && (
          <Link href="/admin/website/messages" className="relative text-white/40 hover:text-gold transition-colors">
            <Bell size={18} />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-gold text-dark text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </Link>
        )}

        <div className="flex items-center gap-2 pl-3 border-l border-white/10">
          <div className="w-7 h-7 bg-gold/10 border border-gold/30 rounded-sm flex items-center justify-center">
            <span className="text-gold text-xs font-bold">
              {session?.user?.name?.charAt(0) ?? session?.user?.email?.charAt(0) ?? "A"}
            </span>
          </div>
          <span className="text-white/60 text-sm hidden sm:block">
            {session?.user?.name ?? session?.user?.email}
          </span>
        </div>
      </div>
    </header>
  );
}
