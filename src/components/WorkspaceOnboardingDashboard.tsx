import Link from "next/link";
import { ArrowRight, Building2, Package, Users, Warehouse } from "lucide-react";
import { EMPTY_WORKSPACE_ONBOARDING } from "@/lib/vyron-workspace-context";
import type { ActiveClient } from "@/lib/vyron-developer-client";
import type { WorkspaceDashboardStats } from "@/lib/vyron-workspace-stats";

function formatCurrency(value: number) {
  return value.toLocaleString("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
}

export default function WorkspaceOnboardingDashboard({
  client,
  stats,
}: {
  client: ActiveClient | null;
  stats?: WorkspaceDashboardStats;
}) {
  const tradingName = client?.tradingName || client?.companyName || "Your workspace";
  const counts = stats || {
    suppliers: 0,
    ingredients: 0,
    products: 0,
    inventoryValue: 0,
    customerInvoices: 0,
    xeroStatus: "Not Connected",
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-8 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Workspace onboarding</div>
        <h2 className="mt-3 text-4xl font-black text-slate-950">{EMPTY_WORKSPACE_ONBOARDING.title}</h2>
        <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
          {EMPTY_WORKSPACE_ONBOARDING.message}
        </p>
        <p className="mt-2 text-sm font-bold text-violet-700">{tradingName}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(
          [
            ["Suppliers", String(counts.suppliers), "/suppliers"],
            ["Ingredients", String(counts.ingredients), "/ingredients"],
            ["Products", String(counts.products), "/products"],
            ["Inventory Value", formatCurrency(counts.inventoryValue), "/inventory/stock"],
            ["Customer Invoices", String(counts.customerInvoices), "/customer-invoices"],
            ["Xero", counts.xeroStatus, "/integrations/xero"],
          ] as const
        ).map(([label, value, href]) => (
          <Link
            key={label}
            href={href}
            className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/40"
          >
            <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { href: "/suppliers", title: "Add suppliers", note: "Capture supplier contacts and invoice emails.", Icon: Users },
          { href: "/ingredients", title: "Add ingredients", note: "Build your costing foundation.", Icon: Package },
          { href: "/admin/imports", title: "Import Centre", note: "Bulk import suppliers, products and opening stock.", Icon: Warehouse },
          { href: "/executive-boardroom", title: "Executive Boardroom", note: "Owner command centre for recovery and repricing.", Icon: Building2 },
        ].map(({ href, title, note, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 rounded-3xl border border-violet-100 bg-violet-50/50 p-5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-700 text-white">
              <Icon size={22} />
            </div>
            <div>
              <div className="font-black text-slate-900">{title}</div>
              <div className="mt-1 text-sm font-semibold text-slate-600">{note}</div>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-violet-700">
                Open <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-[2rem] border border-dashed border-violet-200 bg-violet-50/40 p-6 text-sm font-semibold text-slate-600">
        <div className="flex items-center gap-3">
          <Building2 className="text-violet-700" size={22} />
          <span>This workspace is isolated. No Handcrafted or shared demo records are shown here.</span>
        </div>
      </section>
    </div>
  );
}
