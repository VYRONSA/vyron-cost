"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";

type Item = {
  id: string;
  entity_id: string | null;
  item_code: string;
  description: string;
  qty_on_hand: number;
  average_cost: number;
  inventory_value: number;
  unit: string;
  stock_status: string;
};

export default function FinishedGoodsDashboardClient() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch("/api/production/finished-goods")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setItems(d.items);
      });
  }, []);

  const totalValue = items.reduce((s, i) => s + i.inventory_value, 0);

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Total finished goods value</div>
        <div className="mt-2 text-4xl font-black">{formatMoney(totalValue)}</div>
        <p className="mt-2 text-sm text-slate-400">Linked to inventory module — updated on each completed production run.</p>
      </div>

      <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="bg-violet-50 text-left text-xs font-black uppercase text-violet-800">
              <th className="px-5 py-4">Product</th>
              <th className="px-5 py-4">On hand</th>
              <th className="px-5 py-4">Avg cost</th>
              <th className="px-5 py-4">Inventory value</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t font-semibold">
                <td className="px-5 py-4">
                  <div className="font-black">{item.description}</div>
                  <div className="text-xs text-slate-500">{item.item_code}</div>
                </td>
                <td className="px-5 py-4">
                  {item.qty_on_hand} {item.unit}
                </td>
                <td className="px-5 py-4">{formatMoney(item.average_cost)}</td>
                <td className="px-5 py-4 font-black">{formatMoney(item.inventory_value)}</td>
                <td className="px-5 py-4">{item.stock_status}</td>
                <td className="px-5 py-4">
                  <Link href={`/inventory/stock/${item.id}`} className="text-violet-700 font-black text-xs">
                    Stock detail
                  </Link>
                  {item.entity_id ? (
                    <Link href={`/products/${item.entity_id}`} className="ml-3 text-emerald-700 font-black text-xs">
                      Product
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
