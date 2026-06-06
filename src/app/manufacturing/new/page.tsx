import BackButton from "@/components/vyron-cost/BackButton";
import ModulePageShell from "@/components/vyron-cost/ModulePageShell";

export default function NewManufacturingBatchPage() {
  return (
    <ModulePageShell eyebrow="Manufacturing Intelligence" title="New Manufacturing Batch" subtitle="Create a manufacturing batch from an approved BOM. Stock only moves when the batch is completed." actions={<BackButton />}>
      <form className="grid gap-5 rounded-[32px] border border-white bg-white/90 p-6 shadow-xl shadow-violet-100 md:grid-cols-2">
        {["Batch Number", "Product", "BOM / Recipe", "Batch Date", "Planned Quantity", "Actual Quantity Produced", "Labour Cost", "Overhead Cost"].map((label) => (
          <label key={label} className="block"><span className="text-sm font-black text-slate-700">{label}</span><input className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400" placeholder={label} /></label>
        ))}
        <div className="md:col-span-2 rounded-[24px] bg-violet-50 p-5 text-sm leading-6 text-violet-900"><strong>Demo-safe rule:</strong> saving as Draft does not reduce raw materials. Completing the batch creates Manufacturing Consumption and Manufacturing Output stock movements.</div>
        <div className="md:col-span-2 flex justify-end gap-3"><button className="rounded-full border border-slate-200 px-5 py-3 text-sm font-black">Save Draft</button><button className="rounded-full bg-violet-700 px-5 py-3 text-sm font-black text-white">Complete Batch</button></div>
      </form>
    </ModulePageShell>
  );
}
