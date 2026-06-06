"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

type AuditRow = {
  id: string;
  module: string;
  action: string;
  entity: string;
  user: string;
  timestamp: string;
  note: string;
};

const rows: AuditRow[] = [
  { id: "a1", module: "BOM", action: "Updated", entity: "Chicken Pie BOM", user: "VYRON Admin", timestamp: "Today 08:35", note: "Ingredient cost recalculated from supplier price." },
  { id: "a2", module: "Product", action: "Repriced", entity: "Pepper Steak Pie", user: "VYRON AI", timestamp: "Today 08:41", note: "Suggested price updated to protect target GP." },
  { id: "a3", module: "Supplier", action: "Flagged", entity: "Premium Meat Suppliers", user: "VYRON AI", timestamp: "Today 09:10", note: "Supplier movement exceeded threshold." },
  { id: "a4", module: "Invoice", action: "Processed", entity: "PMS-INV-1042", user: "VYRON AI", timestamp: "Today 09:22", note: "Invoice lines matched with 94% confidence." },
  { id: "a5", module: "Recovery", action: "Explained", entity: "Chicken & Mushroom GP collapse", user: "VYRON Admin", timestamp: "Today 09:35", note: "Recovery formula opened for client explanation." },
];

export default function AuditLogsClient() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(term));
  }, [search]);

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/40 px-4 py-3">
          <Search size={20} className="text-emerald-700" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search audit trail..."
            className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
          />
          <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-emerald-300">{filtered.length} logs</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-6 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
          <div>Module</div>
          <div>Action</div>
          <div>Entity</div>
          <div>User</div>
          <div>Time</div>
          <div>Note</div>
        </div>
        {filtered.map((row) => (
          <div key={row.id} className="grid grid-cols-6 items-center border-t border-slate-100 px-5 py-5 text-sm">
            <div className="font-black text-emerald-700">{row.module}</div>
            <div>{row.action}</div>
            <div className="font-black text-[#07110d]">{row.entity}</div>
            <div>{row.user}</div>
            <div>{row.timestamp}</div>
            <div className="text-xs font-bold text-slate-500">{row.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
