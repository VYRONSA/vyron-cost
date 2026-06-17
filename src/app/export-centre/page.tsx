import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { Download, FileSpreadsheet } from "lucide-react";

const exports = [
  { title: "Executive Board Pack", text: "PDF, Excel and CSV with full executive sections.", href: "/board-pack-centre", Icon: Download },
  { title: "Executive Reporting", text: "Category reports with export per domain.", href: "/executive-reporting", Icon: FileSpreadsheet },
  { title: "Accounting Export Centre", text: "Invoices, POs, GRNs, journals for ERP handoff.", href: "/accounting-export-centre", Icon: Download },
  { title: "Finance Intelligence", text: "CFO KPIs and leakage risk scoring.", href: "/finance-intelligence", Icon: FileSpreadsheet },
  { title: "Supplier Risk Export", text: "Supplier movement and negotiation data.", href: "/supplier-intelligence", Icon: Download },
  { title: "Recovery Export", text: "Recovery opportunities with formulas and values.", href: "/recovery-opportunities", Icon: Download },
];

export default function ExportCentrePage() {
  return (
    <VyronCostAiShell hidePageHeader title="Export Centre" subtitle="PDF · EXCEL · CSV · BOARD PACKS · ACCOUNTING">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {exports.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] transition hover:-translate-y-1 hover:shadow-xl"
          >
            <item.Icon className="text-violet-600" size={28} />
            <h2 className="mt-4 text-2xl font-black text-slate-950">{item.title}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{item.text}</p>
          </Link>
        ))}
      </section>
    </VyronCostAiShell>
  );
}
