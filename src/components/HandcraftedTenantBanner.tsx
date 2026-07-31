import Link from "next/link";
import ClientBrandLockup from "@/components/ClientBrandLockup";
import { isHandcraftedTenantEnabled } from "@/lib/handcrafted-tenant";

export default function HandcraftedTenantBanner({ compact = false }: { compact?: boolean }) {
  const ready = isHandcraftedTenantEnabled();

  if (compact) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <ClientBrandLockup variant="light" size="sm" />
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[#F0FDF4] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#9333EA]">
            {ready ? "Live data" : "Demo"}
          </span>
          <Link href="/product-profitability" className="text-[10px] font-black uppercase tracking-[0.14em] text-[#64748B] hover:text-[#0F172A]">
            Products →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="vyron-surface-card mb-6 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
      <ClientBrandLockup variant="light" size="md" />
      <div className="flex flex-col items-start gap-2 md:items-end">
        <div className="rounded-full bg-[#F0FDF4] px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#9333EA]">
          {ready ? "Live imported costing data" : "Handcrafted demo"}
        </div>
        {ready && (
          <Link href="/product-profitability" className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B] hover:text-[#0F172A]">
            Product intelligence →
          </Link>
        )}
      </div>
    </div>
  );
}
