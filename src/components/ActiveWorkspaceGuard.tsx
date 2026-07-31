"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { readActiveClient } from "@/lib/vyron-developer-client";
import ActiveClientBanner from "@/components/ActiveClientBanner";

export default function ActiveWorkspaceGuard() {
  const [hasClient, setHasClient] = useState<boolean | null>(null);

  useEffect(() => {
    setHasClient(Boolean(readActiveClient()));
  }, []);

  if (hasClient === null) return null;

  return (
    <div className="mb-6 space-y-4">
      {hasClient ? (
        <ActiveClientBanner />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-[var(--vyron-warning-fg)]" size={22} />
            <div>
              <div className="text-sm font-black text-fuchsia-950">
                Select a client workspace before processing transactions.
              </div>
              <div className="text-xs font-semibold text-[var(--vyron-warning-fg)]">
                Use Developer Centre → Login As Client, then return to the app.
              </div>
            </div>
          </div>
          <Link
            href="/developer/clients"
            className="rounded-xl bg-[var(--vyron-warning-solid)] px-4 py-2 text-xs font-black text-white"
          >
            Client Directory
          </Link>
        </div>
      )}
    </div>
  );
}
