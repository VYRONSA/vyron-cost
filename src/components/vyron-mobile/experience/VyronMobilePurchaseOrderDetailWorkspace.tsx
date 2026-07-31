"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ClipboardList,
  Download,
  FileText,
  FileUp,
  Mail,
  PackageCheck,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PremiumMobileCard,
  PremiumMobileEmptyState,
  PremiumMobileStickyActionBar,
} from "@/components/vyron-mobile/design-system";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";

type PoLine = {
  id: string;
  item_name: string;
  item_type: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
  received_qty: number;
  outstanding_qty: number;
};

type GoodsReceipt = {
  id: string;
  grn_number: string | null;
  receipt_type: string | null;
  received_at: string | null;
  status: string | null;
};

type LinkedInvoice = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  total: number | null;
};

type PurchaseOrderDetail = {
  id: string;
  po_number: string;
  supplier_name_snapshot: string | null;
  status: string;
  notes: string | null;
  order_date: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  invoice_total: number;
  variance: number;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  lines: PoLine[];
  supplier: {
    contact_email: string | null;
    invoice_email: string | null;
    phone: string | null;
  } | null;
};

type RelatedSummary = {
  id: string;
  po_number: string;
  status: string;
  total: number;
  created_at: string;
};

type Attachment = {
  id: string;
  original_filename: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  status: string | null;
  created_at?: string | null;
};

type EmailHistory = {
  id: string;
  eventType: string;
  status: string;
  recipient: string;
  subject: string;
  sentAt: string;
  error: string | null;
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
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-ZA");
}

function statusTone(status: string) {
  const value = String(status || "").toLowerCase();
  if (value.includes("cancel")) return "text-rose-700 bg-rose-50 border-rose-200";
  if (value.includes("received") || value.includes("closed")) return "text-violet-700 bg-violet-50 border-violet-200";
  if (value.includes("approved") || value.includes("sent")) return "text-blue-700 bg-blue-50 border-blue-200";
  if (value.includes("submit") || value.includes("partial")) return "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

export default function VyronMobilePurchaseOrderDetailWorkspace({ poId }: { poId: string }) {
  const router = useRouter();
  const { canEdit, canApprove, canDelete, canCreate } = useModulePermissions("purchase_orders");
  const { canCreate: canReceiveGoods } = useModulePermissions("goods_receipts");

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [linkedInvoices, setLinkedInvoices] = useState<LinkedInvoice[]>([]);
  const [relatedOrders, setRelatedOrders] = useState<RelatedSummary[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [emailHistory, setEmailHistory] = useState<EmailHistory[]>([]);
  const [message, setMessage] = useState("");
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { query } = poApiWorkspaceContext();
    try {
      const [detailRes, listRes, attachmentRes, emailHistoryRes] = await Promise.all([
        fetch(`/api/purchase-orders/${poId}${query}`, { cache: "no-store" }),
        fetch(`/api/purchase-orders${query}`, { cache: "no-store" }),
        fetch(`/api/purchase-orders/${poId}/attachments${query}`, { cache: "no-store" }),
        fetch(`/api/purchase-orders/${poId}/email-history${query}`, { cache: "no-store" }),
      ]);
      const detailJson = await detailRes.json().catch(() => ({ ok: false }));
      const listJson = await listRes.json().catch(() => ({ ok: false }));
      const attachmentJson = await attachmentRes.json().catch(() => ({ ok: false }));
      const emailHistoryJson = await emailHistoryRes.json().catch(() => ({ ok: false }));

      if (detailJson.ok) {
        setPo(detailJson.purchaseOrder as PurchaseOrderDetail);
        setGoodsReceipts((detailJson.goodsReceipts || []) as GoodsReceipt[]);
        setLinkedInvoices((detailJson.linkedInvoices || []) as LinkedInvoice[]);
        setAttachments(Array.isArray(attachmentJson.attachments) ? (attachmentJson.attachments as Attachment[]) : []);
        setEmailHistory(Array.isArray(emailHistoryJson.history) ? (emailHistoryJson.history as EmailHistory[]) : []);

        const supplier = String(detailJson.purchaseOrder?.supplier_name_snapshot || "").toLowerCase();
        const related = Array.isArray(listJson.orders)
          ? (listJson.orders as RelatedSummary[])
              .filter((row) => row.id !== poId)
              .filter((row) => String(row.po_number || "").trim() && String(row.status || "").trim())
              .filter((row) =>
                supplier
                  ? String(row.po_number || "").toLowerCase().includes(supplier) || String((row as unknown as { supplier_name_snapshot?: string }).supplier_name_snapshot || "").toLowerCase() === supplier
                  : true
              )
              .slice(0, 5)
          : [];
        setRelatedOrders(related);
      } else {
        setMessage(detailJson.error || "Purchase order not found.");
      }
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: "Approved" | "Cancelled" | "Sent") {
    if (status === "Approved" && !canApprove) {
      setMessage("You do not have permission to approve this purchase order.");
      return;
    }
    if (status !== "Approved" && !(canEdit || canApprove)) {
      setMessage("You do not have permission to update this purchase order.");
      return;
    }
    setBusyAction(status);
    try {
      const { body } = poApiWorkspaceContext();
      const response = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, approvalNotes: `Status -> ${status}`, approvedBy: "mobile-workspace", ...body }),
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMessage(json.error || "Status update failed.");
        return;
      }
      setMessage(`Purchase order marked as ${status}.`);
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function rejectOrder() {
    if (!(canEdit || canApprove)) {
      setMessage("You do not have permission to reject this purchase order.");
      return;
    }
    const reason = rejectReason.trim();
    if (!reason) {
      setMessage("Reject reason is required.");
      return;
    }
    setBusyAction("Rejected");
    try {
      const { body } = poApiWorkspaceContext();
      const response = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Rejected",
          rejectReason: reason,
          approvalComments: "Rejected on mobile workspace.",
          approvedBy: "mobile-workspace",
          ...body,
        }),
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMessage(json.error || "Reject failed.");
        return;
      }
      setRejectReason("");
      setMessage("Purchase order rejected with reason.");
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function archiveOrder(action: "archive" | "restore") {
    if (!canDelete) {
      setMessage("You do not have permission to archive or restore this purchase order.");
      return;
    }
    setBusyAction(action);
    try {
      const { body } = poApiWorkspaceContext();
      const response = await fetch(`/api/purchase-orders/${poId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: action === "archive" ? "Archived from mobile detail." : "Restored from mobile detail.", ...body }),
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMessage(json.error || `${action} failed.`);
        return;
      }
      setMessage(action === "archive" ? "Purchase order archived." : "Purchase order restored.");
      await load();
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
      const { body } = poApiWorkspaceContext();
      const form = new FormData();
      form.set("file", file);
      form.set("documentType", "purchase_order_attachment");
      form.set("actor", "mobile-workspace");
      if (body.workspaceId) form.set("workspaceId", body.workspaceId);
      if (body.companyId) form.set("companyId", body.companyId);

      const response = await fetch(`/api/purchase-orders/${poId}/attachments`, {
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
      const { query } = poApiWorkspaceContext();
      const response = await fetch(`/api/purchase-orders/${poId}/attachments/${documentId}${query}`, {
        method: "DELETE",
      });
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

  async function duplicateOrder() {
    if (!canCreate || !po) {
      setMessage("You do not have permission to duplicate this purchase order.");
      return;
    }
    setBusyAction("duplicate");
    try {
      const { body } = poApiWorkspaceContext();
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_number: `${po.po_number}-COPY`,
          supplier_id: null,
          supplier_name_snapshot: po.supplier_name_snapshot || "",
          status: "Draft",
          order_date: new Date().toISOString().slice(0, 10),
          notes: `Duplicated from ${po.po_number}`,
          lines: po.lines.map((line) => ({
            item_type: line.item_type,
            item_name: line.item_name,
            item_id: null,
            quantity: Number(line.quantity || 0),
            unit: line.unit,
            unit_price: Number(line.unit_price || 0),
            vat_rate: Number(line.vat_rate || 0),
          })),
          ...body,
        }),
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok || !json.purchaseOrder?.id) {
        setMessage(json.error || "Could not duplicate purchase order.");
        return;
      }
      router.push(`/purchase-orders/${json.purchaseOrder.id}`);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteOrder() {
    if (!canDelete) {
      setMessage("You do not have permission to delete this purchase order.");
      return;
    }
    if (!window.confirm("Delete this purchase order? This cannot be undone.")) return;
    setBusyAction("delete");
    try {
      const { query } = poApiWorkspaceContext();
      const response = await fetch(`/api/purchase-orders/${poId}${query}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMessage(json.error || "Delete failed.");
        return;
      }
      router.push("/purchase-orders");
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  function printOrder() {
    const { query } = poApiWorkspaceContext();
    window.open(`/api/purchase-orders/${poId}/pdf${query}`, "_blank", "noopener,noreferrer");
  }

  async function emailSupplier() {
    if (!po) return;
    const supplierEmail = String(po.supplier?.contact_email || po.supplier?.invoice_email || "").trim();
    if (!supplierEmail) {
      setMessage("Supplier email is not configured.");
      return;
    }
    setBusyAction("email");
    try {
      const { body } = poApiWorkspaceContext();
      const response = await fetch(`/api/purchase-orders/${poId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: supplierEmail,
          subject: `Purchase Order ${po.po_number}`,
          textBody: `Please find attached purchase order ${po.po_number}.`,
          actor: "mobile-workspace",
          ...body,
        }),
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMessage(json.error || "Email send failed.");
        return;
      }
      setMessage(json.status === "sent" ? "Purchase order email sent." : "Purchase order email failed.");
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  const totalReceivedQty = useMemo(
    () => (po?.lines || []).reduce((sum, line) => sum + Number(line.received_qty || 0), 0),
    [po]
  );

  const totalOutstandingQty = useMemo(
    () => (po?.lines || []).reduce((sum, line) => sum + Number(line.outstanding_qty || 0), 0),
    [po]
  );

  const stickyActions = useMemo<MobileStickyAction[]>(
    () => [
      { id: "edit", label: "Edit", variant: "primary" as const, href: `/purchase-orders/${poId}/edit`, disabled: !canEdit },
      { id: "approve", label: "Approve", variant: "success" as const, onClick: () => void setStatus("Approved"), disabled: !canApprove, loading: busyAction === "Approved" },
      { id: "reject", label: "Reject", variant: "danger" as const, onClick: () => void rejectOrder(), disabled: !(canEdit || canApprove), loading: busyAction === "Rejected" },
      { id: "print", label: "Print PDF", variant: "ghost" as const, onClick: printOrder },
      { id: "email", label: "Email", variant: "ghost" as const, onClick: () => void emailSupplier(), loading: busyAction === "email" },
      { id: "receive", label: "Receive Goods", variant: "secondary" as const, href: `/goods-receipts/new?po=${poId}`, disabled: !canReceiveGoods },
      { id: "invoice", label: "Create Supplier Invoice", variant: "secondary" as const, href: "/document-intelligence" },
      { id: "duplicate", label: "Duplicate", variant: "secondary" as const, onClick: () => void duplicateOrder(), disabled: !canCreate, loading: busyAction === "duplicate" },
      { id: "archive", label: "Archive", variant: "secondary" as const, onClick: () => void archiveOrder("archive"), disabled: !canDelete, loading: busyAction === "archive" },
      { id: "restore", label: "Restore", variant: "secondary" as const, onClick: () => void archiveOrder("restore"), disabled: !canDelete, loading: busyAction === "restore" },
      { id: "delete", label: "Delete", variant: "danger" as const, onClick: () => void deleteOrder(), disabled: !canDelete, loading: busyAction === "delete" },
    ],
    [busyAction, canApprove, canCreate, canDelete, canEdit, canReceiveGoods, poId, rejectReason]
  );

  if (loading) {
    return <section className="px-4 pb-8 pt-1 text-sm font-semibold text-slate-500 sm:px-5">Loading purchase order workspace...</section>;
  }

  if (!po) {
    return (
      <section className="px-4 pb-8 pt-1 sm:px-5">
        <PremiumMobileEmptyState
          title="Purchase order unavailable"
          description={message || "This record could not be loaded."}
          icon={AlertTriangle}
          primaryAction={{ label: "Back to Purchase Orders", href: "/purchase-orders" }}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4 px-4 pb-36 pt-1 sm:px-5">
      <PremiumMobileCard tone="raised" className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-[#062A2A] via-[#074F50] to-[#0D7B7E] p-5 text-white">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-100">Purchase Order</div>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-black tracking-[-0.04em]">{po.po_number}</div>
              <div className="mt-1 text-sm font-semibold text-indigo-50">{po.supplier_name_snapshot || "Supplier"}</div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusTone(po.status)}`}>
              {po.status}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-indigo-50/95">
            <div>Required: {when(po.order_date)}</div>
            <div>Expected: {when(po.order_date)}</div>
            <div>Priority: {Number(po.total || 0) >= 200000 ? "High" : Number(po.total || 0) >= 60000 ? "Medium" : "Normal"}</div>
            <div>Workflow: {po.status}</div>
          </div>
        </div>
      </PremiumMobileCard>

      {message ? <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-bold text-fuchsia-800">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <PremiumMobileCard tone="default" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Totals</div>
          <div className="mt-2 text-sm font-semibold text-slate-600">Subtotal: <span className="font-black text-slate-950">{money(Number(po.subtotal || 0))}</span></div>
          <div className="mt-1 text-sm font-semibold text-slate-600">VAT: <span className="font-black text-slate-950">{money(Number(po.vat_amount || 0))}</span></div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Discount: <span className="font-black text-slate-950">{money(0)}</span></div>
          <div className="mt-2 text-lg font-black text-slate-950">{money(Number(po.total || 0))}</div>
        </PremiumMobileCard>
        <PremiumMobileCard tone="default" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Fulfillment</div>
          <div className="mt-2 text-sm font-semibold text-slate-600">Received Qty: <span className="font-black text-slate-950">{totalReceivedQty.toFixed(2)}</span></div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Outstanding Qty: <span className="font-black text-slate-950">{totalOutstandingQty.toFixed(2)}</span></div>
          <div className="mt-2 text-sm font-semibold text-slate-600">Inventory Impact: <span className="font-black text-slate-950">{totalReceivedQty > 0 ? "Posted" : "Pending"}</span></div>
        </PremiumMobileCard>
        <PremiumMobileCard tone="default" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Supplier & Contact</div>
          <div className="mt-2 text-sm font-black text-slate-950">{po.supplier_name_snapshot || "Supplier"}</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Email: {po.supplier?.contact_email || po.supplier?.invoice_email || "Not set"}</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Phone: {po.supplier?.phone || "Not set"}</div>
        </PremiumMobileCard>
      </div>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Line Items</div>
        <div className="mt-3 space-y-3">
          {po.lines.map((line) => {
            const expanded = expandedLines[line.id] === true;
            return (
              <article key={line.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setExpandedLines((current) => ({ ...current, [line.id]: !expanded }))}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-sm font-black text-slate-950">{line.item_name}</div>
                    <div className="text-xs font-semibold text-slate-500">{line.item_type} · {line.quantity} {line.unit}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-950">{money(Number(line.line_total || 0))}</div>
                    <div className="text-[11px] font-bold text-slate-500">{expanded ? "Collapse" : "Expand"}</div>
                  </div>
                </button>
                {expanded ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                    <div>Unit Price: <span className="font-black text-slate-950">{money(Number(line.unit_price || 0))}</span></div>
                    <div>VAT %: <span className="font-black text-slate-950">{Number(line.vat_rate || 0).toFixed(2)}</span></div>
                    <div>VAT Amount: <span className="font-black text-slate-950">{money(Number(line.vat_amount || 0))}</span></div>
                    <div>Discount: <span className="font-black text-slate-950">{money(0)}</span></div>
                    <div>Received: <span className="font-black text-slate-950">{Number(line.received_qty || 0).toFixed(2)}</span></div>
                    <div>Outstanding: <span className="font-black text-slate-950">{Number(line.outstanding_qty || 0).toFixed(2)}</span></div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </PremiumMobileCard>

      <div className="grid gap-3 md:grid-cols-2">
        <PremiumMobileCard tone="default" className="p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400"><PackageCheck size={14} /> Goods Receipt History</div>
          <div className="mt-3 space-y-2">
            {goodsReceipts.length ? goodsReceipts.map((grn) => (
              <Link key={grn.id} href={`/goods-receipts/${grn.id}`} className="block rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <div className="font-black text-slate-950">{grn.grn_number || grn.id}</div>
                <div className="text-xs text-slate-500">{grn.receipt_type || "receipt"} · {when(grn.received_at)} · {grn.status || "Open"}</div>
              </Link>
            )) : <p className="text-sm font-semibold text-slate-500">No goods receipts posted yet.</p>}
          </div>
        </PremiumMobileCard>

        <PremiumMobileCard tone="default" className="p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400"><FileText size={14} /> Supplier Invoice History</div>
          <div className="mt-3 space-y-2">
            {linkedInvoices.length ? linkedInvoices.map((invoice) => (
              <Link key={invoice.id} href={`/document-intelligence/${invoice.id}`} className="block rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <div className="font-black text-slate-950">{invoice.invoice_number || invoice.id}</div>
                <div className="text-xs text-slate-500">{invoice.status || "review"} · {money(Number(invoice.total || 0))}</div>
              </Link>
            )) : <p className="text-sm font-semibold text-slate-500">No supplier invoices linked yet.</p>}
          </div>
        </PremiumMobileCard>
      </div>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Approval History & Audit Trail</div>
        <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
          <div className="rounded-xl border border-slate-200 px-3 py-2">Created: {when(po.order_date)} · Workflow {po.status}</div>
          <div className="rounded-xl border border-slate-200 px-3 py-2">Approved by: {po.approved_by || "Pending approval"} {po.approved_at ? `on ${when(po.approved_at)}` : ""}</div>
          <div className="rounded-xl border border-slate-200 px-3 py-2">Approval notes: {po.approval_notes || "No notes"}</div>
          <div className="rounded-xl border border-slate-200 px-3 py-2">Variance tracking: Invoice {money(Number(po.invoice_total || 0))} vs PO {money(Number(po.total || 0))} (Variance {money(Number(po.variance || 0))})</div>
          <div className="rounded-xl border border-slate-200 px-3 py-2">Notes: {po.notes || "No notes"}</div>
        </div>
        <div className="mt-3">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Reject Reason</label>
          <textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            rows={2}
            placeholder="Provide rejection reason or revision requirements"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
          />
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
          {attachments.length ? (
            attachments.map((attachment) => (
              <div key={attachment.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-sm font-black text-slate-950">{attachment.original_filename || attachment.id}</div>
                <div className="text-xs font-semibold text-slate-500">{attachment.file_mime || "file"} · {attachment.file_size_bytes ? `${Math.round(Number(attachment.file_size_bytes || 0) / 1024)} KB` : "-"} · {when(attachment.created_at || null)}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
                  <button
                    type="button"
                    onClick={async () => {
                      const preview = await fetch(`/api/documents/${attachment.id}/preview`).then((r) => r.json().catch(() => ({ ok: false })));
                      if (preview.ok && preview.previewUrl) window.open(String(preview.previewUrl), "_blank", "noopener,noreferrer");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-700"
                  >
                    <Download size={12} /> Preview
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
            ))
          ) : (
            <p className="text-sm font-semibold text-slate-500">No attachments uploaded yet.</p>
          )}
        </div>
      </PremiumMobileCard>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Email History</div>
        <div className="mt-3 space-y-2">
          {emailHistory.length ? (
            emailHistory.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
                <div className="font-black text-slate-950">{entry.status === "sent" ? "Sent" : "Failed"} · {entry.recipient || "recipient"}</div>
                <div className="text-xs text-slate-500">{entry.subject || "Purchase Order"} · {when(entry.sentAt)}</div>
                {entry.error ? <div className="mt-1 text-xs font-black text-rose-700">{entry.error}</div> : null}
                {entry.status !== "sent" ? (
                  <button
                    type="button"
                    onClick={() => void emailSupplier()}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-700"
                  >
                    <RotateCcw size={12} /> Retry
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm font-semibold text-slate-500">No email history yet.</p>
          )}
        </div>
      </PremiumMobileCard>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Supplier Intelligence</div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">Previous Purchase Orders: <span className="font-black text-slate-950">{relatedOrders.length}</span></div>
          <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">Outstanding Orders: <span className="font-black text-slate-950">{relatedOrders.filter((row) => !String(row.status || "").toLowerCase().includes("received")).length}</span></div>
          <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">Supplier Spend (Recent): <span className="font-black text-slate-950">{money(relatedOrders.reduce((sum, row) => sum + Number(row.total || 0), 0) + Number(po.total || 0))}</span></div>
          <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">Approval Bottleneck Risk: <span className="font-black text-slate-950">{String(po.status).toLowerCase() === "submitted" ? "High" : "Normal"}</span></div>
        </div>
      </PremiumMobileCard>

      <PremiumMobileStickyActionBar actions={stickyActions} />
    </section>
  );
}