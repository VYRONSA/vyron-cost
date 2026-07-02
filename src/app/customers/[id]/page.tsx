import { notFound } from "next/navigation";
import CustomerDetailPageClient from "@/components/CustomerDetailPageClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getCustomerById } from "@/lib/vyron-customer-invoices";
import { getCustomerCommercialKpis, getCustomerIntelligence } from "@/lib/vyron-customer-sales-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) notFound();
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();

  const { id } = await params;
  const companyId = await requireApiCompanyId();
  const customer = await getCustomerById(supabase, companyId, id);
  if (!customer) notFound();
  const kpis = await getCustomerCommercialKpis(supabase, companyId, id);
  const intelligence = await getCustomerIntelligence(supabase, companyId, id);

  const money = (value: number) => `R ${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <VyronCostAiShell hidePageHeader title={customer.customer_name} subtitle="Customer detail, commercial KPIs and full edit form.">
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Status</div><div className="mt-2 text-2xl font-black text-slate-900">{customer.on_hold ? "On Hold" : customer.status || (customer.active ? "Active" : "Inactive")}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Revenue</div><div className="mt-2 text-2xl font-black text-slate-900">{money(kpis.revenue)}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">GP</div><div className="mt-2 text-2xl font-black text-slate-900">{money(kpis.gp)}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Outstanding Orders</div><div className="mt-2 text-2xl font-black text-slate-900">{money(kpis.outstandingOrders)}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Outstanding Invoices</div><div className="mt-2 text-2xl font-black text-slate-900">{money(kpis.outstandingInvoices)}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Avg Payment Days</div><div className="mt-2 text-2xl font-black text-slate-900">{kpis.averagePaymentDays.toFixed(1)}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Lifetime Value</div><div className="mt-2 text-2xl font-black text-slate-900">{money(kpis.lifetimeValue)}</div></div>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-5">
        <div className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Customer Intelligence</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Lifetime Value</div><div className="mt-1 text-lg font-black text-slate-900">{money(intelligence.lifetimeValue)}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Average GP</div><div className="mt-1 text-lg font-black text-slate-900">{intelligence.averageGpPct.toFixed(2)}%</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Late Payment Risk</div><div className={`mt-1 text-lg font-black ${intelligence.latePaymentRisk === "High" ? "text-rose-700" : intelligence.latePaymentRisk === "Medium" ? "text-amber-700" : "text-emerald-700"}`}>{intelligence.latePaymentRisk}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Average Order Size</div><div className="mt-1 text-lg font-black text-slate-900">{money(intelligence.averageOrderSize)}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Purchase Frequency</div><div className="mt-1 text-lg font-black text-slate-900">{intelligence.purchaseFrequencyDays.toFixed(1)} days</div></div>
          <div className="rounded-xl bg-slate-50 p-3 md:col-span-2"><div className="text-[11px] font-black uppercase text-slate-500">Most Purchased Products</div><div className="mt-1 text-sm font-semibold text-slate-700">{intelligence.mostPurchasedProducts.length ? intelligence.mostPurchasedProducts.map((item) => `${item.productName} (${money(item.revenue)})`).join(" • ") : "No invoice line history yet."}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Predicted Next Order</div><div className="mt-1 text-lg font-black text-slate-900">{intelligence.predictedNextOrderDate || "Not enough history"}</div></div>
        </div>
      </section>

      <CustomerDetailPageClient customer={customer} />
    </VyronCostAiShell>
  );
}
