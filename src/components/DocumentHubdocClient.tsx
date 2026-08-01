"use client";

import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import {
  ArrowRight,
  Trash2,
  BrainCircuit,
  CheckCircle2,
  Eye,
  Mail,
  Plus,
  Search,
  Sparkles,
  UploadCloud,
  AlertTriangle,
} from "lucide-react";
import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bulkApproveDocuments,
  bulkArchiveDocuments,
  bulkDeleteDocuments,
  bulkExtractDocuments,
  bulkMarkReviewed,
  bulkRestoreDocuments,
  deleteDocument,
  fetchDocumentQueueStats,
  loadReviewDraft,
} from "@/lib/vyron-document-review-client";

type DocStatus =
  | "Captured"
  | "Needs Review"
  | "Matched"
  | "Archived"
  | "Duplicate Risk"
  | "Extracting"
  | "Uploading"
  | "Stored"
  | "Uploaded"
  | "Error";
type HubListView = "inbox" | "needs-review" | "approved-today" | "archive" | "deleted";
type RiskLevel = "Low" | "Medium" | "High";

type Extraction = {
  supplier: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerVatNo: string;
  supplierVatNo: string;
  orderNo: string;
  accountNumber: string;
  customerReference: string;
  salesRepresentative: string;
  subtotal: string;
  vat: string;
  total: string;
  currency: string;
  confidence: number;
  fieldConfidence?: {
    supplier?: number;
    invoiceNo?: number;
    invoiceDate?: number;
    customerName?: number;
    customerVatNo?: number;
    supplierVatNo?: number;
    accountNumber?: number;
    orderNo?: number;
    customerReference?: number;
    salesRepresentative?: number;
    subtotal?: number;
    vat?: number;
    total?: number;
  };
  documentType: string;
  lineItems: Array<{
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    vatAmount: string;
    lineTotal: string;
    skuOrProductCode: string;
    confidenceScore: number;
    fieldConfidence?: {
      description?: number;
      quantity?: number;
      unit?: number;
      unitPrice?: number;
      vatAmount?: number;
      lineTotal?: number;
      skuOrProductCode?: number;
    };
  }>;
  warnings: string[];
  validation?: {
    subtotalVatTotalCheck: "Pass" | "Fail" | "Needs Review";
    lineItemsTotalCheck: "Pass" | "Fail" | "Needs Review";
    duplicateRisk: "Low" | "Medium" | "High";
    missingFields: string[];
  };
  rawDetectedText?: string;
};

type DemoDoc = {
  id: string;
  supplier: string;
  type: string;
  date: string;
  total: string;
  status: DocStatus;
  risk: RiskLevel;
  fileName?: string;
  fileUrl?: string;
  fileMime?: string;
  extracted?: Extraction;
  extractionError?: string;
  modelUsed?: string;
  storageDocumentId?: string;
  storagePath?: string;
  dbStatus?: string;
};

const starterDocs: DemoDoc[] = [];

function statusClass(status: DocStatus) {
  if (status === "Matched" || status === "Archived") return "bg-[#A855F7]/10 text-[#7E22CE]";
  if (status === "Error" || status === "Duplicate Risk") return "bg-red-50 text-red-700";
  if (status === "Needs Review") return "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
  if (status === "Extracting" || status === "Uploading") return "bg-blue-50 text-blue-700";
  if (status === "Stored" || status === "Uploaded") return "bg-[#A855F7]/10 text-[#7E22CE]";
  return "bg-violet-50 text-violet-700";
}

function listTitle(view: HubListView) {
  if (view === "needs-review") return "Needs Review";
  if (view === "approved-today") return "Approved Today";
  if (view === "archive") return "Invoice Archive";
  if (view === "deleted") return "Deleted Documents";
  return "Active Inbox";
}

function listSubtitle(view: HubListView) {
  if (view === "needs-review") return "Extracted invoices waiting for line matching and approval.";
  if (view === "approved-today") return "Invoices approved today — open read-only archive detail.";
  if (view === "archive") return "All approved invoices. Search by supplier, invoice number, or date.";
  if (view === "deleted") return "Soft-deleted documents.";
  return "Uploaded and captured documents before review.";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function makeInitialDoc(file: File, index: number): DemoDoc {
  const fileUrl = URL.createObjectURL(file);
  return {
    id: `DOC-${String(index + 1001).padStart(4, "0")}`,
    supplier: "Uploading...",
    type: file.type === "application/pdf" || file.type.startsWith("image/") ? "Supplier Invoice" : "Supplier Document",
    date: todayIso(),
    total: "—",
    status: "Uploading",
    risk: "Medium",
    fileName: file.name,
    fileUrl,
    fileMime: file.type,
  };
}

async function extractStoredDocument(documentId: string): Promise<{
  extraction: Extraction;
  modelUsed: string;
}> {
  const response = await fetch(`/api/documents/${documentId}/extract`, {
    method: "POST",
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Extraction failed.");
  }

  return {
    extraction: data.extraction as Extraction,
    modelUsed: data.modelUsed as string,
  };
}

type InboxApiDocument = {
  storageDocumentId: string;
  displayId: string;
  supplier: string;
  type: string;
  date: string;
  total: string;
  status: DocStatus;
  risk: RiskLevel;
  fileName?: string;
  fileMime?: string;
  storagePath?: string;
  storageBucket?: string;
  confidence?: number | null;
  dbStatus?: string;
};

function mapInboxRowToDemoDoc(row: InboxApiDocument): DemoDoc {
  return {
    id: row.displayId,
    supplier: row.supplier,
    type: row.type,
    date: row.date,
    total: row.total,
    status: row.status,
    risk: row.risk,
    fileName: row.fileName,
    fileMime: row.fileMime,
    storageDocumentId: row.storageDocumentId,
    storagePath: row.storagePath,
    dbStatus: row.dbStatus,
  };
}

async function fetchDocumentList(
  view: HubListView,
  filters?: { search?: string; month?: string; year?: string; supplier?: string; status?: string }
): Promise<DemoDoc[]> {
  const params = new URLSearchParams({ view });
  if (filters?.search) params.set("search", filters.search);
  if (filters?.month) params.set("month", filters.month);
  if (filters?.year) params.set("year", filters.year);
  if (filters?.supplier) params.set("supplier", filters.supplier);
  if (filters?.status) params.set("status", filters.status);
  const response = await fetch(`/api/documents?${params.toString()}`);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not load documents.");
  }
  return ((data.documents || []) as InboxApiDocument[]).map(mapInboxRowToDemoDoc);
}

function openDocument(view: HubListView, storageDocumentId: string, router: ReturnType<typeof useRouter>) {
  if (view === "archive" || view === "approved-today") {
    router.push(`/document-intelligence/archive/${storageDocumentId}`);
    return;
  }
  router.push(`/document-intelligence/${storageDocumentId}`);
}

async function storeDocument(file: File): Promise<{
  documentId: string;
  storagePath: string;
  storageBucket: string;
  tenantId?: string;
  tenantName?: string;
}> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("__client_file_size", String(file.size));
  formData.append("__client_file_last_modified", String(file.lastModified || 0));
  formData.append("__client_file_name", file.name);
  formData.append("__client_file_mime", file.type || "application/octet-stream");

  const response = await fetch("/api/documents/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Document upload failed.");
  }

  return {
    documentId: data.documentId as string,
    storagePath: data.storagePath as string,
    storageBucket: data.storageBucket as string,
    tenantId: data.tenantId as string | undefined,
    tenantName: data.tenantName as string | undefined,
  };
}

export default function DocumentHubdocClient({
  mode = "documents",
  listView = "inbox",
  hideHero = false,
  onListChanged,
  highlightDocumentId = null,
}: {
  mode?: "documents" | "forensics" | "processing";
  listView?: HubListView;
  hideHero?: boolean;
  onListChanged?: () => void;
  highlightDocumentId?: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [archiveSupplier, setArchiveSupplier] = useState("");
  const [archiveMonth, setArchiveMonth] = useState("");
  const [archiveYear, setArchiveYear] = useState("");
  const [archiveStatus, setArchiveStatus] = useState("");
  const [docs, setDocs] = useState<DemoDoc[]>(starterDocs);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkExtracting, setBulkExtracting] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkReviewing, setBulkReviewing] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [queue, setQueue] = useState<{
    totalUploaded: number;
    extracting: number;
    captured: number;
    needsReview: number;
    approved: number;
    failed: number;
  } | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(highlightDocumentId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActiveHighlightId(highlightDocumentId);
  }, [highlightDocumentId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return docs;
    return docs.filter((doc) =>
      [doc.id, doc.supplier, doc.type, doc.status, doc.risk, doc.fileName || ""].join(" ").toLowerCase().includes(term)
    );
  }, [docs, search]);

  const title =
    mode === "forensics"
      ? "Procurement Intelligence"
      : mode === "processing"
        ? "Invoice Processing"
        : "Document Intelligence";

  const subtitle =
    mode === "forensics"
      ? "Duplicate invoices, supplier inflation, procurement leakage and recovery opportunities."
      : mode === "processing"
        ? "Upload invoices, extract fields, match purchase orders and approve."
        : "Your Hubdoc-style document inbox for invoices, POs and supplier documents.";

  const refreshQueue = useCallback(async () => {
    try {
      const stats = await fetchDocumentQueueStats();
      setQueue(stats);
    } catch {
      setQueue(null);
    }
  }, []);

  const refreshInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const loaded = await fetchDocumentList(listView, {
        search: listView === "archive" || listView === "approved-today" ? search : undefined,
        supplier: archiveSupplier || undefined,
        month: archiveMonth || undefined,
        year: archiveYear || undefined,
        status: archiveStatus || undefined,
      });
      setDocs((current) => {
        if (listView !== "inbox") return loaded;
        const inFlight = current.filter(
          (row) => row.status === "Uploading" || row.status === "Extracting" || row.status === "Stored" || !row.storageDocumentId
        );
        const merged = new Map<string, DemoDoc>();
        for (const row of loaded) {
          if (row.storageDocumentId) merged.set(row.storageDocumentId, row);
        }
        for (const row of inFlight) {
          if (row.storageDocumentId) {
            const existing = merged.get(row.storageDocumentId);
            merged.set(row.storageDocumentId, { ...existing, ...row, fileUrl: row.fileUrl || existing?.fileUrl });
          } else {
            merged.set(`local-${row.id}-${row.fileName || ""}`, row);
          }
        }
        return Array.from(merged.values());
      });
      onListChanged?.();
      await refreshQueue();
    } finally {
      setInboxLoading(false);
    }
  }, [listView, onListChanged, search, archiveSupplier, archiveMonth, archiveYear, archiveStatus, refreshQueue]);

  const selectableIds = useMemo(
    () => filtered.filter((doc) => doc.storageDocumentId).map((doc) => doc.storageDocumentId as string),
    [filtered]
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableIds));
  }

  async function handleBulkExtract() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Run AI extraction on ${ids.length} selected document(s)?`)) return;
    setBulkExtracting(true);
    try {
      const result = await bulkExtractDocuments(ids);
      setMessage(result.message);
      setSelectedIds(new Set());
      await refreshInbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk extract failed.");
    } finally {
      setBulkExtracting(false);
    }
  }

  async function handleBulkApprove() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Approve ${ids.length} document(s) and update costs? Unmapped lines may fail per approval rules.`)) return;
    setBulkApproving(true);
    try {
      const result = await bulkApproveDocuments(ids, { force: true });
      setMessage(result.message);
      setSelectedIds(new Set());
      await refreshInbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk approve failed.");
    } finally {
      setBulkApproving(false);
    }
  }

  async function handleBulkMarkReviewed() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkReviewing(true);
    try {
      const result = await bulkMarkReviewed(ids);
      setMessage(result.message);
      setSelectedIds(new Set());
      await refreshInbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk mark reviewed failed.");
    } finally {
      setBulkReviewing(false);
    }
  }

  async function handleBulkArchive() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Archive ${ids.length} selected document(s)?`)) return;
    setBulkArchiving(true);
    try {
      const result = await bulkArchiveDocuments(ids);
      setMessage(result.message);
      setSelectedIds(new Set());
      await refreshInbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk archive failed.");
    } finally {
      setBulkArchiving(false);
    }
  }

  async function openNextReview() {
    try {
      const response = await fetch("/api/documents/next-review");
      const result = await response.json();
      if (response.ok && result.ok && result.documentId) {
        router.push(`/document-intelligence/${result.documentId}`);
        return;
      }
      setMessage("No invoices awaiting review in the queue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not find next review document.");
    }
  }

  async function handleBulkRestore() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Restore ${ids.length} selected document(s) to the active workflow?`)) return;
    setBulkRestoring(true);
    try {
      const result = await bulkRestoreDocuments(ids);
      setMessage(result.message);
      setSelectedIds(new Set());
      await refreshInbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk restore failed.");
    } finally {
      setBulkRestoring(false);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const confirmed = window.confirm(`Delete ${ids.length} selected document(s)? They will be removed from the inbox.`);
    if (!confirmed) return;

    setBulkDeleting(true);
    try {
      const result = await bulkDeleteDocuments(ids);
      setDocs((current) => current.filter((row) => !row.storageDocumentId || !selectedIds.has(row.storageDocumentId)));
      setSelectedIds(new Set());
      setMessage(result.message || "Selected documents deleted.");
      await refreshInbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected documents.");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleDeleteDocument(event: MouseEvent<HTMLButtonElement>, doc: DemoDoc) {
    event.preventDefault();
    event.stopPropagation();
    if (!doc.storageDocumentId) return;
    const confirmed = window.confirm(`Delete document ${doc.id}? This removes it from inbox and review.`);
    if (!confirmed) return;

    try {
      const result = await deleteDocument(doc.storageDocumentId);
      setDocs((current) => current.filter((row) => row.storageDocumentId !== doc.storageDocumentId));
      if (result.storageArchiveWarning) {
        setMessage(`Document deleted. Storage warning: ${result.storageArchiveWarning}`);
      } else {
        setMessage("Document deleted from inbox.");
      }
      await refreshInbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete document.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    refreshInbox()
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load document inbox.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshInbox]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("vyron-doc-approved");
      if (!raw) return;
      sessionStorage.removeItem("vyron-doc-approved");
      const payload = JSON.parse(raw) as {
        costUpdates?: number;
        history?: number;
        highlightDocumentId?: string | null;
      };
      if (payload.highlightDocumentId) {
        setActiveHighlightId(payload.highlightDocumentId);
      }
      setMessage(
        `Invoice approved. Updated ${payload.costUpdates ?? 0} cost item(s), stored ${payload.history ?? 0} price history row(s).${
          payload.highlightDocumentId ? " Next invoice highlighted below." : ""
        }`
      );
    } catch {
      /* ignore */
    }
  }, []);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function captureFiles(files: File[]) {
    if (!files.length) return;

    const initialDocs = files.map((file, index) => makeInitialDoc(file, docs.length + index));
    setDocs((current) => [...initialDocs, ...current]);
    setMessage(`${files.length} document${files.length === 1 ? "" : "s"} uploading to Supabase Storage...`);

    const uploadedIds: string[] = [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const tempDoc = initialDocs[index];

      try {
        const stored = await storeDocument(file);

        const storedDoc: DemoDoc = {
          ...tempDoc,
          id: stored.documentId.slice(0, 8).toUpperCase(),
          supplier: "Stored — extracting…",
          total: "—",
          status: "Stored",
          risk: "Medium",
          storageDocumentId: stored.documentId,
          storagePath: stored.storagePath,
          extractionError: undefined,
          extracted: undefined,
        };

        setDocs((current) => current.map((doc) => (doc.fileUrl === tempDoc.fileUrl ? storedDoc : doc)));
        setMessage(`Stored in Supabase (${stored.documentId}). Running AI extraction from stored file…`);

        const extractingDoc: DemoDoc = { ...storedDoc, status: "Extracting", supplier: "Extracting…" };
        setDocs((current) => current.map((doc) => (doc.fileUrl === tempDoc.fileUrl ? extractingDoc : doc)));

        const { extraction, modelUsed } = await extractStoredDocument(stored.documentId);
        await loadReviewDraft(stored.documentId);

        const captured: DemoDoc = {
          ...extractingDoc,
          id: extraction.invoiceNo !== "Needs Review" ? extraction.invoiceNo : stored.documentId.slice(0, 8).toUpperCase(),
          supplier: extraction.supplier,
          type: extraction.documentType,
          date: extraction.invoiceDate,
          total: extraction.total,
          status: extraction.confidence >= 75 ? "Captured" : "Needs Review",
          risk: extraction.confidence >= 75 ? "Low" : "Medium",
          extracted: extraction,
          modelUsed,
          extractionError: undefined,
        };

        setDocs((current) => current.map((doc) => (doc.fileUrl === tempDoc.fileUrl ? captured : doc)));
        uploadedIds.push(stored.documentId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload or extraction failed.";
        const isExtractionPhase = errorMessage.toLowerCase().includes("extraction") || errorMessage.includes("OPENAI");

        const updated: DemoDoc = {
          ...tempDoc,
          supplier: isExtractionPhase ? "Extraction failed" : "Upload failed",
          total: "—",
          status: "Needs Review",
          risk: "Medium",
          extractionError: errorMessage,
          extracted: undefined,
        };

        setDocs((current) => current.map((doc) => (doc.fileUrl === tempDoc.fileUrl ? updated : doc)));
        setMessage(errorMessage);
      }
    }

    await refreshInbox();

    if (uploadedIds.length === 1) {
      setMessage("Extraction complete. Opening review workspace…");
      router.push(`/document-intelligence/${uploadedIds[0]}`);
    } else if (uploadedIds.length > 1) {
      setMessage(`${uploadedIds.length} invoices uploaded and queued. Use bulk actions or Open next review.`);
    }
  }

  function handleFileCapture(event: ChangeEvent<HTMLInputElement>) {
    captureFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    captureFiles(Array.from(event.dataTransfer.files || []));
  }

  return (
    <section className="grid gap-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileCapture}
      />

      {!hideHero ? (
      <section className="relative overflow-hidden rounded-[2.6rem] border border-violet-100 bg-white p-8 shadow-[0_20px_70px_rgba(76,29,149,0.10)]">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-violet-200/50 blur-3xl" />
        <div className="absolute bottom-0 left-20 h-64 w-64 rounded-full bg-fuchsia-200/40 blur-3xl" />

        <div className="relative z-10 grid gap-8 xl:grid-cols-[1fr_0.9fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-100 to-fuchsia-100 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-violet-700">
              <Sparkles size={15} />
              Document AI Diagnostics
            </div>
            <h1 className="mt-5 text-5xl font-black tracking-[-0.05em] text-slate-950">{title}</h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-500">{subtitle}</p>

            <div className="mt-7 grid gap-4 md:grid-cols-4">
              {[
                ["Inbox", String(docs.length), "docs captured"],
                ["Stored", String(docs.filter((d) => d.status === "Stored").length), "in Supabase"],
                ["Captured", String(docs.filter((d) => d.status === "Captured" || d.status === "Matched").length), "read by AI"],
                ["Review", String(docs.filter((d) => d.status === "Needs Review").length), "needs attention"],
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-3xl bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-500">{label}</div>
                  <div className="mt-2 text-4xl font-black text-slate-950">{value}</div>
                  <div className="mt-1 text-xs font-bold text-slate-400">{note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2.2rem] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-indigo-800 p-6 text-white shadow-[0_18px_60px_rgba(59,130,246,0.28)]">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-100">What changed</div>
            <h2 className="mt-2 text-2xl font-black">Shows the real extraction error.</h2>

            <div className="mt-6 grid gap-3">
              {[
                [UploadCloud, "Upload invoice", "PDF or image"],
                [Eye, "Preview inside software", "No need to leave the page"],
                [BrainCircuit, "AI extracts fields", "Supplier, date, invoice number, VAT and lines"],
                [CheckCircle2, "Diagnostics visible", "Any API/model/key error shows clearly"],
              ].map(([Icon, step, note]: any) => (
                <div key={step} className="flex items-center gap-3 rounded-3xl bg-white/12 p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                    <Icon size={22} />
                  </div>
                  <div>
                    <div className="font-black">{step}</div>
                    <div className="text-xs font-semibold text-violet-100">{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {queue && mode === "documents" ? (
        <section className="rounded-[2rem] border border-violet-100 bg-white p-5">
          <h3 className="text-sm font-black uppercase text-slate-500">Processing queue</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["Total uploaded", queue.totalUploaded],
                ["Extracting", queue.extracting],
                ["Captured", queue.captured],
                ["Needs review", queue.needsReview],
                ["Approved", queue.approved],
                ["Failed", queue.failed],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-violet-50 px-3 py-2 text-center">
                <div className="text-[10px] font-black uppercase text-violet-600">{label}</div>
                <div className="text-xl font-black text-slate-950">{value}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {listView === "inbox" ? (
      <section className="rounded-[2.2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Capture Document</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Upload PDF/image — extraction opens full-screen review automatically.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            className="mt-6 rounded-[2rem] border-2 border-dashed border-violet-200 bg-violet-50/60 p-8 text-center transition hover:border-[var(--vyron-warning-border)] hover:bg-[var(--vyron-warning-bg)]"
          >
            <UploadCloud className="mx-auto text-violet-700" size={46} />
            <div className="mt-4 text-xl font-black text-slate-950">Drop invoice here</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Upload PDF/image. If extraction fails, the exact API/model/key error will now show.
            </p>
            <button
              type="button"
              onClick={openFilePicker}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-violet-500/20"
            >
              <Plus size={18} />
              Capture Document
            </button>
          </div>

          {message ? <div className="mt-4 rounded-2xl bg-[var(--vyron-warning-bg)] px-5 py-4 text-sm font-black text-[var(--vyron-warning-fg)]">{message}</div> : null}

          <div className="mt-5 rounded-3xl bg-slate-950 p-5 text-white">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-fuchsia-300">
              <Mail size={15} />
              Email Inbox
            </div>
            <div className="mt-3 text-sm font-semibold leading-6 text-slate-300">
              Supplier invoices emailed to VYRON COST appear in the email intake queue for upload and extraction.
            </div>
            <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white">
              invoices@vyroncost.co.za
            </div>
            <a
              href="/email-invoice-inbox"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#A855F7]/100 px-4 py-2 text-xs font-black text-[#F8FAFC]"
            >
              Open email intake queue →
            </a>
          </div>
      </section>
      ) : null}

      <section className="rounded-[2.2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-950">{listTitle(listView)}</h2>
            <p className="text-xs font-semibold text-slate-500">{listSubtitle(listView)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void openNextReview()}
              className="inline-flex items-center gap-1 rounded-full vyron-grad-surface px-4 py-2 text-xs font-semibold text-white"
            >
              Open next review
            </button>
            {selectedIds.size > 0 ? (
              <>
                {(listView === "inbox" || listView === "needs-review") ? (
                  <>
                    <button
                      type="button"
                      disabled={bulkExtracting}
                      onClick={() => void handleBulkExtract()}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                    >
                      {bulkExtracting ? "Extracting…" : `Re-extract (${selectedIds.size})`}
                    </button>
                    <button
                      type="button"
                      disabled={bulkReviewing}
                      onClick={() => void handleBulkMarkReviewed()}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--vyron-warning-solid)] px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                    >
                      {bulkReviewing ? "Saving…" : `Mark reviewed (${selectedIds.size})`}
                    </button>
                    <button
                      type="button"
                      disabled={bulkApproving}
                      onClick={() => void handleBulkApprove()}
                      className="inline-flex items-center gap-1 rounded-full border border-transparent vyron-grad-surface px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                    >
                      {bulkApproving ? "Approving…" : `Approve (${selectedIds.size})`}
                    </button>
                  </>
                ) : null}
                {(listView === "approved-today") ? (
                  <button
                    type="button"
                    disabled={bulkArchiving}
                    onClick={() => void handleBulkArchive()}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                  >
                    {bulkArchiving ? "Archiving…" : `Archive approved (${selectedIds.size})`}
                  </button>
                ) : null}
                {listView === "deleted" ? (
                  <button
                    type="button"
                    disabled={bulkRestoring}
                    onClick={() => void handleBulkRestore()}
                    className="inline-flex items-center gap-1 rounded-full border border-transparent vyron-grad-surface px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                  >
                    {bulkRestoring ? "Restoring…" : `Restore (${selectedIds.size})`}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => void handleBulkDelete()}
                  className="inline-flex items-center gap-1 rounded-full bg-red-600 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                >
                  <Trash2 size={13} />
                  {bulkDeleting ? "Deleting…" : `Delete (${selectedIds.size})`}
                </button>
              </>
            ) : null}
            <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <Search size={18} className="text-violet-700" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents..." className="w-64 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" />
            </div>
          </div>
        </div>

        {listView === "archive" || listView === "approved-today" ? (
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              placeholder="Supplier filter"
              value={archiveSupplier}
              onChange={(e) => setArchiveSupplier(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              placeholder="Month (01-12)"
              value={archiveMonth}
              onChange={(e) => setArchiveMonth(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              placeholder="Year (YYYY)"
              value={archiveYear}
              onChange={(e) => setArchiveYear(e.target.value)}
            />
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              value={archiveStatus}
              onChange={(e) => setArchiveStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="archived">Archived</option>
              <option value="approved">Approved</option>
            </select>
          </div>
        ) : null}

        <EnterpriseScrollContainer className="rounded-3xl border border-slate-100">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.14em] text-fuchsia-200">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all documents"
                    className="h-4 w-4 rounded border-[var(--vyron-warning-border)]"
                  />
                </th>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3 min-w-[220px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inboxLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm font-bold text-slate-500">
                    Loading document inbox...
                  </td>
                </tr>
              ) : null}
              {filtered.map((doc) => (
                <tr
                  key={doc.storageDocumentId || `${doc.id}-${doc.fileName || ""}`}
                  className={`border-t border-slate-100 hover:bg-violet-50/50 ${
                    doc.storageDocumentId && doc.storageDocumentId === activeHighlightId
                      ? "bg-[var(--vyron-warning-bg)] ring-2 ring-fuchsia-400 ring-inset"
                      : ""
                  } ${doc.storageDocumentId ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (doc.storageDocumentId) openDocument(listView, doc.storageDocumentId, router);
                  }}
                >
                  <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                    {doc.storageDocumentId ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(doc.storageDocumentId)}
                        onChange={() => toggleSelect(doc.storageDocumentId!)}
                        aria-label={`Select ${doc.id}`}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-black text-violet-700">{doc.id}</div>
                    {doc.fileName ? <div className="mt-1 truncate text-[11px] font-bold text-slate-400">{doc.fileName}</div> : null}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-700">{doc.supplier}</td>
                  <td className="px-4 py-3 font-semibold text-slate-500">{doc.type}</td>
                  <td className="px-4 py-3 font-semibold text-slate-500">{doc.date}</td>
                  <td className="px-4 py-3 font-black text-slate-950">{doc.total}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(doc.status)}`}>{doc.status}</span>
                  </td>
                  <td className={`px-4 py-3 font-black ${doc.risk === "High" ? "text-red-600" : doc.risk === "Medium" ? "text-[var(--vyron-warning-fg)]" : "text-[#84CC16]"}`}>
                    {doc.risk}
                  </td>
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-2">
                      {doc.storageDocumentId ? (
                        <button
                          type="button"
                          onClick={() => openDocument(listView, doc.storageDocumentId!, router)}
                          className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700"
                        >
                          {listView === "archive" || listView === "approved-today" ? "View archive" : "Open Review"}{" "}
                          <ArrowRight size={13} />
                        </button>
                      ) : null}
                      {doc.storageDocumentId && listView !== "archive" && listView !== "approved-today" ? (
                        <button
                          type="button"
                          onClick={(event) => void handleDeleteDocument(event, doc)}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EnterpriseScrollContainer>
      </section>
    </section>
  );
}
