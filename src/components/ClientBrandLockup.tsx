import Image from "next/image";
import Link from "next/link";
import { HANDCRAFTED_COMPANY } from "@/lib/handcrafted-tenant";

type Props = {
  variant?: "dark" | "light";
  showPoweredBy?: boolean;
  size?: "sm" | "md" | "lg";
};

export default function ClientBrandLockup({ variant = "dark", showPoweredBy = true, size = "md" }: Props) {
  const company = HANDCRAFTED_COMPANY;
  const logoSize = size === "lg" ? 56 : size === "md" ? 48 : 40;

  return (
    <div className="flex items-center gap-4">
      <div
        className={`relative shrink-0 overflow-hidden rounded-2xl ${
          variant === "dark" ? "bg-white/10 ring-1 ring-[#b6d934]/25" : "bg-[#b6d934]/15 ring-1 ring-[#123524]/10"
        }`}
        style={{ width: logoSize, height: logoSize }}
      >
        <Image
          src={company.logo_url}
          alt={company.company_name}
          width={logoSize}
          height={logoSize}
          className="object-contain p-1"
          priority
        />
      </div>
      <div>
        <div
          className={`font-black leading-tight ${
            size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-base"
          } ${variant === "dark" ? "text-white" : "text-[#07110d]"}`}
        >
          {company.company_name}
        </div>
        {showPoweredBy && (
          <div className={`text-[10px] font-black uppercase tracking-[0.22em] ${variant === "dark" ? "text-[#b6d934]" : "text-[#123524]"}`}>
            powered by <span className={variant === "dark" ? "text-[#b6d934]" : "text-[#07110d]"}>VYRON COST</span>
          </div>
        )}
        <div className={`text-xs ${variant === "dark" ? "text-slate-400" : "text-slate-500"}`}>{company.trading_name}</div>
      </div>
    </div>
  );
}

export function ClientBrandLockupLink({
  variant = "dark",
  href = "/dashboard",
}: {
  variant?: "dark" | "light";
  href?: string;
}) {
  return (
    <Link href={href} className="inline-flex">
      <ClientBrandLockup variant={variant} size="md" />
    </Link>
  );
}
