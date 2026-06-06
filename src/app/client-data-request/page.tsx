import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell title="Client Data Request" subtitle="Exact data to request from the prospect after the demo.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Supplier List</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Supplier names, contact emails, invoice emails and payment terms.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Ingredient List</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Ingredient names, units, latest prices, previous prices and supplier names.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Product List</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Finished product names, categories, selling prices and target GP.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Recipes / BOMs</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Ingredient quantities, packaging, labour, wastage and yields.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Purchase Orders</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Recent purchase order exports or PDFs.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Supplier Invoices</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Recent invoice PDFs or Excel files.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Sales Volumes</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Monthly sales quantities per product for accurate recovery calculations.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
