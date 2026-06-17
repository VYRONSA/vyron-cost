"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReportTableShell from "@/components/ReportTableShell";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatMoney } from "@/lib/vyron-cost-data";

type ReportRow = Record<string, unknown>;
type ReportConfig = { title: string; subtitle: string; loader: () => Promise<ReportRow[]> };

async function json(url: string) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || `Could not load ${url}`);
  return data;
}

const reportConfig: Record<string, ReportConfig> = {
  "open-purchase-orders": {
    title: "Open Purchase Orders",
    subtitle: "Purchase orders still open, approved, sent or partially received.",
    loader: async () => {
      const data = await json("/api/purchase-orders");
      return (data.orders || []).filter((row: ReportRow) => !["Closed", "Cancelled", "Fully Received"].includes(String(row.status)));
    },
  },
  "outstanding-purchase-orders": {
    title: "Outstanding Purchase Orders",
    subtitle: "PO lines with outstanding quantities requiring supplier follow-up.",
    loader: async () => {
      const data = await json("/api/back-orders");
      return data.backOrders || [];
    },
  },
  "partially-received-pos": {
    title: "Partially Received Purchase Orders",
    subtitle: "POs with outstanding quantities requiring supplier follow-up.",
    loader: async () => {
      const data = await json("/api/purchase-orders?status=Partially%20Received");
      return data.orders || [];
    },
  },
  "back-orders": {
    title: "Back Orders",
    subtitle: "Outstanding PO lines after partial goods receipts.",
    loader: async () => {
      const data = await json("/api/back-orders");
      return data.backOrders || [];
    },
  },
  "grn-variances": {
    title: "GRN Variances",
    subtitle: "Goods receipt records used to review quantity and receipt exceptions.",
    loader: async () => {
      const data = await json("/api/goods-receipts");
      return data.receipts || [];
    },
  },
  "invoice-variances": {
    title: "Invoice Variances",
    subtitle: "Supplier invoices in review, matched or variance status.",
    loader: async () => {
      const data = await json("/api/documents?view=needs-review");
      return data.documents || [];
    },
  },
  "supplier-spend": {
    title: "Supplier Spend",
    subtitle: "Supplier invoice and PO exposure for demo review.",
    loader: async () => {
      const data = await json("/api/purchase-orders");
      return data.orders || [];
    },
  },
  "supplier-price-increases": {
    title: "Supplier Price Increases",
    subtitle: "Supplier price movement from approved invoice and cost history.",
    loader: async () => {
      const data = await json("/api/documents/price-history");
      return data.rows || data.history || [];
    },
  },
  "supplier-inflation": {
    title: "Supplier Inflation",
    subtitle: "Price movement and supplier inflation watchlist.",
    loader: async () => {
      const data = await json("/api/documents/price-history");
      return data.rows || data.history || [];
    },
  },
  "supplier-performance": {
    title: "Supplier Performance",
    subtitle: "PO, receipt and variance performance by supplier.",
    loader: async () => {
      const data = await json("/api/purchase-orders");
      return data.orders || [];
    },
  },
  "duplicate-invoice-risks": {
    title: "Duplicate Invoice Risks",
    subtitle: "Once-off duplicate exposure. Not annualised unless explicitly recurring.",
    loader: async () => {
      const data = await json("/api/documents?view=needs-review");
      const docs = data.documents || [];
      const risky = docs.filter((row: ReportRow) =>
        [row.risk, row.status, row.match_status, row.filename, row.fileName, row.invoice_number, row.supplier_name, row.supplierName]
          .join(" ")
          .toLowerCase()
          .includes("duplicate") || String(row.risk || "").toLowerCase().includes("high")
      );
      return risky.length ? risky : docs.slice(0, 20);
    },
  },
  "invoices-awaiting-approval": {
    title: "Invoices Awaiting Approval",
    subtitle: "Supplier invoices extracted but not yet approved or archived.",
    loader: async () => {
      const data = await json("/api/documents?view=needs-review");
      return data.documents || [];
    },
  },
  "recovery-opportunities": {
    title: "Recovery Opportunities",
    subtitle: "Potential recovery, confidence and client-explainable exposure.",
    loader: async () => {
      const data = await json("/api/documents?view=needs-review").catch(() => ({ documents: [] }));
      return data.documents || [];
    },
  },
  "recovery-summary": {
    title: "Recovery Intelligence Summary",
    subtitle: "Recovery and leakage items visible for CFO/client review.",
    loader: async () => {
      const data = await json("/api/documents?view=needs-review").catch(() => ({ documents: [] }));
      return data.documents || [];
    },
  },
  "stock-valuation": {
    title: "Stock Valuation",
    subtitle: "Stock master quantity and value report.",
    loader: async () => {
      const data = await json("/api/inventory/stock");
      return data.items || data.stockItems || data.rows || [];
    },
  },
  "stock-variance": {
    title: "Stock Variance",
    subtitle: "Latest stock count variance review.",
    loader: async () => {
      const data = await json("/api/inventory/counts");
      return data.counts || [];
    },
  },
  "slow-moving-items": {
    title: "Slow Moving Items",
    subtitle: "Inventory items that require management review.",
    loader: async () => {
      const data = await json("/api/inventory/stock");
      return data.items || data.stockItems || data.rows || [];
    },
  },
  "product-gp": {
    title: "Product GP",
    subtitle: "Product margin performance and GP risk.",
    loader: async () => [],
  },
  "bom-changes": {
    title: "BOM Changes",
    subtitle: "Recipe/BOM changes and cost impact audit.",
    loader: async () => [],
  },
  "margin-erosion": {
    title: "Margin Erosion",
    subtitle: "Products exposed to supplier increases and GP erosion.",
    loader: async () => [],
  },
};

function cellValue(row: ReportRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "—";
}

function rowHref(row: ReportRow) {
  const id = String(cellValue(row, ["id", "storageDocumentId", "document_id"]));
  const poId = String(cellValue(row, ["purchase_order_id"]));
  const reference = String(cellValue(row, ["po_number", "grn_number", "invoice_number", "displayId", "fileName", "filename", "id"]));
  if (String(row.grn_number || reference).startsWith("GRN")) return `/goods-receipts/${id}`;
  if (poId !== "—" && poId) return `/purchase-orders/${poId}`;
  if (String(row.po_number || reference).startsWith("PO")) return `/purchase-orders/${id}`;
  if (id !== "—") return `/document-intelligence/${id}`;
  return "/reports";
}

export default function ReportDetailClient({ reportId }: { reportId: string }) {
  const config = reportConfig[reportId] || {
    title: reportId.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" "),
    subtitle: "Demo-ready report fallback. Print and CSV export remain available.",
    loader: reportConfig["open-purchase-orders"].loader,
  };
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLoading(true);
    setMessage("");
    config.loader()
      .then(setRows)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load report."))
      .finally(() => setLoading(false));
  }, [reportId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
  }, [rows, search]);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "reports",
        badge: "Reporting Intelligence",
        title: "Report Intelligence Detail",
        subtitle: "Explore operational and financial report outputs with export-ready presentation.",
        outcomes: ["Speed executive report review", "Drill into exceptions quickly", "Keep print and export workflows ready"],
        formulas: ["Displayed Value = Numeric formatted money or source value", "Filtered Rows = Search term match over row payload", "Reference Routing = Dynamic link to source record"],
        intelligenceItems: [
          { label: "Report context", detail: config.title },
          { label: "Rows in view", detail: `${filtered.length} records after current filters` },
          { label: "Export readiness", detail: "CSV and print-compatible table format retained" },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="print:hidden">
        <Link href="/reports" className="inline-flex rounded-2xl border border-violet-100 bg-white px-4 py-2 text-sm font-black text-violet-700">← Back</Link>
        </div>
        <ReportTableShell title={config.title} subtitle={config.subtitle} search={search} onSearch={setSearch} resultCount={filtered.length} exportFileName={`vyron-cost-${reportId}.csv`}>
        {message ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">{message}</p> : null}
        {loading ? <p className="py-8 text-sm font-bold text-slate-500">Loading report…</p> : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-violet-100">
            <table data-report-table className="min-w-[1050px] w-full text-left text-sm">
              <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100"><tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Supplier / Name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Value</th><th className="px-4 py-3 print:hidden">Action</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center font-bold text-slate-500">No records found.</td></tr> : null}
                {filtered.map((row, index) => {
                  const id = String(cellValue(row, ["id", "storageDocumentId", "document_id"]));
                  const reference = String(cellValue(row, ["po_number", "grn_number", "invoice_number", "displayId", "fileName", "filename", "count_number", "item_code", "id"]));
                  const supplier = String(cellValue(row, ["supplier_name_snapshot", "supplier", "supplier_name", "supplierName", "item_description", "description", "item_name", "report_name"]));
                  const status = String(cellValue(row, ["status", "dbStatus", "risk", "match_status", "variance_class"]));
                  const date = String(cellValue(row, ["order_date", "received_at", "invoice_date", "created_at", "date"])).slice(0, 10);
                  const rawValue = cellValue(row, ["total", "expected_total", "estimated_value", "invoice_total", "new_price", "variance_value_total", "stock_value", "value_on_hand", "outstanding_qty"]);
                  const value = Number(rawValue);
                  const href = rowHref(row);
                  return <tr key={`${id}-${index}`} className="border-t border-slate-100"><td className="px-4 py-3 font-black text-violet-700">{reference}</td><td className="px-4 py-3 font-bold text-slate-700">{supplier}</td><td className="px-4 py-3">{status}</td><td className="px-4 py-3">{date || "—"}</td><td className="px-4 py-3 font-black">{Number.isFinite(value) ? formatMoney(value) : String(rawValue || "—")}</td><td className="px-4 py-3 print:hidden"><Link href={href} className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open →</Link></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        </ReportTableShell>
      </section>
    </VyronPremiumPageShell>
  );
}
