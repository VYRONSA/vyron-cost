import { NextRequest, NextResponse } from "next/server";
import { OrderEngineError } from "@/lib/order-engine/errors";
import { orderErrorResponse, orderRouteContext } from "@/lib/order-engine/http";
import { escapeLike } from "@/lib/order-engine/normalize";

export const runtime = "nodejs";

/**
 * GET /api/order-intake/lookup?type=product|customer&q=…
 *
 * A search box for a PERSON resolving an exception — never used by matching.
 * The person picks the record; the choice is then applied through the audited
 * edit route as an explicit (manual) match. Company-scoped, at most 20 rows.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.edit");
    const type = request.nextUrl.searchParams.get("type");
    const q = String(request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ ok: true, results: [] });
    const pattern = `%${escapeLike(q)}%`;

    if (type === "product") {
      const [byName, bySku] = await Promise.all([
        supabase.from("vyron_cost_products").select("id, product_name, sku, selling_price").eq("company_id", companyId).ilike("product_name", pattern).limit(20),
        supabase.from("vyron_cost_products").select("id, product_name, sku, selling_price").eq("company_id", companyId).ilike("sku", pattern).limit(20),
      ]);
      if (byName.error) throw byName.error;
      if (bySku.error) throw bySku.error;
      const seen = new Map<string, Record<string, unknown>>();
      for (const row of [...(bySku.data || []), ...(byName.data || [])]) seen.set(String(row.id), row);
      return NextResponse.json({ ok: true, results: [...seen.values()].slice(0, 20) });
    }
    if (type === "customer") {
      const { data, error } = await supabase
        .from("vyron_customers")
        .select("id, customer_name, email, status")
        .eq("company_id", companyId)
        .ilike("customer_name", pattern)
        .limit(20);
      if (error) throw error;
      return NextResponse.json({ ok: true, results: data || [] });
    }
    throw new OrderEngineError("INVALID_INPUT", 'type must be "product" or "customer".');
  } catch (error) {
    return orderErrorResponse(error, "Lookup failed.");
  }
}
