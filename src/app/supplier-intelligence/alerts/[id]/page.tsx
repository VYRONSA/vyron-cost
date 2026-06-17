import VyronCostShell from "@/components/VyronCostShell";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function SupplierRiskAlertPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return (
      <VyronCostShell hidePageHeader title="Risk Alert Drilldown" subtitle="Supabase service role required.">
        <div className="rounded-[2rem] bg-white p-6 text-sm font-bold text-slate-600">Could not load risk alert.</div>
      </VyronCostShell>
    );
  }

  const { data: risk } = await supabase
    .from("vyron_procurement_risk_alerts")
    .select("id, supplier_name, title, description, severity, previous_price, new_price, percentage_change, metadata, document_id")
    .eq("id", id)
    .maybeSingle();

  if (!risk) {
    return (
      <VyronCostShell hidePageHeader title="Risk Alert Not Found" subtitle="The alert could not be loaded.">
        <div className="rounded-[2rem] bg-white p-6 text-sm font-bold text-slate-600">Risk alert not found.</div>
      </VyronCostShell>
    );
  }

  const metadata = (risk.metadata || {}) as Record<string, unknown>;
  const affectedProducts = Array.isArray(metadata.affectedProducts)
    ? (metadata.affectedProducts as string[])
    : [];

  return (
    <VyronCostShell hidePageHeader title={risk.title}
      subtitle="PROCUREMENT RISK DRILLDOWN · PREVIOUS VS NEW · INVOICE CONTEXT · ACTION"
    >
      <section className="grid gap-5 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Supplier</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{risk.supplier_name || "Unknown supplier"}</div>
        </div>
        <div className="rounded-[2rem] bg-red-50 p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-red-700">Previous Price</div>
          <div className="mt-2 text-2xl font-black text-red-800">{money(risk.previous_price)}</div>
        </div>
        <div className="rounded-[2rem] bg-amber-50 p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">New Price</div>
          <div className="mt-2 text-2xl font-black text-amber-800">{money(risk.new_price)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">% Change</div>
          <div className="mt-2 text-2xl font-black text-red-700">{Number(risk.percentage_change || 0).toFixed(2)}%</div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Alert Description</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{risk.description || "No description provided."}</p>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
            Invoice: {risk.document_id ? String(risk.document_id).slice(0, 8) : "Not linked"}
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Recommended Action</h2>
          <div className="mt-3 rounded-2xl bg-[#A3E635]/10 p-4 text-sm font-bold text-[#4D7C0F]">
            Investigate supplier pricing, confirm PO compliance, and trigger negotiation if variance is outside threshold.
          </div>
          <div className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Affected Products</div>
          <div className="mt-2 space-y-2">
            {affectedProducts.length ? (
              affectedProducts.map((name) => (
                <div key={name} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  {name}
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">No direct product links captured.</div>
            )}
          </div>
        </div>
      </section>
    </VyronCostShell>
  );
}
