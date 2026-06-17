"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, LogOut } from "lucide-react";
import {
  exitClientWorkspace,
  isPlatformAdminImpersonating,
  readActiveClient,
  type ActiveClient,
} from "@/lib/vyron-developer-client";

/**
 * Developer-only impersonation controls. Never shown in the client-facing VYRON COST shell.
 */
export default function ClientWorkspaceTopBar() {
  const [client, setClient] = useState<ActiveClient | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);

  useEffect(() => {
    function refresh() {
      setClient(readActiveClient());
      setPlatformAdmin(isPlatformAdminImpersonating());
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("vyron-active-client-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("vyron-active-client-changed", refresh);
    };
  }, []);

  if (!platformAdmin || !client) return null;

  return (
    <div className="border-b border-violet-200 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <Building2 size={18} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-100">
              Client workspace · impersonation mode
            </div>
            <div className="text-sm font-black">{client.companyName}</div>
            <div className="text-xs font-semibold text-violet-100">
              {client.ownerEmail || "Owner"} · Workspace {client.id}
              {client.ownerUserId ? ` · Auth ${client.ownerUserId.slice(0, 8)}…` : ""}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              exitClientWorkspace();
              setClient(null);
              window.location.href = "/developer";
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-violet-800"
          >
            <LogOut size={14} />
            Return to VYRON DEV
          </button>
          <button
            type="button"
            onClick={() => {
              exitClientWorkspace();
              setClient(null);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-black text-white"
          >
            Exit Client
          </button>
          <Link
            href="/developer/clients"
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-black text-white"
          >
            Client Directory
          </Link>
        </div>
      </div>
    </div>
  );
}
