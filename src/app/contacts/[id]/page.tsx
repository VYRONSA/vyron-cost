import { notFound } from "next/navigation";
import ContactDetailPageClient from "@/components/ContactDetailPageClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getVyronContactById } from "@/lib/vyron-contact-master";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) notFound();
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();

  const { id } = await params;
  const companyId = await requireApiCompanyId();
  const contact = await getVyronContactById(supabase, companyId, id);
  if (!contact) notFound();

  const roleLabel = contact.is_customer && contact.is_supplier
    ? "Customer + Supplier"
    : contact.is_customer
      ? "Customer"
      : contact.is_supplier
        ? "Supplier"
        : "Unclassified";

  return (
    <VyronCostAiShell hidePageHeader title={contact.contact_name} subtitle="Contact detail with role controls and full master-data actions.">
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Role</div><div className="mt-2 text-2xl font-black text-slate-900">{roleLabel}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Customer Flag</div><div className="mt-2 text-2xl font-black text-slate-900">{contact.is_customer ? "Yes" : "No"}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Supplier Flag</div><div className="mt-2 text-2xl font-black text-slate-900">{contact.is_supplier ? "Yes" : "No"}</div></div>
        <div className="rounded-2xl bg-white p-5"><div className="text-xs font-black uppercase text-slate-400">Xero ID</div><div className="mt-2 text-2xl font-black text-slate-900">{contact.xero_contact_id || "—"}</div></div>
      </section>

      <ContactDetailPageClient contact={contact} />
    </VyronCostAiShell>
  );
}
