"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import { useEffect, useState } from "react";
import EditRouteGuard from "@/components/EditRouteGuard";
import ModulePageShell from "@/components/vyron-cost/ModulePageShell";
import StatusPill from "@/components/vyron-cost/StatusPill";
import CustomerInvoiceDetailActions from "@/components/vyron-cost/customers/CustomerInvoiceDetailActions";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import { customerInvoices, getInvoiceTotals } from "@/lib/vyron-cost/manufacturing-data";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { useInventoryPermissions, useInvoicePermissions } from "@/hooks/useModulePermissions";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  getInvoiceStockPostingStatus,
  type InvoiceStockPostingStatus,
} from "@/lib/vyron-invoice-stock-status";

type DetailInvoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  invoiceDate: string;
  status: string;
  stockPostingStatus: InvoiceStockPostingStatus;
  stockPosted: boolean;
  stockReversed: boolean;
  lines: Array<{
    productId: string;
    productName: string;
    quantity: number;
    sellingPrice: number;
    costPerUnit: number;
  }>;
};

export default function CustomerInvoiceDetailPageClient({ invoiceNumber }: { invoiceNumber: string }) {
  const decoded = decodeURIComponent(invoiceNumber);
  const { canApprove } = useInvoicePermissions();
  const { canPostAdjustment } = useInventoryPermissions();
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stockMessage, setStockMessage] = useState("");
  const [stockBusy, setStockBusy] = useState(false);
  const [liveInvoice, setLiveInvoice] = useState<DetailInvoice | null>(null);

  const demoInvoice = demoMode
    ? customerInvoices.find((item) => item.invoiceNumber === decoded) || null
    : null;

  const invoice: DetailInvoice | null = demoMode
    ? demoInvoice
      ? {
          id: demoInvoice.invoiceNumber,
          invoiceNumber: demoInvoice.invoiceNumber,
          customerName: demoInvoice.customerName,
          invoiceDate: demoInvoice.invoiceDate,
          status: demoInvoice.status,
          stockPostingStatus: "Not Posted" as InvoiceStockPostingStatus,
          stockPosted: false,
          stockReversed: false,
          lines: demoInvoice.lines.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            quantity: line.quantity,
            sellingPrice: line.sellingPrice,
            costPerUnit: line.costPerUnit,
          })),
        }
      : null
    : liveInvoice;

  useEffect(() => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);

    async function loadLive() {
      if (demo) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const listRes = await fetch("/api/customer-invoices");
        const list = await listRes.json();
        const row = (list.invoices || []).find(
          (item: { invoice_number: string }) => item.invoice_number === decoded
        );
        if (!row) {
          setLiveInvoice(null);
          return;
        }
        const detailRes = await fetch(`/api/customer-invoices/${row.id}`);
        const detail = await detailRes.json();
        if (!detail.ok) {
          setLiveInvoice(null);
          return;
        }
        const inv = detail.invoice;
        setLiveInvoice({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          customerName: inv.customer_name,
          invoiceDate: inv.invoice_date,
          status: inv.status,
          stockPosted: Boolean(inv.stock_posted),
          stockReversed: Boolean(inv.stock_reversed),
          stockPostingStatus: getInvoiceStockPostingStatus({
            stock_posted: Boolean(inv.stock_posted),
            stock_reversed: Boolean(inv.stock_reversed),
          }),
          lines: (detail.lines || []).map((line: Record<string, unknown>) => ({
            productId: String(line.product_id || ""),
            productName: String(line.product_name || ""),
            quantity: Number(line.quantity || 0),
            sellingPrice: Number(line.selling_price || 0),
            costPerUnit: Number(line.cost_per_unit || 0),
          })),
        });
      } finally {
        setLoading(false);
      }
    }

    void loadLive();
  }, [decoded]);

  async function reloadLive() {
    if (!liveInvoice) return;
    const detailRes = await fetch(`/api/customer-invoices/${liveInvoice.id}`);
    const detail = await detailRes.json();
    if (!detail.ok) return;
    const inv = detail.invoice;
    setLiveInvoice({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      customerName: inv.customer_name,
      invoiceDate: inv.invoice_date,
      status: inv.status,
      stockPosted: Boolean(inv.stock_posted),
      stockReversed: Boolean(inv.stock_reversed),
      stockPostingStatus: getInvoiceStockPostingStatus({
        stock_posted: Boolean(inv.stock_posted),
        stock_reversed: Boolean(inv.stock_reversed),
      }),
      lines: (detail.lines || []).map((line: Record<string, unknown>) => ({
        productId: String(line.product_id || ""),
        productName: String(line.product_name || ""),
        quantity: Number(line.quantity || 0),
        sellingPrice: Number(line.selling_price || 0),
        costPerUnit: Number(line.cost_per_unit || 0),
      })),
    });
  }

  async function postStock(allowOverride = false) {
    if (!invoice || demoMode || !canApprove) return;
    setStockBusy(true);
    setStockMessage("");
    const res = await fetch(`/api/customer-invoices/${invoice.id}/post-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowOverride }),
    });
    const data = await res.json();
    setStockBusy(false);
    if (!data.ok) {
      setStockMessage(data.error || "Could not post stock.");
      return;
    }
    setStockMessage(data.alreadyPosted ? "Stock already posted." : "Stock posted.");
    await reloadLive();
  }

  async function reverseStock() {
    if (!invoice || demoMode || !canApprove) return;
    if (!confirm(`Reverse stock for ${invoice.invoiceNumber}?`)) return;
    setStockBusy(true);
    setStockMessage("");
    const res = await fetch(`/api/customer-invoices/${invoice.id}/reverse-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setStockBusy(false);
    if (!data.ok) {
      setStockMessage(data.error || "Could not reverse stock.");
      return;
    }
    setStockMessage("Stock reversed.");
    await reloadLive();
  }

  if (loading) {
    return (
      <EditRouteGuard permission="view_customer_invoices">
        <ModulePageShell eyebrow="Customer Invoice" title="Loading…" subtitle="">
          <p className="text-sm font-semibold text-slate-500">Loading invoice…</p>
        </ModulePageShell>
      </EditRouteGuard>
    );
  }

  if (!invoice) {
    return (
      <EditRouteGuard permission="view_customer_invoices">
        <ModulePageShell eyebrow="Customer Invoice" title="Not found" subtitle={decoded}>
          <p className="text-sm font-semibold text-slate-500">Invoice not found in this workspace.</p>
        </ModulePageShell>
      </EditRouteGuard>
    );
  }

  const totals = demoMode && demoInvoice
    ? getInvoiceTotals(demoInvoice)
    : {
        salesValue: invoice.lines.reduce((sum, line) => sum + line.quantity * line.sellingPrice, 0),
        costValue: invoice.lines.reduce((sum, line) => sum + line.quantity * line.costPerUnit, 0),
        grossProfit: 0,
        gpPercentage: 0,
      };
  if (!demoMode) {
    totals.grossProfit = totals.salesValue - totals.costValue;
    totals.gpPercentage = totals.salesValue ? (totals.grossProfit / totals.salesValue) * 100 : 0;
  }

  const unlinkedLines = invoice.lines.some((line) => !line.productId);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "customers",
        title: "Customer Invoice Detail Page",
        subtitle: "Premium VYRON COST workflow for customer invoice detail page.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <EditRouteGuard permission="view_customer_invoices">
            <ModulePageShell
              eyebrow="Customer Invoice"
              title={invoice.invoiceNumber}
              subtitle={`${invoice.customerName} • ${invoice.invoiceDate}`}
              actions={<CustomerInvoiceDetailActions invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />}
            >
              <section className="grid gap-4 md:grid-cols-6">
                <div className="rounded-[28px] bg-white/90 p-5 shadow-lg">
                  <p className="text-xs font-black uppercase text-slate-500">Status</p>
                  <div className="mt-3">
                    <StatusPill status={invoice.status} />
                  </div>
                </div>
                <div className="rounded-[28px] bg-white/90 p-5 shadow-lg">
                  <p className="text-xs font-black uppercase text-slate-500">Stock Posting</p>
                  <div className="mt-3">
                    <StockStatusPill status={invoice.stockPostingStatus} />
                  </div>
                </div>
                <div className="rounded-[28px] bg-white/90 p-5 shadow-lg">
                  <p className="text-xs font-black uppercase text-slate-500">Sales</p>
                  <p className="mt-2 text-3xl font-black">{formatCurrency(totals.salesValue)}</p>
                </div>
                <div className="rounded-[28px] bg-white/90 p-5 shadow-lg">
                  <p className="text-xs font-black uppercase text-slate-500">COGS</p>
                  <p className="mt-2 text-3xl font-black">{formatCurrency(totals.costValue)}</p>
                </div>
                <div className="rounded-[28px] bg-white/90 p-5 shadow-lg">
                  <p className="text-xs font-black uppercase text-slate-500">GP</p>
                  <p className="mt-2 text-3xl font-black">{formatCurrency(totals.grossProfit)}</p>
                </div>
                <div className="rounded-[28px] bg-white/90 p-5 shadow-lg">
                  <p className="text-xs font-black uppercase text-slate-500">GP %</p>
                  <p className="mt-2 text-3xl font-black">{formatNumber(totals.gpPercentage)}%</p>
                </div>
              </section>
      
              {!demoMode && unlinkedLines ? (
                <p className="mt-4 rounded-2xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-4 py-3 text-sm font-bold text-[var(--vyron-warning-fg)]">
                  Warning: one or more invoice lines have no stock item linked.
                </p>
              ) : null}
      
              {stockMessage ? (
                <p className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">
                  {stockMessage}
                </p>
              ) : null}
      
              {!demoMode && canApprove ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {invoice.stockPostingStatus !== "Posted" && invoice.stockPostingStatus !== "Reversed" ? (
                    <button
                      type="button"
                      disabled={stockBusy}
                      onClick={() => void postStock(false)}
                      className="rounded-full bg-violet-700 px-4 py-2 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
                    >
                      Post Stock
                    </button>
                  ) : null}
                  {canPostAdjustment && invoice.stockPostingStatus !== "Posted" && invoice.stockPostingStatus !== "Reversed" ? (
                    <button
                      type="button"
                      disabled={stockBusy}
                      onClick={() => void postStock(true)}
                      className="rounded-full border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-4 py-2 text-sm font-black text-[var(--vyron-warning-fg)] disabled:opacity-60"
                    >
                      Post Stock (Override)
                    </button>
                  ) : null}
                  {invoice.stockPostingStatus === "Posted" ? (
                    <button
                      type="button"
                      disabled={stockBusy}
                      onClick={() => void reverseStock()}
                      className="rounded-full bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 disabled:opacity-60"
                    >
                      Reverse Stock
                    </button>
                  ) : null}
                </div>
              ) : null}
      
              <section className="mt-6 rounded-[30px] bg-white/90 p-6 shadow-xl shadow-violet-100">
                <h2 className="text-xl font-black">Invoice lines</h2>
                <EnterpriseScrollContainer className="mt-4">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-3">Product</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Selling Price</th>
                        <th className="text-right">Cost / Unit</th>
                        <th className="text-right">Line GP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoice.lines.map((line) => (
                        <tr key={`${line.productId}-${line.productName}`}>
                          <td className="py-4 font-bold">{line.productName}</td>
                          <td className="text-right">{line.quantity}</td>
                          <td className="text-right">{formatCurrency(line.sellingPrice)}</td>
                          <td className="text-right">{formatCurrency(line.costPerUnit)}</td>
                          <td className="text-right">
                            {formatCurrency((line.sellingPrice - line.costPerUnit) * line.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </EnterpriseScrollContainer>
              </section>
            </ModulePageShell>
          </EditRouteGuard>
    </VyronPremiumPageShell>
  );
}

function StockStatusPill({ status }: { status: InvoiceStockPostingStatus }) {
  const classes: Record<InvoiceStockPostingStatus, string> = {
    "Not Posted": "bg-slate-100 text-slate-700",
    Posted: "bg-[#A855F7]/12 text-[#4D7C0F]",
    Reversed: "bg-rose-100 text-rose-700",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${classes[status]}`}>{status}</span>;
}
