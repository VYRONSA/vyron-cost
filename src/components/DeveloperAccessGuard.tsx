"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isClientWorkspaceMode } from "@/lib/vyron-developer-client";

export default function DeveloperAccessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState<boolean | null>(null);

  useEffect(() => {
    if (isClientWorkspaceMode()) {
      setBlocked(true);
      router.replace("/dashboard");
      return;
    }
    setBlocked(false);
  }, [router]);

  if (blocked === null) return null;

  if (blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md rounded-[2rem] border border-violet-100 bg-white p-8 text-center shadow-lg">
          <h1 className="text-2xl font-black text-slate-950">Access denied</h1>
          <p className="mt-3 text-sm font-semibold text-slate-600">Developer access only.</p>
          <Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-black text-white">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
