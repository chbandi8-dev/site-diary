"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createOwnerBrowserClient } from "@/lib/supabase/client";

export default function SignOut() {
  const router = useRouter();

  useEffect(() => {
    createOwnerBrowserClient()
      .auth.signOut()
      .then(() => {
        router.push("/my/sign-in");
        router.refresh();
      });
  }, [router]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <p className="text-text/65">Signing you out…</p>
    </main>
  );
}
