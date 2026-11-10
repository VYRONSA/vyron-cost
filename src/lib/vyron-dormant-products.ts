import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dormant product management.
 *
 * A product is dormant when it has had no issued sale (customer invoice that is
 * Posted, Sent, Paid or stock posted) and no finished-goods stock movement in
 * the last N days. Nothing here deletes anything: removal goes through the
 * existing deleteProduct() workflow, which refuses to delete a product that any
 * BOM, sales order, invoice, stock movement or production run references and
 * offers archiving instead, so financial history is always preserved.
 */

export type DormantProductRow = {
  productId: string;
  itemCode: string;
  description: string;
  status: string;
  lastSaleDate: string | null;
  lastMovementAt: string | null;
  lastActivity: string | null;
  daysSinceActivity: number | null;
  qtyOnHand: number;
  dormant: boolean;
};

const ISSUED = ["Posted", "Sent", "Paid"];
const PAGE = 1000;

/** Pure classification so the rule can be tested without a database. */
export function classifyDormant(
  input: { lastSaleDate: string | null; lastMovementAt: string | null; createdAt: string | null },
  today: string,
  days: number
): { lastActivity: string | null; daysSinceActivity: number | null; dormant: boolean } {
  const dates = [input.lastSaleDate, input.lastMovementAt].filter((d): d is string => Boolean(d)).map((d) => d.slice(0, 10));
  const lastActivity = dates.length ? dates.sort().at(-1)! : null;
  const ms = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  const daysSince = lastActivity ? Math.floor((ms(today) - ms(lastActivity)) / 86_400_000) : null;
  if (lastActivity) return { lastActivity, daysSinceActivity: daysSince, dormant: (daysSince ?? 0) >= days };
  // Never sold or moved: dormant only once it has existed for the whole window,
  // so a product created last week is not offered for removal.
  const created = input.createdAt ? Math.floor((ms(today) - ms(input.createdAt)) / 86_400_000) : Infinity;
  return { lastActivity: null, daysSinceActivity: null, dormant: created >= days };
}

async function allPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function listDormantProducts(
  supabase: SupabaseClient,
  companyId: string,
  options: { days: number; today: string; search?: string }
): Promise<DormantProductRow[]> {
  const products = await allPages<{ id: string; sku: string | null; product_name: string; status: string | null; product_status: string | null; created_at: string | null }>((from, to) =>
    supabase.from("vyron_cost_products").select("id, sku, product_name, status, product_status, created_at").eq("company_id", companyId).order("product_name").range(from, to)
  );

  const invoices = await allPages<{ id: string; invoice_date: string | null; status: string | null; stock_posted: boolean | null }>((from, to) =>
    supabase.from("vyron_customer_invoices").select("id, invoice_date, status, stock_posted").eq("company_id", companyId).range(from, to)
  );
  const issuedDate = new Map<string, string>();
  for (const inv of invoices) {
    if ((inv.stock_posted || ISSUED.includes(String(inv.status || ""))) && inv.invoice_date) issuedDate.set(inv.id, inv.invoice_date.slice(0, 10));
  }

  const lastSale = new Map<string, string>();
  const invoiceIds = [...issuedDate.keys()];
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const batch = invoiceIds.slice(i, i + 200);
    const lines = await allPages<{ invoice_id: string; product_id: string | null }>((from, to) =>
      supabase.from("vyron_customer_invoice_lines").select("invoice_id, product_id").in("invoice_id", batch).range(from, to)
    );
    for (const line of lines) {
      if (!line.product_id) continue;
      const d = issuedDate.get(line.invoice_id)!;
      if (!lastSale.has(line.product_id) || lastSale.get(line.product_id)! < d) lastSale.set(line.product_id, d);
    }
  }

  const stock = await allPages<{ entity_id: string | null; qty_on_hand: number | null; last_movement_at: string | null }>((from, to) =>
    supabase.from("vyron_cost_stock_items").select("entity_id, qty_on_hand, last_movement_at").eq("company_id", companyId).eq("entity_type", "finished_goods").range(from, to)
  );
  const onHand = new Map<string, number>();
  for (const s of stock) if (s.entity_id) onHand.set(s.entity_id, (onHand.get(s.entity_id) || 0) + Number(s.qty_on_hand || 0));

  const moves = await allPages<{ entity_id: string | null; created_at: string }>((from, to) =>
    supabase.from("vyron_cost_inventory_transactions").select("entity_id, created_at").eq("company_id", companyId).eq("entity_type", "finished_goods").range(from, to)
  );
  const lastMove = new Map<string, string>();
  for (const m of moves) {
    if (!m.entity_id) continue;
    if (!lastMove.has(m.entity_id) || lastMove.get(m.entity_id)! < m.created_at) lastMove.set(m.entity_id, m.created_at);
  }

  const q = (options.search || "").trim().toLowerCase();
  return products
    .filter((p) => !q || String(p.sku || "").toLowerCase().includes(q) || String(p.product_name || "").toLowerCase().includes(q))
    .map((p) => {
      const lastSaleDate = lastSale.get(p.id) || null;
      const lastMovementAt = lastMove.get(p.id) || null;
      const c = classifyDormant({ lastSaleDate, lastMovementAt, createdAt: p.created_at }, options.today, options.days);
      const status = String(p.product_status || p.status || "Active");
      return {
        productId: p.id,
        itemCode: p.sku || "—",
        description: p.product_name,
        status,
        lastSaleDate,
        lastMovementAt: lastMovementAt ? lastMovementAt.slice(0, 10) : null,
        lastActivity: c.lastActivity,
        daysSinceActivity: c.daysSinceActivity,
        qtyOnHand: Math.round((onHand.get(p.id) || 0) * 10000) / 10000,
        dormant: c.dormant && status !== "Archived",
      };
    });
}
