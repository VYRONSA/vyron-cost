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

export default function ActiveClientBanner() {
  const [client, setClient] = useState<ActiveClient | null>(null);

  useEffect(() => {
    function refresh() {
      setClient(readActiveClient());
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("vyron-active-client-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("vyron-active-client-changed", refresh);
    };
  }, []);

  if (!client || !isPlatformAdminImpersonating()) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-5 py-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-700 text-white">
          <Building2 size={20} />
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Active Client</div>
          <div className="text-sm font-black text-slate-950">
            {client.companyName}
            <span className="ml-2 rounded-lg bg-white px-2 py-0.5 text-xs font-black text-violet-700">
              {client.loginDisplayStatus === "active_login" ? "ACTIVE LOGIN" : client.status}
            </span>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {client.tradingName} · {client.packageName}
            {client.ownerEmail ? ` · ${client.ownerEmail}` : ""}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {client.impersonating ? (
          <>
            <button
              type="button"
              onClick={() => {
                exitClientWorkspace();
                setClient(null);
                window.location.href = "/developer";
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white"
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
              className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-xs font-black text-violet-800"
            >
              Exit Client
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
