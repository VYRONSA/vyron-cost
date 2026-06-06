import BackButton from "@/components/vyron-cost/BackButton";
import ModulePageShell from "@/components/vyron-cost/ModulePageShell";

export default function NewCustomerInvoicePage() {
  return (
    <ModulePageShell eyebrow="Customer Sales Intelligence" title="New Customer Invoice" subtitle="Sell finished goods to a customer. Draft invoices do not reduce stock." actions={<BackButton />}>
      <form className="grid gap-5 rounded-[32px] border border-white bg-white/90 p-6 shadow-xl shadow-violet-100 md:grid-cols-2">
        {["Customer", "Invoice Number", "Invoice Date", "Due Date", "Product", "Quantity", "Selling Price", "Status"].map((label) => (
          <label key={label} className="block"><span className="text-sm font-black text-slate-700">{label}</span><input className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400" placeholder={label} /></label>
        ))}
        <div className="md:col-span-2 rounded-[24px] bg-violet-50 p-5 text-sm leading-6 text-violet-900"><strong>Demo-safe rule:</strong> Draft invoices do not move stock. Approved or Sent invoices create Customer Invoice / Sale stock movements and calculate COGS, GP and GP %.</div>
        <div className="md:col-span-2 flex justify-end gap-3"><button className="rounded-full border border-slate-200 px-5 py-3 text-sm font-black">Save Draft</button><button className="rounded-full bg-violet-700 px-5 py-3 text-sm font-black text-white">Approve Invoice</button></div>
      </form>
    </ModulePageShell>
  );
}
