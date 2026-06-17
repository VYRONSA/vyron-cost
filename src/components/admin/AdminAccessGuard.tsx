"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readWorkspaceSession } from "@/lib/vyron-workspace-session";
import { hasAdminAccess } from "@/lib/vyron-workspace-permissions";
import { isClientWorkspaceMode, readActiveClient } from "@/lib/vyron-developer-client";

export default function AdminAccessGuard({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isClientWorkspaceMode()) {
      setAllowed(false);
      return;
    }

    const session = readWorkspaceSession();
    setAllowed(Boolean(session && hasAdminAccess(session.role)));
  }, []);

  if (allowed === null) return null;

  if (!allowed) {
    return (
      <div className="rounded-[2rem] border border-violet-100 bg-white p-8 text-center shadow-lg">
        <h1 className="text-2xl font-black text-slate-950">Admin access required</h1>
        <p className="mt-3 text-sm font-semibold text-slate-600">
          Company setup, user management and imports are available to OWNER, ADMIN and SUPERVISOR roles only.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-black text-white">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
