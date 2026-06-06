"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";

type Item = {
  id: string;
  item_code: string;
  description: string;
  entity_type: string;
  stock_status: string;
  qty_on_hand: number;
  unit: string;
  average_cost: number;
  inventory_value: number;
  valuation_method: string;
};

export default function InventoryStockListClient({
  initialEntityType = "",
  initialStatus = "",
}: {
  initialEntityType?: string;
  initialStatus?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [entityType, setEntityType] = useState(initialEntityType || "all");
  const [status, setStatus] = useState(initialStatus || "all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (entityType !== "all") params.set("entityType", entityType);
    if (status !== "all") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/inventory/stock?${params}`);
    const data = await res.json();
    if (data.ok) setItems(data.items || []);
  }, [entityType, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-[2rem] border border-violet-100 bg-white p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="rounded-xl border px-3 py-2 text-sm font-semibold"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded-xl border px-3 py-2 text-sm font-semibold" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="all">All types</option>
          <option value="ingredient">Ingredients</option>
          <option value="packaging">Packaging</option>
          <option value="finished_goods">Finished Goods</option>
        </select>
        <select className="rounded-xl border px-3 py-2 text-sm font-semibold" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out Of Stock">Out Of Stock</option>
          <option value="Overstock">Overstock</option>
          <option value="Slow Moving">Slow Moving</option>
        </select>
        <button type="button" onClick={() => void load()} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black">
          Refresh
        </button>
      </div>
      <table className="min-w-full text-sm">
        <thead className="text-xs font-black uppercase text-slate-500">
          <tr>
            <th className="py-2 text-left">Code</th>
            <th>Description</th>
            <th>Type</th>
            <th>Status</th>
            <th>Qty</th>
            <th>Avg Cost</th>
            <th>Value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="py-2 font-black">{item.item_code}</td>
              <td>{item.description}</td>
              <td>{item.entity_type}</td>
              <td className="font-bold text-violet-700">{item.stock_status}</td>
              <td>
                {Number(item.qty_on_hand).toFixed(2)} {item.unit}
              </td>
              <td>R{Number(item.average_cost).toFixed(2)}</td>
              <td className="font-black">{formatMoney(item.inventory_value)}</td>
              <td>
                <Link href={`/inventory/stock/${item.id}`} className="text-xs font-black text-violet-700">
                  Detail →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
