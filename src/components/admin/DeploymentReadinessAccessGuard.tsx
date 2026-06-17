"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isClientWorkspaceMode } from "@/lib/vyron-developer-client";
import { readWorkspaceSession } from "@/lib/vyron-workspace-session";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export default function DeploymentReadinessAccessGuard({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isClientWorkspaceMode()) {
      setBlocked(false);
      return;
    }

    const session = readWorkspaceSession();
    if (session && sessionHasPermission(session, "admin.company")) {
      setBlocked(false);
      return;
    }

    setBlocked(true);
  }, []);

  if (blocked === null) return null;

  if (blocked) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-[#0F172A]">Access denied</h1>
          <p className="mt-3 text-sm font-medium text-[#64748B]">
            Deployment readiness is available to platform developers and workspace administrators only.
          </p>
          <Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-[#7C3AED] px-5 py-2.5 text-sm font-bold text-white">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
