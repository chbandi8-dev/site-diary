"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import OfflineBar from "@/components/admin/OfflineBar";
import Assistant from "@/components/admin/Assistant";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-dark flex">
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 lg:pl-0">
        <AdminHeader
          onMenuClick={() => setSidebarOpen(true)}
        />
        <OfflineBar />
        {/* pb-28 keeps the floating "Say it" button from sitting on top of
            whatever is at the bottom of a page. */}
        <main className="flex-1 overflow-auto p-4 pb-28 sm:p-6 sm:pb-28">
          {children}
        </main>
        <Assistant />
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </SessionProvider>
  );
}
