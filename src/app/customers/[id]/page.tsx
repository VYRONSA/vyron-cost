import { notFound } from "next/navigation";
import CustomerDetailPageClient from "@/components/CustomerDetailPageClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getCustomerById } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) notFound();
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();

  const { id } = await params;
  const companyId = await requireApiCompanyId();
  const customer = await getCustomerById(supabase, companyId, id);
  if (!customer) notFound();

  return (
    <VyronCostAiShell hidePageHeader title={customer.customer_name} subtitle="Customer detail, commercial KPIs and full edit form.">
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Status</div><div className="mt-2 text-2xl font-black text-slate-900">{customer.status || (customer.active ? "Active" : "Inactive")}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Revenue</div><div className="mt-2 text-2xl font-black text-slate-900">R {Number(customer.total_sales || 0).toLocaleString("en-ZA")}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Invoices</div><div className="mt-2 text-2xl font-black text-slate-900">{Number(customer.invoice_count || 0)}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Average Invoice</div><div className="mt-2 text-2xl font-black text-slate-900">R {Number(customer.average_invoice_value || 0).toLocaleString("en-ZA")}</div></div>
      </section>

      <CustomerDetailPageClient customer={customer} />
    </VyronCostAiShell>
  );
}
