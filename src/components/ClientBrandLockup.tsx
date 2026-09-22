"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { readActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";
import { PoweredByVolora, VyronLogoLockup } from "@/components/vyron-ui/VyronLogo";

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
  const companyName = client?.companyName || "VOLORA";
  const tradingName = client?.tradingName || "Profitability Intelligence";
  // Unbranded (e.g. login before a workspace is chosen): the VOLORA lockup on its
  // own — wordmark and tagline — with no "powered by" line repeating it.
  const isVyronOwn = !client?.companyName;

  if (isVyronOwn) {
    return <VyronLogoLockup variant={variant === "dark" ? "onDark" : "onLight"} size={logoSize + 8} />;
  }

  return (
    <div className="flex items-center gap-4">
      <div
          className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl ${
            variant === "dark"
              ? "bg-white/10 ring-1 ring-[#F4C44E]/25"
              : "bg-[rgba(79,70,229,0.06)] ring-1 ring-[rgba(11,32,43,0.07)]"
          }`}
          style={{ width: logoSize, height: logoSize }}
        >
          <Building2 size={Math.round(logoSize * 0.48)} className={variant === "dark" ? "text-white" : "text-[#163A48]"} />
      </div>
      <div className="min-w-0">
        <div
          className={`vyron-t-title truncate ${
            size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-base"
          } ${variant === "dark" ? "text-white" : "text-slate-950"}`}
        >
          {companyName}
        </div>
        {showPoweredBy && <PoweredByVolora variant={variant === "dark" ? "onDark" : "onLight"} />}
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
