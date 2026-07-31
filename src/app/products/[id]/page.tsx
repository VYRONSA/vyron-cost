import Link from "next/link";
import ProductBomLinkClient from "@/components/ProductBomLinkClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { calcGp, calcSuggestedPrice, formatMoney, getProductById } from "@/lib/vyron-cost-product-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-ZA");
}

function queueStatusFromInvoice(status: string) {
  if (status === "Cancelled") return "Cancelled";
  if (status === "Paid") return "Completed";
  if (status === "Sent") return "Invoiced";
  if (status === "Approved" || status === "Posted") return "Processing";
  return "New";
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { product, bom, boms } = await getProductById(id);

  if (!product) {
    return (
      <VyronCostAiShell hidePageHeader title="Product Not Found" subtitle="This product could not be loaded.">
        <div className="rounded-[2rem] bg-white p-8 font-bold text-slate-600">Product not found.</div>
      </VyronCostAiShell>
    );
  }

  const cost = Number(product.total_cost || bom?.cost_per_unit || 0);
  const price = Number(product.selling_price || 0);
  const targetGp = Number(product.target_gp || 40);
  const actualGp = Number(product.calculated_gp || calcGp(price, cost));
  const suggestedPrice = Number(product.suggested_selling_price || calcSuggestedPrice(cost, targetGp));

  const detailData = {
    ingredientSummary: [] as Array<{ line_type: string; quantity: number; line_cost: number }>,
    inventory: null as null | { qty_on_hand: number; average_cost: number; inventory_value: number; stock_status: string; last_movement_at: string | null },
    salesOrders: [] as Array<{
      invoice_id: string;
      invoice_number: string;
      invoice_date: string;
      customer_name: string;
      status: string;
      quantity: number;
      line_total: number;
      line_gp: number;
    }>,
    productionHistory: [] as Array<{ id: string; run_number: string; status: string; actual_qty: number; total_production_cost: number; created_at: string }>,
    purchaseHistory: [] as Array<{ id: string; transaction_number: string; transaction_type: string; quantity: number; total_cost: number; reference_type: string | null; created_at: string }>,
    aiInsights: [] as Array<{ id: string; priority: string; title: string; impact: string; recommendation: string; href: string | null; created_at: string }>,
    auditHistory: [] as Array<{ id: string; event_type: string; detail: string; created_at: string }>,
  };

  const scope = await workspaceScope();
  if (isSupabaseServiceRoleConfigured() && scope.companyId) {
    const admin = getSupabaseAdmin();
    if (admin) {
      const safeQueryRows = async <T,>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
        const { data, error } = await query;
        if (error) return [] as T[];
        return (data || []) as T[];
      };

      const productLines = await safeQueryRows<Record<string, unknown>>(
        admin
          .from("vyron_cost_product_cost_lines")
          .select("line_type, quantity, line_cost, line_cost_imported")
          .eq("company_id", scope.companyId)
          .or(`product_id.eq.${product.id},product_name.eq.${String(product.product_name || "")}`)
      );

      const grouped = new Map<string, { quantity: number; line_cost: number }>();
      for (const line of productLines) {
        const key = String(line.line_type || "Other");
        const bucket = grouped.get(key) || { quantity: 0, line_cost: 0 };
        bucket.quantity += Number(line.quantity || 0);
        bucket.line_cost += Number(line.line_cost || line.line_cost_imported || 0);
        grouped.set(key, bucket);
      }
      detailData.ingredientSummary = [...grouped.entries()].map(([line_type, values]) => ({
        line_type,
        quantity: values.quantity,
        line_cost: values.line_cost,
      }));

      const { data: inventoryItem } = await admin
        .from("vyron_cost_stock_items")
        .select("qty_on_hand, average_cost, inventory_value, stock_status, last_movement_at")
        .eq("company_id", scope.companyId)
        .eq("entity_type", "finished_goods")
        .eq("entity_id", product.id)
        .maybeSingle();
      if (inventoryItem) {
        detailData.inventory = {
          qty_on_hand: Number(inventoryItem.qty_on_hand || 0),
          average_cost: Number(inventoryItem.average_cost || 0),
          inventory_value: Number(inventoryItem.inventory_value || 0),
          stock_status: String(inventoryItem.stock_status || "In Stock"),
          last_movement_at: inventoryItem.last_movement_at ? String(inventoryItem.last_movement_at) : null,
        };
      }

      const invoiceLines = await safeQueryRows<Record<string, unknown>>(
        admin
          .from("vyron_customer_invoice_lines")
          .select("invoice_id, quantity, selling_price, cost_per_unit, line_total, line_gp")
          .eq("product_id", product.id)
      );
      const invoiceIds = [...new Set(invoiceLines.map((line) => String(line.invoice_id || "")).filter(Boolean))];
      const invoiceRows = invoiceIds.length
        ? await safeQueryRows<Record<string, unknown>>(
            admin
              .from("vyron_customer_invoices")
              .select("id, invoice_number, invoice_date, customer_name, status")
              .eq("company_id", scope.companyId)
              .in("id", invoiceIds)
          )
        : [];
      const invoiceById = new Map(invoiceRows.map((row) => [String(row.id), row]));
      detailData.salesOrders = invoiceLines
        .map((line) => {
          const inv = invoiceById.get(String(line.invoice_id || ""));
          if (!inv) return null;
          const qty = Number(line.quantity || 0);
          const lineTotal = Number(line.line_total || qty * Number(line.selling_price || 0));
          const lineGp = Number(line.line_gp || (qty * Number(line.selling_price || 0) - qty * Number(line.cost_per_unit || 0)));
          return {
            invoice_id: String(inv.id),
            invoice_number: String(inv.invoice_number || "-"),
            invoice_date: String(inv.invoice_date || ""),
            customer_name: String(inv.customer_name || "-"),
            status: String(inv.status || "Draft"),
            quantity: qty,
            line_total: lineTotal,
            line_gp: lineGp,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1))
        .slice(0, 25);

      detailData.productionHistory = await safeQueryRows<Record<string, unknown>>(
        admin
          .from("vyron_cost_production_runs")
          .select("id, run_number, status, actual_qty, total_production_cost, created_at")
          .eq("company_id", scope.companyId)
          .eq("product_id", product.id)
          .order("created_at", { ascending: false })
          .limit(20)
      ).then((rows) =>
        rows.map((row) => ({
          id: String(row.id),
          run_number: String(row.run_number || "-"),
          status: String(row.status || "Planned"),
          actual_qty: Number(row.actual_qty || 0),
          total_production_cost: Number(row.total_production_cost || 0),
          created_at: String(row.created_at || ""),
        }))
      );

      detailData.purchaseHistory = await safeQueryRows<Record<string, unknown>>(
        admin
          .from("vyron_cost_inventory_transactions")
          .select("id, transaction_number, transaction_type, quantity, total_cost, reference_type, created_at")
          .eq("company_id", scope.companyId)
          .eq("entity_type", "finished_goods")
          .eq("entity_id", product.id)
          .in("transaction_type", ["Receipt", "Adjustment"])
          .order("created_at", { ascending: false })
          .limit(20)
      ).then((rows) =>
        rows.map((row) => ({
          id: String(row.id),
          transaction_number: String(row.transaction_number || "-"),
          transaction_type: String(row.transaction_type || "Receipt"),
          quantity: Number(row.quantity || 0),
          total_cost: Number(row.total_cost || 0),
          reference_type: row.reference_type ? String(row.reference_type) : null,
          created_at: String(row.created_at || ""),
        }))
      );

      detailData.aiInsights = await safeQueryRows<Record<string, unknown>>(
        admin
          .from("vyron_cost_ai_insights")
          .select("id, priority, title, impact, recommendation, href, created_at")
          .eq("company_id", scope.companyId)
          .eq("status", "active")
          .eq("entity_type", "product")
          .eq("entity_id", product.id)
          .order("created_at", { ascending: false })
          .limit(10)
      ).then((rows) =>
        rows.map((row) => ({
          id: String(row.id),
          priority: String(row.priority || "Medium"),
          title: String(row.title || "AI insight"),
          impact: String(row.impact || ""),
          recommendation: String(row.recommendation || ""),
          href: row.href ? String(row.href) : null,
          created_at: String(row.created_at || ""),
        }))
      );

      detailData.auditHistory = await safeQueryRows<Record<string, unknown>>(
        admin
          .from("vyron_inventory_audit_log")
          .select("id, event_type, detail, created_at")
          .eq("company_id", scope.companyId)
          .order("created_at", { ascending: false })
          .limit(40)
      ).then((rows) =>
        rows
          .filter((row) => {
            const text = `${String(row.detail || "")} ${String(row.event_type || "")}`.toLowerCase();
            return text.includes(String(product.product_name || "").toLowerCase());
          })
          .slice(0, 10)
          .map((row) => ({
            id: String(row.id),
            event_type: String(row.event_type || "Update"),
            detail: String(row.detail || ""),
            created_at: String(row.created_at || ""),
          }))
      );
    }
  }

  return (
    <VyronCostAiShell hidePageHeader title={product.product_name} subtitle="Product detail, linked BOM, cost, selling price and margin status.">
      <section className="grid gap-5 md:grid-cols-5">
        {[
          ["BOM Cost", formatMoney(cost), "text-slate-900"],
          ["Selling Price", formatMoney(price), "text-slate-900"],
          ["Actual GP", `${actualGp.toFixed(1)}%`, actualGp < targetGp ? "text-red-600" : "text-[#84CC16]"],
          ["Target GP", `${targetGp.toFixed(1)}%`, "text-violet-700"],
          ["Suggested", formatMoney(suggestedPrice), "text-[#84CC16]"],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
            <div className={`mt-3 text-3xl font-black ${cls}`}>{value}</div>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] lg:col-span-1">
          <h2 className="text-xl font-black text-slate-900">Basic Information</h2>
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <div><span className="font-black text-slate-800">Product:</span> {product.product_name}</div>
            <div><span className="font-black text-slate-800">Category:</span> {product.product_category || product.category || "General"}</div>
            <div><span className="font-black text-slate-800">Status:</span> {product.product_status || "Active"}</div>
            <div><span className="font-black text-slate-800">Product ID:</span> {product.id}</div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] lg:col-span-1">
          <h2 className="text-xl font-black text-slate-900">Cost Information</h2>
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <div><span className="font-black text-slate-800">Total Cost:</span> {formatMoney(cost)}</div>
            <div><span className="font-black text-slate-800">Ingredient Lines:</span> {detailData.ingredientSummary.length}</div>
            <div><span className="font-black text-slate-800">Average Unit Cost:</span> {formatMoney(detailData.inventory?.average_cost || cost)}</div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] lg:col-span-1">
          <h2 className="text-xl font-black text-slate-900">Pricing</h2>
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <div><span className="font-black text-slate-800">Selling Price:</span> {formatMoney(price)}</div>
            <div><span className="font-black text-slate-800">Suggested Price:</span> {formatMoney(suggestedPrice)}</div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 md:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">GP</h2>
          <div className="mt-3 text-3xl font-black text-slate-900">{actualGp.toFixed(1)}%</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Target GP</h2>
          <div className="mt-3 text-3xl font-black text-violet-700">{targetGp.toFixed(1)}%</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Actual GP</h2>
          <div className={`mt-3 text-3xl font-black ${actualGp < targetGp ? "text-red-600" : "text-[#84CC16]"}`}>{actualGp.toFixed(1)}%</div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Recipe/BOM</h2>
          {bom ? (
            <div className="mt-5 rounded-3xl bg-violet-50 p-5">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">BOM / Recipe</div>
              <div className="mt-2 text-2xl font-black text-violet-950">{bom.bom_name}</div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/recipes/${bom.id}`} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-violet-700">Open BOM</Link>
                <Link href={`/recipes/${bom.id}/edit`} className="rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">Edit BOM</Link>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-3xl bg-red-50 p-5 text-sm font-bold leading-7 text-red-700">No BOM is linked to this product yet.</div>
          )}

          <ProductBomLinkClient productId={product.id} currentBomId={product.linked_bom_id} sellingPrice={price} targetGp={targetGp} boms={boms} />
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Ingredient Summary</h2>
          {detailData.ingredientSummary.length ? (
            <div className="mt-4 space-y-3">
              {detailData.ingredientSummary.map((row) => (
                <div key={row.line_type} className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  <div className="font-black text-slate-900">{row.line_type}</div>
                  <div className="mt-1">Qty: {Number(row.quantity || 0).toFixed(2)}</div>
                  <div>Cost: {formatMoney(row.line_cost)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl bg-slate-50 p-5 text-sm font-semibold text-slate-600">
              No ingredient summary available for this product yet.
            </div>
          )}

          <h2 className="mt-6 text-xl font-black text-slate-900">Calculation</h2>
          <div className="mt-5 space-y-4 text-sm font-semibold leading-7 text-slate-600">
            <p><b>Product Cost</b> comes from the linked BOM cost per unit.</p>
            <p><b>Actual GP%</b> = (Selling Price - Product Cost) ÷ Selling Price.</p>
            <p><b>Suggested Price</b> = Product Cost ÷ (1 - Target GP%).</p>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="text-xl font-black text-slate-900">Inventory</h2>
        {detailData.inventory ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-400">Qty On Hand</div><div className="mt-1 text-2xl font-black text-slate-900">{Number(detailData.inventory.qty_on_hand || 0).toFixed(2)}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-400">Average Cost</div><div className="mt-1 text-2xl font-black text-slate-900">{formatMoney(detailData.inventory.average_cost)}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-400">Inventory Value</div><div className="mt-1 text-2xl font-black text-slate-900">{formatMoney(detailData.inventory.inventory_value)}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-400">Status</div><div className="mt-1 text-2xl font-black text-slate-900">{detailData.inventory.stock_status}</div></div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">No inventory snapshot found for this product yet.</div>
        )}
      </section>

      <section className="mt-5 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="text-xl font-black text-slate-900">Sales Orders</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Order Date</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">GP</th>
                <th className="px-4 py-3 text-left">Invoice Link</th>
              </tr>
            </thead>
            <tbody>
              {detailData.salesOrders.length ? (
                detailData.salesOrders.map((row) => (
                  <tr key={`${row.invoice_id}-${row.invoice_number}`} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3">{formatDate(row.invoice_date)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.customer_name}</td>
                    <td className="px-4 py-3 text-right">{Number(row.quantity || 0).toFixed(2)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{queueStatusFromInvoice(row.status)}</span></td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.line_total)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.line_gp)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/customer-invoices/${encodeURIComponent(row.invoice_number)}`} className="font-black text-violet-700 hover:underline">
                        {row.invoice_number}
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm font-semibold text-slate-500">No sales orders captured for this product yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Production History</h2>
          {detailData.productionHistory.length ? (
            <div className="mt-4 space-y-3">
              {detailData.productionHistory.map((run) => (
                <div key={run.id} className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  <div className="font-black text-slate-900">{run.run_number}</div>
                  <div className="mt-1">{formatDate(run.created_at)} · {run.status}</div>
                  <div>Qty: {Number(run.actual_qty || 0).toFixed(2)} · Cost: {formatMoney(run.total_production_cost)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">No production runs recorded for this product yet.</div>
          )}
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Purchase History</h2>
          {detailData.purchaseHistory.length ? (
            <div className="mt-4 space-y-3">
              {detailData.purchaseHistory.map((tx) => (
                <div key={tx.id} className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  <div className="font-black text-slate-900">{tx.transaction_number}</div>
                  <div className="mt-1">{formatDate(tx.created_at)} · {tx.transaction_type}</div>
                  <div>Qty: {Number(tx.quantity || 0).toFixed(2)} · Cost: {formatMoney(tx.total_cost)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">No purchase or receipt history captured for this product yet.</div>
          )}
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">AI Cost Intelligence</h2>
          {detailData.aiInsights.length ? (
            <div className="mt-4 space-y-3">
              {detailData.aiInsights.map((insight) => (
                <div key={insight.id} className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  <div className="inline-flex rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">{insight.priority}</div>
                  <div className="mt-2 font-black text-slate-900">{insight.title}</div>
                  <div className="mt-1">{insight.impact}</div>
                  <div className="mt-1 text-slate-600">{insight.recommendation}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">No AI cost insights have been generated for this product yet.</div>
          )}
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Audit History</h2>
          {detailData.auditHistory.length ? (
            <div className="mt-4 space-y-3">
              {detailData.auditHistory.map((entry) => (
                <div key={entry.id} className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  <div className="font-black text-slate-900">{entry.event_type}</div>
                  <div className="mt-1">{entry.detail || "No detail"}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{formatDate(entry.created_at)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">No audit history entries are available for this product yet.</div>
          )}
        </div>
      </section>
    </VyronCostAiShell>
  );
}
