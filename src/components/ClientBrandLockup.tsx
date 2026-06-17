"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { readActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";

type Props = {
  variant?: "dark" | "light";
  showPoweredBy?: boolean;
  size?: "sm" | "md" | "lg";
};

export default function ClientBrandLockup({ variant = "dark", showPoweredBy = true, size = "md" }: Props) {
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

  const logoSize = size === "lg" ? 56 : size === "md" ? 48 : 40;
  const companyName = client?.companyName || "VYRON COST";
  const tradingName = client?.tradingName || "AI Cost Intelligence Platform";

  return (
    <div className="flex items-center gap-4">
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl ${
          variant === "dark" ? "bg-white/10 ring-1 ring-violet-300/25" : "bg-gradient-to-br from-rose-50 to-violet-100 ring-1 ring-[#E2E8F0]"
        }`}
        style={{ width: logoSize, height: logoSize }}
      >
        <Building2 size={Math.round(logoSize * 0.48)} className={variant === "dark" ? "text-white" : "text-[#7C3AED]"} />
      </div>
      <div className="min-w-0">
        <div
          className={`truncate font-black leading-tight ${
            size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-base"
          } ${variant === "dark" ? "text-white" : "text-slate-950"}`}
        >
          {companyName}
        </div>
        {showPoweredBy && (
          <div className={`text-[10px] font-black uppercase tracking-[0.22em] ${variant === "dark" ? "text-fuchsia-300" : "text-[#E11D48]"}`}>
            powered by <span className={variant === "dark" ? "text-white" : "text-slate-950"}>VYRON COST</span>
          </div>
        )}
        <div className={`truncate text-xs ${variant === "dark" ? "text-slate-300" : "text-slate-500"}`}>{tradingName}</div>
      </div>
    </div>
  );
}

export function ClientBrandLockupLink({ variant = "dark", href = "/dashboard" }: { variant?: "dark" | "light"; href?: string }) {
  return (
    <Link href={href} className="inline-flex">
      <ClientBrandLockup variant={variant} size="md" />
    </Link>
  );
}
