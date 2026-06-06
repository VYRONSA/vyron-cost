"use client";

import { useMemo, useState } from "react";
import ReportTableShell from "@/components/ReportTableShell";
import StatusPill from "@/components/StatusPill";
import { Supplier, statusTone } from "@/lib/vyron-cost-data";

export default function SupplierReportClient({ suppliers }: { suppliers: Supplier[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return suppliers;
    return suppliers.filter((supplier) =>
      [supplier.supplier_name, supplier.category, supplier.contact_email || "", supplier.invoice_email || "", supplier.risk_status]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [suppliers, search]);

  return (
    <ReportTableShell
      title="Supplier Risk Report"
      subtitle="Supplier categories, invoice email readiness, latest movement and risk state."
      search={search}
      onSearch={setSearch}
      resultCount={filtered.length}
    >
      <div className="overflow-x-auto rounded-3xl border border-slate-100">
        <div className="min-w-[960px]">
          <div className="grid grid-cols-6 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
            <div>Supplier</div><div>Category</div><div>Contact</div><div>Invoice Email</div><div>Movement</div><div>Risk</div>
          </div>
          {filtered.map((supplier) => (
            <div key={supplier.id} className="grid grid-cols-6 items-center border-t border-slate-100 px-5 py-4 text-sm">
              <div className="font-black text-[#07110d]">{supplier.supplier_name}</div>
              <div>{supplier.category}</div>
              <div>{supplier.contact_email || "Not captured"}</div>
              <div>{supplier.invoice_email || "Not active"}</div>
              <div className="font-black text-emerald-700">{Number(supplier.last_price_movement || 0).toFixed(1)}%</div>
              <div><StatusPill tone={statusTone(supplier.risk_status)}>{supplier.risk_status}</StatusPill></div>
            </div>
          ))}
        </div>
      </div>
    </ReportTableShell>
  );
}
