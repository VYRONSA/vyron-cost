"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Boxes,
  FileUp,
  PackageCheck,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PremiumMobileCard,
  PremiumMobileEmptyState,
  PremiumMobileStickyActionBar,
} from "@/components/vyron-mobile/design-system";
import { useModulePermissions } from "@/hooks/useModulePermissions";

type ProductDetail = {
  id: string;
  product_name: string;
  category?: string | null;
  product_category?: string | null;
  linked_bom_id?: string | null;
  product_status?: string | null;
  selling_price?: number | null;
  total_cost?: number | null;
  target_gp?: number | null;
  calculated_gp?: number | null;
  suggested_selling_price?: number | null;
  updated_at?: string | null;
};

type BomSummary = {
  id: string;
  bom_name?: string | null;
  recipe_name?: string | null;
  cost_per_unit?: number | null;
  status?: string | null;
};

type InventorySummary = {
  id: string;
  qty_on_hand?: number | null;
  average_cost?: number | null;
  inventory_value?: number | null;
  stock_status?: string | null;
  last_movement_at?: string | null;
};

type ProductionRun = {
  id: string;
  run_number?: string | null;
  status?: string | null;
  actual_qty?: number | null;
  total_production_cost?: number | null;
  created_at?: string | null;
};

type SalesHistoryRow = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  status: string;
  quantity: number;
  lineTotal: number;
  lineGp: number;
};

type InsightRow = {
  id: string;
  priority?: string | null;
  title?: string | null;
  recommendation?: string | null;
  created_at?: string | null;
};

type AuditRow = {
  id: string;
  event_type?: string | null;
  detail?: string | null;
  created_at?: string | null;
};

type Attachment = {
  id: string;
  original_filename: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  status: string | null;
  created_at?: string | null;
};

type MobileStickyAction = {
  id: string;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  disabled?: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(value || 0);
}

function when(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-ZA");
}

function gpPercent(price: number, cost: number) {
  if (!price) return 0;
  return ((price - cost) / price) * 100;
}

function statusTone(status: string) {
  const value = String(status || "").toLowerCase();
  if (value.includes("archive")) return "text-slate-700 bg-slate-100 border-slate-200";
  if (value.includes("review") || value.includes("pending")) return "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200";
  if (value.includes("active") || value.includes("approved")) return "text-violet-700 bg-violet-50 border-violet-200";
  return "text-blue-700 bg-blue-50 border-blue-200";
}

export default function VyronMobileFinishedGoodDetailWorkspace({ productId }: { productId: string }) {
  const router = useRouter();
  const { canCreate, canEdit, canDelete } = useModulePermissions("products");

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [bom, setBom] = useState<BomSummary | null>(null);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesHistoryRow[]>([]);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditRow[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detailRes, attachmentRes] = await Promise.all([
        fetch(`/api/products/${productId}`, { cache: "no-store" }),
        fetch(`/api/products/${productId}/attachments`, { cache: "no-store" }),
      ]);

      const detailJson = await detailRes.json().catch(() => ({ ok: false }));
      const attachmentJson = await attachmentRes.json().catch(() => ({ ok: false }));

      if (!detailJson.ok) {
        setMessage(detailJson.error || "Finished good not found.");
        setProduct(null);
        return;
      }

      setProduct(detailJson.product as ProductDetail);
      setBom((detailJson.bom || null) as BomSummary | null);
      setInventory((detailJson.inventory || null) as InventorySummary | null);
      setProductionRuns(Array.isArray(detailJson.productionRuns) ? (detailJson.productionRuns as ProductionRun[]) : []);
      setSalesHistory(Array.isArray(detailJson.salesHistory) ? (detailJson.salesHistory as SalesHistoryRow[]) : []);
      setInsights(Array.isArray(detailJson.aiInsights) ? (detailJson.aiInsights as InsightRow[]) : []);
      setAuditHistory(Array.isArray(detailJson.auditHistory) ? (detailJson.auditHistory as AuditRow[]) : []);
      setAttachments(Array.isArray(attachmentJson.attachments) ? (attachmentJson.attachments as Attachment[]) : []);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const price = Number(product?.selling_price || 0);
  const cost = Number(product?.total_cost || 0);
  const targetGp = Number(product?.target_gp || 0);
  const actualGp = Number(product?.calculated_gp ?? gpPercent(price, cost));
  const suggestedPrice = Number(product?.suggested_selling_price || 0);
  const marginGap = targetGp - actualGp;

  async function patchProduct(payload: Record<string, unknown>, successMessage: string, actionKey: string) {
    if (!canEdit) {
      setMessage("You do not have permission to update this finished good.");
      return;
    }

    setBusyAction(actionKey);
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMessage(json.error || "Update failed.");
        return;
      }
      setMessage(successMessage);
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function duplicateProduct() {
    if (!canCreate || !product) {
      setMessage("You do not have permission to duplicate this finished good.");
      return;
    }

    setBusyAction("duplicate");
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: `${product.product_name} Copy`,
          product_category: product.product_category || product.category || "General",
          linked_bom_id: product.linked_bom_id || null,
          selling_price: Number(product.selling_price || 0),
          total_cost: Number(product.total_cost || 0),
          target_gp: Number(product.target_gp || 0),
          product_status: "Active",
        }),
      });

      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok || !json.product?.id) {
        setMessage(json.error || "Duplicate failed.");
        return;
      }

      router.push(`/products/${json.product.id}`);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteProductRecord() {
    if (!canDelete) {
      setMessage("You do not have permission to delete finished goods.");
      return;
    }
    if (!window.confirm("Delete this finished good? This cannot be undone.")) return;

    setBusyAction("delete");
    try {
      const response = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({ ok: false }));

      if (response.status === 409 && json?.code === "PRODUCT_REFERENCED") {
        const shouldArchive = window.confirm("This product is referenced and cannot be deleted. Archive it instead?");
        if (!shouldArchive) {
          setMessage(json.message || "Product is referenced and cannot be deleted.");
          return;
        }
        await patchProduct({ product_status: "Archived" }, "Finished good archived.", "archive");
        return;
      }

      if (!json.ok) {
        setMessage(json.error || "Delete failed.");
        return;
      }

      router.push("/products");
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function uploadAttachment(file: File) {
    if (!canEdit) {
      setMessage("You do not have permission to upload attachments.");
      return;
    }

    setBusyAction("attachment-upload");
    try {
      const form = new FormData();
      form.set("file", file);

      const response = await fetch(`/api/products/${productId}/attachments`, {
        method: "POST",
        body: form,
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMessage(json.error || "Attachment upload failed.");
        return;
      }

      setMessage("Attachment uploaded.");
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteAttachment(documentId: string) {
    if (!canDelete) {
      setMessage("You do not have permission to delete attachments.");
      return;
    }
    if (!window.confirm("Delete this attachment?")) return;

    setBusyAction(`attachment-delete-${documentId}`);
    try {
      const response = await fetch(`/api/products/${productId}/attachments/${documentId}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMessage(json.error || "Attachment delete failed.");
        return;
      }
      setMessage("Attachment deleted.");
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  const stickyActions = useMemo<MobileStickyAction[]>(
    () => [
      { id: "edit", label: "Edit", variant: "primary", href: `/products/${productId}/edit`, disabled: !canEdit },
      {
        id: "active",
        label: "Set Active",
        variant: "success",
        onClick: () => void patchProduct({ product_status: "Active" }, "Finished good set to Active.", "active"),
        disabled: !canEdit,
        loading: busyAction === "active",
      },
      {
        id: "review",
        label: "Send To Review",
        variant: "secondary",
        onClick: () => void patchProduct({ product_status: "Review" }, "Finished good set to Review.", "review"),
        disabled: !canEdit,
        loading: busyAction === "review",
      },
      {
        id: "archive",
        label: "Archive",
        variant: "secondary",
        onClick: () => void patchProduct({ product_status: "Archived" }, "Finished good archived.", "archive"),
        disabled: !canDelete,
        loading: busyAction === "archive",
      },
      {
        id: "restore",
        label: "Restore",
        variant: "secondary",
        onClick: () => void patchProduct({ product_status: "Active" }, "Finished good restored.", "restore"),
        disabled: !canDelete,
        loading: busyAction === "restore",
      },
      {
        id: "duplicate",
        label: "Duplicate",
        variant: "ghost",
        onClick: () => void duplicateProduct(),
        disabled: !canCreate,
        loading: busyAction === "duplicate",
      },
      {
        id: "delete",
        label: "Delete",
        variant: "danger",
        onClick: () => void deleteProductRecord(),
        disabled: !canDelete,
        loading: busyAction === "delete",
      },
    ],
    [busyAction, canCreate, canDelete, canEdit, productId]
  );

  if (loading) {
    return <section className="px-4 pb-8 pt-1 text-sm font-semibold text-slate-500 sm:px-5">Loading finished goods workspace...</section>;
  }

  if (!product) {
    return (
      <section className="px-4 pb-8 pt-1 sm:px-5">
        <PremiumMobileEmptyState
          title="Finished good unavailable"
          description={message || "This record could not be loaded."}
          icon={AlertTriangle}
          primaryAction={{ label: "Back to Finished Goods", href: "/products" }}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4 px-4 pb-36 pt-1 sm:px-5">
      <PremiumMobileCard tone="raised" className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-[#2B1F63] via-[#3C2B7E] to-[#1B1C48] p-5 text-white">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-100">Finished Good</div>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-black tracking-[-0.04em]">{product.product_name}</div>
              <div className="mt-1 text-sm font-semibold text-indigo-100">{String(product.product_category || product.category || "General")}</div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusTone(String(product.product_status || "Active"))}`}>
              {String(product.product_status || "Active")}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-indigo-100">
            <div>Updated: {when(product.updated_at)}</div>
            <div>BOM Linked: {bom?.id ? "Yes" : "No"}</div>
            <div>Stock Status: {String(inventory?.stock_status || "Unknown")}</div>
            <div>Qty On Hand: {Number(inventory?.qty_on_hand || 0).toFixed(2)}</div>
          </div>
        </div>
      </PremiumMobileCard>

      {message ? <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-bold text-fuchsia-800">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <PremiumMobileCard tone="default" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Profitability</div>
          <div className="mt-2 text-sm font-semibold text-slate-600">Selling Price: <span className="font-black text-slate-950">{money(price)}</span></div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Cost Price: <span className="font-black text-slate-950">{money(cost)}</span></div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Target GP: <span className="font-black text-slate-950">{targetGp.toFixed(1)}%</span></div>
          <div className="mt-2 text-lg font-black text-slate-950">Actual GP {actualGp.toFixed(1)}%</div>
        </PremiumMobileCard>

        <PremiumMobileCard tone="default" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Costing & Inventory</div>
          <div className="mt-2 text-sm font-semibold text-slate-600">Suggested Price: <span className="font-black text-slate-950">{money(suggestedPrice)}</span></div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Average Cost: <span className="font-black text-slate-950">{money(Number(inventory?.average_cost || 0))}</span></div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Inventory Value: <span className="font-black text-slate-950">{money(Number(inventory?.inventory_value || 0))}</span></div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Margin Gap: <span className={`font-black ${marginGap > 0 ? "text-rose-700" : "text-violet-700"}`}>{marginGap.toFixed(1)}%</span></div>
        </PremiumMobileCard>
      </div>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400"><PackageCheck size={14} /> Recipe / BOM Link</div>
        {bom ? (
          <div className="mt-3 rounded-2xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
            <div className="font-black text-slate-950">{String(bom.bom_name || bom.recipe_name || "Linked BOM")}</div>
            <div className="mt-1 text-xs text-slate-500">Cost per unit: {money(Number(bom.cost_per_unit || 0))} • Status: {String(bom.status || "Active")}</div>
            <div className="mt-2">
              <Link href={`/recipes/${bom.id}`} className="text-xs font-black text-indigo-700">Open BOM</Link>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-slate-500">No BOM linked. Link a BOM from the edit workspace to unlock true costing.</p>
        )}
      </PremiumMobileCard>

      <div className="grid gap-3 md:grid-cols-2">
        <PremiumMobileCard tone="default" className="p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400"><Boxes size={14} /> Production History</div>
          <div className="mt-3 space-y-2">
            {productionRuns.length ? productionRuns.map((run) => (
              <div key={run.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <div className="font-black text-slate-950">{String(run.run_number || run.id)}</div>
                <div className="text-xs text-slate-500">{String(run.status || "Planned")} • Qty {Number(run.actual_qty || 0).toFixed(2)} • {money(Number(run.total_production_cost || 0))}</div>
              </div>
            )) : <p className="text-sm font-semibold text-slate-500">No production runs found yet.</p>}
          </div>
        </PremiumMobileCard>

        <PremiumMobileCard tone="default" className="p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400"><RotateCcw size={14} /> Sales History</div>
          <div className="mt-3 space-y-2">
            {salesHistory.length ? salesHistory.slice(0, 8).map((row) => (
              <div key={`${row.invoiceId}-${row.invoiceNumber}`} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <div className="font-black text-slate-950">{row.invoiceNumber}</div>
                <div className="text-xs text-slate-500">{row.customerName} • Qty {row.quantity.toFixed(2)} • {money(row.lineTotal)}</div>
              </div>
            )) : <p className="text-sm font-semibold text-slate-500">No sales history found yet.</p>}
          </div>
        </PremiumMobileCard>
      </div>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">AI Insights & Audit Trail</div>
        <div className="mt-3 space-y-2">
          {insights.slice(0, 3).map((insight) => (
            <div key={insight.id} className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900">
              <div className="font-black">{String(insight.title || "AI insight")}</div>
              <div className="text-xs text-indigo-700">{String(insight.recommendation || "Review product cost and pricing assumptions.")}</div>
            </div>
          ))}
          {auditHistory.slice(0, 4).map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <div className="font-black text-slate-950">{String(row.event_type || "Update")}</div>
              <div className="text-xs text-slate-500">{String(row.detail || "-")} • {when(row.created_at)}</div>
            </div>
          ))}
          {!insights.length && !auditHistory.length ? <p className="text-sm font-semibold text-slate-500">No insights or audit records available yet.</p> : null}
        </div>
      </PremiumMobileCard>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Attachments</div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
            <FileUp size={14} /> Upload
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAttachment(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <div className="mt-3 space-y-2">
          {attachments.length ? attachments.map((attachment) => (
            <div key={attachment.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-sm font-black text-slate-950">{attachment.original_filename || attachment.id}</div>
              <div className="text-xs font-semibold text-slate-500">{attachment.file_mime || "file"} • {attachment.file_size_bytes ? `${Math.round(Number(attachment.file_size_bytes || 0) / 1024)} KB` : "-"} • {when(attachment.created_at || null)}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
                <button
                  type="button"
                  onClick={async () => {
                    const preview = await fetch(`/api/documents/${attachment.id}/preview`).then((res) => res.json().catch(() => ({ ok: false })));
                    if (preview.ok && preview.previewUrl) window.open(String(preview.previewUrl), "_blank", "noopener,noreferrer");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-700"
                >
                  <Archive size={12} /> Preview
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAttachment(attachment.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-rose-700"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          )) : <p className="text-sm font-semibold text-slate-500">No attachments uploaded yet.</p>}
        </div>
      </PremiumMobileCard>

      <PremiumMobileStickyActionBar actions={stickyActions} />
    </section>
  );
}
