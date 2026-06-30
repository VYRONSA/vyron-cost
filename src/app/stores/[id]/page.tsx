import { notFound } from "next/navigation";
import StoreDetailPageClient from "@/components/StoreDetailPageClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getStoreById } from "@/lib/vyron-store-orders";

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) notFound();
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();

  const { id } = await params;
  const companyId = await requireApiCompanyId();
  const store = await getStoreById(supabase, companyId, id);
  if (!store) notFound();

  return (
    <VyronCostAiShell hidePageHeader title={store.store_name} subtitle="Store detail with status, ordering profile and full edit form.">
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Store Code</div><div className="mt-2 text-2xl font-black text-slate-900">{store.store_code}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Status</div><div className="mt-2 text-2xl font-black text-slate-900">{store.status}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Contact</div><div className="mt-2 text-2xl font-black text-slate-900">{store.contact_name || "—"}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Email</div><div className="mt-2 text-2xl font-black text-slate-900">{store.contact_email || "—"}</div></div>
      </section>

      <StoreDetailPageClient store={store} />
    </VyronCostAiShell>
  );
}
