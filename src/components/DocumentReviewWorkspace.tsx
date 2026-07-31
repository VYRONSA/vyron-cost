"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import PoLinkPanel from "@/components/PoLinkPanel";
import InvoiceReviewTotalsFooter, { InvoiceTotalsWarningBanner } from "@/components/InvoiceReviewTotalsFooter";
import LineItemMatchCombobox from "@/components/LineItemMatchCombobox";
import ReviewWorkspaceLayoutControls, {
  layoutColumnClass,
  type ReviewWorkspaceLayout,
} from "@/components/ReviewWorkspaceLayoutControls";
import type { MatchQuality } from "@/lib/vyron-line-match-search";
import {
  approveAndUpdateCosts,
  buildLineFocusTarget,
  createEntityFromLine,
  deleteDocument,
  fetchDocumentPreview,
  fetchNextReviewDocumentId,
  loadReviewDraft,
  parseMoneyNumber,
  saveReviewCorrections,
  updateIngredientName,
  validateDocumentApproval,
  type ApprovalViolation,
  type MatchOption,
  type ReviewDraft,
  type ReviewDraftLine,
} from "@/lib/vyron-document-review-client";
import { computeLineAmounts, formatMoney, roundMoney, summarizeInvoiceTotals } from "@/lib/vyron-invoice-line-math";
import { buildInitialLineMatchQuality, createEmptyLine, mergeMatchOption } from "@/lib/vyron-review-draft-hydrate";
import { matchQualityFromSuggestion } from "@/lib/vyron-line-match-search";
import {
  type DocumentViewerRegions,
  type ViewerFocusTarget,
  estimateLineBBox,
} from "@/lib/vyron-document-viewer-types";

const InvoiceDocumentViewer = dynamic(() => import("@/components/InvoiceDocumentViewer"), { ssr: false });

function confidenceTone(score: number | null) {
  if (score === null) return "bg-slate-200 text-slate-600";
  if (score >= 85) return "bg-[#A855F7]/12 text-[#7E22CE]";
  if (score >= 70) return "bg-fuchsia-100 text-fuchsia-700";
  return "bg-red-100 text-red-700";
}

function ConfidenceBadge({ score }: { score: number | null }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${confidenceTone(score)}`}>
      {score === null ? "No confidence" : `${score}%`}
    </span>
  );
}

function fieldClass(score: number | null) {
  return score !== null && score < 70 ? "border-red-300 bg-red-50" : "border-slate-200 bg-white";
}

type CreateEntityModal = {
  lineId: string;
  entityType: "ingredient" | "packaging";
  name: string;
  unit: string;
  purchaseCost: string;
};

type EditIngredientModal = {
  lineId: string;
  ingredientId: string;
  name: string;
};

export default function DocumentReviewWorkspace({ documentId, embedded = false }: { documentId: string; embedded?: boolean }) {
  const router = useRouter();
  const extractionTriggeredRef = useRef(false);
  const loadSequenceRef = useRef(0);
  const activeLoadRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingStartedAtRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMime, setPreviewMime] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [createModal, setCreateModal] = useState<CreateEntityModal | null>(null);
  const [editIngredientModal, setEditIngredientModal] = useState<EditIngredientModal | null>(null);
  const [creatingEntity, setCreatingEntity] = useState(false);
  const [savingIngredient, setSavingIngredient] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [workspaceLayout, setWorkspaceLayout] = useState<ReviewWorkspaceLayout>("split");
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<ViewerFocusTarget | null>(null);
  const [lineMatchQuality, setLineMatchQuality] = useState<Record<string, MatchQuality>>({});
  const [costAuditRows, setCostAuditRows] = useState<Array<Record<string, unknown>>>([]);
  const [riskAlerts, setRiskAlerts] = useState<Array<Record<string, unknown>>>([]);
  const [overrideAudit, setOverrideAudit] = useState<Array<Record<string, unknown>>>([]);
  const deleteConfirm = useConfirmDelete("Delete this invoice from Document Intelligence? This cannot be undone.");
  const [overrideModal, setOverrideModal] = useState<{
    open: boolean;
    violations: ApprovalViolation[];
    pin: string;
    reason: string;
    draftToSave: ReviewDraft | null;
    approveOpts: { force: boolean; forceTotalsMismatch: boolean; reconciliationNote?: string };
  } | null>(null);

  const viewerRegions = useMemo((): DocumentViewerRegions | undefined => {
    if (!draft) return undefined;
    const base = draft.viewerRegions ?? { fields: [], lines: [] };
    const lines = draft.lines.map((line, index) => {
      const stored = base.lines.find((entry) => entry.lineId === line.id);
      if (stored) return stored;
      return {
        lineId: line.id,
        page: line.sourcePage || 1,
        bbox: line.sourceBbox ?? estimateLineBBox(index, draft.lines.length),
      };
    });
    return { pageCount: base.pageCount, fields: base.fields, lines };
  }, [draft]);

  function focusLine(line: ReviewDraftLine, lineIndex: number) {
    setActiveLineId(line.id);
    const target = buildLineFocusTarget(line, lineIndex, draft?.lines.length ?? 0);
    setFocusTarget({
      lineId: target.lineId,
      page: target.page,
      bbox: target.bbox,
    });
  }

  const totalsSummary = useMemo(() => (draft ? summarizeInvoiceTotals(draft) : null), [draft]);

  const refreshDraft = useCallback(async () => {
    const next = await loadReviewDraft(documentId);
    setDraft(next);
    return next;
  }, [documentId]);

  const hasExtractedContent = useCallback((next: ReviewDraft) => {
    const hasSupplier = next.fields.supplierName.trim().length > 0;
    const hasInvoiceNumber = next.fields.invoiceNumber.trim().length > 0;
    return next.status.toLowerCase() === "extracted" || hasSupplier || hasInvoiceNumber;
  }, []);

  const shouldPollForExtraction = useCallback((next: ReviewDraft | null) => {
    if (!next) return false;
    if (hasExtractedContent(next)) return false;
    const status = next.status.toLowerCase();
    return status === "uploaded" || status === "uploading" || status === "stored" || status === "extracting";
  }, [hasExtractedContent]);

  const shouldAutoExtract = useCallback((next: ReviewDraft) => {
    const status = next.status.toLowerCase();
    const eligibleStatus = status === "uploaded" || status === "uploading" || status === "stored";
    const hasSupplier = next.fields.supplierName.trim().length > 0;
    const hasInvoiceNumber = next.fields.invoiceNumber.trim().length > 0;
    const hasInvoiceDate = (() => {
      const value = next.fields.invoiceDate.trim();
      if (!value) return false;
      return !Number.isNaN(Date.parse(value));
    })();
    const hasCommercialLine = next.lines.some((line) => {
      const hasDescription = line.description.trim().length > 0;
      const hasSkuOrProductCode = line.skuOrProductCode.trim().length > 0;
      const hasQuantity = line.quantity !== null;
      const hasUnitPrice = line.unitPrice !== null;
      const hasLineTotal = line.lineTotal !== null;
      const hasVat = line.vat !== null;
      const hasUom = line.unit.trim().length > 0;
      return (
        hasDescription ||
        hasSkuOrProductCode ||
        hasQuantity ||
        hasUnitPrice ||
        hasLineTotal ||
        hasVat ||
        hasUom
      );
    });
    return eligibleStatus && !hasSupplier && !hasInvoiceNumber && !hasInvoiceDate && !hasCommercialLine;
  }, []);

  useEffect(() => {
    async function load() {
      const requestId = ++loadSequenceRef.current;
      activeLoadRef.current?.controller.abort();
      const controller = new AbortController();
      activeLoadRef.current = { id: requestId, controller };

      setLoading(true);
      setErrorMessage("");
      try {
        const [next, preview, auditRes, trailRes] = await Promise.all([
          loadReviewDraft(documentId, undefined, { signal: controller.signal }),
          fetchDocumentPreview(documentId, { signal: controller.signal }).catch(() => null),
          fetch(`/api/documents/${documentId}/cost-audit`, { signal: controller.signal }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`/api/documents/${documentId}/audit-trail`, { signal: controller.signal }).then((r) => r.json()).catch(() => ({ ok: false })),
        ]);
        if (activeLoadRef.current?.id !== requestId) return;
        setDraft(next);
        setLineMatchQuality(buildInitialLineMatchQuality(next));
        if (auditRes?.ok) setCostAuditRows(auditRes.rows || []);
        if (trailRes?.ok) {
          setRiskAlerts(trailRes.riskAlerts || []);
          setOverrideAudit(trailRes.overrideAudit || []);
        }
        if (preview) {
          setPreviewUrl(preview.previewUrl);
          setPreviewMime(preview.fileMime);
          setPreviewFileName(preview.fileName);
          setPreviewError("");
        } else {
          setPreviewError("Could not load stored document preview");
        }

        if (!extractionTriggeredRef.current && shouldAutoExtract(next)) {
          extractionTriggeredRef.current = true;
          setMessage("Starting automatic extraction…");
          const extractRes = await fetch(`/api/documents/${documentId}/extract`, {
            method: "POST",
            signal: controller.signal,
          });
          const extractData = await extractRes.json().catch(() => ({ ok: false }));
          if (!extractRes.ok || (!extractData.ok && !extractData.partial)) {
            throw new Error(extractData.error || "Automatic extraction failed.");
          }
          const refreshed = await loadReviewDraft(documentId, undefined, { signal: controller.signal });
          if (activeLoadRef.current?.id !== requestId) return;
          setDraft(refreshed);
          setLineMatchQuality(buildInitialLineMatchQuality(refreshed));
          if (extractData.partial) {
            setMessage("AI extraction failed. Manual review is available.");
          } else {
            setMessage("Automatic extraction completed.");
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (activeLoadRef.current?.id !== requestId) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load review.");
      } finally {
        if (activeLoadRef.current?.id === requestId) {
          setLoading(false);
          activeLoadRef.current = null;
        }
      }
    }
    load();
    return () => {
      activeLoadRef.current?.controller.abort();
      activeLoadRef.current = null;
    };
  }, [documentId, shouldAutoExtract]);

  useEffect(() => {
    extractionTriggeredRef.current = false;
  }, [documentId]);

  useEffect(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    if (!shouldPollForExtraction(draft)) {
      pollingStartedAtRef.current = null;
      return;
    }

    const startedAt = pollingStartedAtRef.current ?? Date.now();
    pollingStartedAtRef.current = startedAt;

    const poll = async () => {
      try {
        const next = await loadReviewDraft(documentId);
        if (hasExtractedContent(next)) {
          setDraft(next);
          setLineMatchQuality(buildInitialLineMatchQuality(next));
          pollingStartedAtRef.current = null;
          return;
        }
        if (Date.now() - startedAt >= 60000) {
          setMessage("Extraction is taking longer than expected.");
          pollingStartedAtRef.current = null;
          return;
        }
        pollingTimerRef.current = setTimeout(() => {
          void poll();
        }, 1000);
      } catch {
        if (Date.now() - startedAt >= 60000) {
          setMessage("Extraction is taking longer than expected.");
          pollingStartedAtRef.current = null;
          return;
        }
        pollingTimerRef.current = setTimeout(() => {
          void poll();
        }, 1000);
      }
    };

    pollingTimerRef.current = setTimeout(() => {
      void poll();
    }, 1000);

    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [documentId, draft, hasExtractedContent, shouldPollForExtraction]);

  function updateField<K extends keyof ReviewDraft["fields"]>(key: K, value: ReviewDraft["fields"][K]) {
    setDraft((current) => (current ? { ...current, fields: { ...current.fields, [key]: value } } : current));
  }

  function updateLine(lineId: string, patch: Partial<ReviewDraftLine>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        lines: current.lines.map((line) => {
          if (line.id !== lineId) return line;
          const merged = { ...line, ...patch };
          const recalcKeys: Array<keyof ReviewDraftLine> = ["quantity", "unitPrice", "vat"];
          if (recalcKeys.some((key) => key in patch)) {
            return { ...merged, ...computeLineAmounts(merged) };
          }
          if ("lineTotal" in patch && patch.lineTotal !== undefined) {
            const incl = patch.lineTotal;
            const vatAmt = merged.vat ?? 0;
            const excl =
              incl !== null && vatAmt !== null ? roundMoney(incl - vatAmt) : computeLineAmounts(merged).lineExclVat;
            return { ...merged, lineExclVat: excl };
          }
          return merged;
        }),
      };
    });
  }

  function applyMatchOption(lineId: string, option: MatchOption, quality: MatchQuality) {
    setDraft((current) => {
      if (!current) return current;
      const withOption = mergeMatchOption(current, option);
      return {
        ...withOption,
        lines: withOption.lines.map((line) =>
          line.id === lineId
            ? {
                ...line,
                matchedEntityType: option.entityType,
                matchedEntityId: option.id,
                matchedEntityName: option.name,
                ignored: false,
              }
            : line
        ),
      };
    });
    setLineMatchQuality((current) => ({ ...current, [lineId]: quality }));
  }

  function addInvoiceLine() {
    setDraft((current) => (current ? { ...current, lines: [...current.lines, createEmptyLine()] } : current));
  }

  function openEditIngredient(line: ReviewDraftLine) {
    if (!line.matchedEntityId || line.matchedEntityType === "product") return;
    setEditIngredientModal({
      lineId: line.id,
      ingredientId: line.matchedEntityId,
      name: line.matchedEntityName || "",
    });
  }

  async function submitEditIngredient() {
    if (!editIngredientModal || !draft) return;
    setSavingIngredient(true);
    setErrorMessage("");
    try {
      const updated = await updateIngredientName(editIngredientModal.ingredientId, editIngredientModal.name.trim());
      setDraft((current) => {
        if (!current) return current;
        return {
          ...current,
          matchOptions: current.matchOptions.map((option) =>
            option.id === updated.ingredientId ? { ...option, name: updated.ingredientName } : option
          ),
          lines: current.lines.map((line) =>
            line.matchedEntityId === updated.ingredientId
              ? { ...line, matchedEntityName: updated.ingredientName }
              : line
          ),
        };
      });
      setEditIngredientModal(null);
      setMessage("Ingredient name updated. Invoice mapping unchanged.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update ingredient.");
    } finally {
      setSavingIngredient(false);
    }
  }

  function clearLineMatch(lineId: string) {
    updateLine(lineId, { matchedEntityType: null, matchedEntityId: null, matchedEntityName: null });
    setLineMatchQuality((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  }

  async function handleSaveDraft() {
    if (!draft) return;
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const result = await saveReviewCorrections(draft);
      const refreshed = await refreshDraft();
      setDraft(refreshed);
      setLineMatchQuality((current) => {
        const next = { ...buildInitialLineMatchQuality(refreshed), ...current };
        for (const line of refreshed.lines) {
          if (line.matchedEntityId && line.matchedEntityType && !next[line.id]) {
            next[line.id] = line.suggestedMatch?.entityId === line.matchedEntityId
              ? matchQualityFromSuggestion(line.suggestedMatch?.matchReason)
              : "manual";
          }
        }
        return next;
      });
      setMessage(result.message || "Draft saved. Supplier mappings remembered for next invoice.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save draft.");
    } finally {
      setSaving(false);
    }
  }

  async function completeApproval(
    draftToSave: ReviewDraft,
    approveOpts: { force: boolean; forceTotalsMismatch: boolean; reconciliationNote?: string },
    supervisorOverride?: { pin: string; reason: string }
  ) {
    setApproving(true);
    setErrorMessage("");
    try {
      await saveReviewCorrections(draftToSave);
      const validation = await validateDocumentApproval(documentId, {
        force: approveOpts.force,
        forceTotalsMismatch: approveOpts.forceTotalsMismatch,
        hasSupervisorOverride: Boolean(supervisorOverride),
      });
      if (validation.policyBlocked && !supervisorOverride) {
        setOverrideModal({
          open: true,
          violations: validation.validation.violations,
          pin: "",
          reason: "",
          draftToSave,
          approveOpts,
        });
        return;
      }

      let result;
      try {
        result = await approveAndUpdateCosts(documentId, {
          ...approveOpts,
          supervisorOverride,
        });
      } catch (error) {
        const approvalError = error as Error & {
          policyBlocked?: boolean;
          violations?: ApprovalViolation[];
          totalsMismatch?: boolean;
          lowConfidenceFields?: string[];
        };
        if (approvalError.policyBlocked && approvalError.violations?.length) {
          setOverrideModal({
            open: true,
            violations: approvalError.violations,
            pin: "",
            reason: "",
            draftToSave,
            approveOpts,
          });
          return;
        }
        if (approvalError.totalsMismatch) {
          const force = window.confirm(
            "Invoice totals still do not agree with line totals on the server. Approve with your reconciliation reason?"
          );
          if (!force) return;
          result = await approveAndUpdateCosts(documentId, {
            ...approveOpts,
            forceTotalsMismatch: true,
            supervisorOverride,
          });
        } else if (approvalError.lowConfidenceFields?.length) {
          const force = window.confirm(
            `Low confidence on: ${approvalError.lowConfidenceFields.join(", ")}. Approve and update costs anyway?`
          );
          if (!force) return;
          result = await approveAndUpdateCosts(documentId, { ...approveOpts, force: true, supervisorOverride });
        } else if (approveOpts.force) {
          result = await approveAndUpdateCosts(documentId, { ...approveOpts, force: true, supervisorOverride });
        } else {
          throw error;
        }
      }

      const nextDocumentId = await fetchNextReviewDocumentId(documentId);
      try {
        sessionStorage.setItem(
          "vyron-doc-approved",
          JSON.stringify({
            costUpdates: result.updatedCount ?? 0,
            history: result.historyCount ?? 0,
            highlightDocumentId: nextDocumentId,
            openNeedsReview: true,
          })
        );
      } catch {
        /* ignore */
      }
      setOverrideModal(null);
      router.push("/document-intelligence");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setApproving(false);
    }
  }

  async function handleApprove() {
    if (!draft || !totalsSummary) return;

    if (totalsSummary.unmappedCount > 0) {
      const proceed = window.confirm(
        `${totalsSummary.unmappedCount} active line(s) are not matched. Approve anyway? Unmapped lines will not update costs.`
      );
      if (!proceed) return;
    }

    let draftToSave = draft;
    if (totalsSummary.hasMajorMismatch) {
      let note = (draft.reconciliationNote || "").trim();
      if (!note) {
        const entered = window.prompt(
          "Invoice totals differ from line totals by more than R1.00.\n\nEnter a reason to approve:"
        );
        if (!entered?.trim()) return;
        note = entered.trim();
        draftToSave = { ...draft, reconciliationNote: note };
        setDraft(draftToSave);
      }
    } else if (totalsSummary.hasRoundingDifference && !(draft.reconciliationNote || "").trim()) {
      draftToSave = {
        ...draft,
        reconciliationNote: `Rounding difference (max ${totalsSummary.maxAbsDiff.toFixed(2)})`,
      };
      setDraft(draftToSave);
    }

    const approveOpts = {
      force: totalsSummary.unmappedCount > 0,
      forceTotalsMismatch: totalsSummary.hasMajorMismatch,
      reconciliationNote: draftToSave.reconciliationNote ?? undefined,
    };
    await completeApproval(draftToSave, approveOpts);
  }

  async function submitSupervisorOverride() {
    if (!overrideModal?.draftToSave) return;
    if (!overrideModal.pin.trim() || !overrideModal.reason.trim()) {
      setErrorMessage("Supervisor PIN and override reason are required.");
      return;
    }
    await completeApproval(overrideModal.draftToSave, overrideModal.approveOpts, {
      pin: overrideModal.pin.trim(),
      reason: overrideModal.reason.trim(),
    });
  }

  function requestDelete() {
    deleteConfirm.requestDelete(async () => {
      try {
        await deleteDocument(documentId);
        router.push("/document-intelligence");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not delete document.");
      }
    });
  }

  function openCreateModal(line: ReviewDraftLine, entityType: "ingredient" | "packaging") {
    setCreateModal({
      lineId: line.id,
      entityType,
      name: line.description.trim(),
      unit: line.unit || "kg",
      purchaseCost: String(line.unitPrice ?? ""),
    });
  }

  async function submitCreateEntity() {
    if (!createModal || !draft) return;
    setCreatingEntity(true);
    setErrorMessage("");
    try {
      const created = await createEntityFromLine(documentId, {
        lineId: createModal.lineId,
        entityType: createModal.entityType,
        name: createModal.name.trim(),
        unit: createModal.unit.trim() || "kg",
        purchaseCost: Number(createModal.purchaseCost || 0),
        supplierName: draft.fields.supplierName,
      });
      const refreshed = await refreshDraft();
      const withOption: ReviewDraft = {
        ...refreshed,
        matchOptions: [
          ...refreshed.matchOptions.filter((o) => o.id !== created.entityId),
          created.matchOption,
        ],
        lines: refreshed.lines.map((line) =>
          line.id === createModal.lineId
            ? {
                ...line,
                matchedEntityType: created.entityType,
                matchedEntityId: created.entityId,
                matchedEntityName: created.entityName,
                ignored: false,
              }
            : line
        ),
      };
      setDraft(withOption);
      setLineMatchQuality((current) => ({ ...current, [createModal.lineId]: "manual" }));
      setCreateModal(null);
      setMessage(`${created.entityName} created and linked to invoice line.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create item.");
    } finally {
      setCreatingEntity(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
          <Loader2 className="animate-spin" size={20} />
          Loading invoice review workspace…
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-8">
        <p className="text-sm font-bold text-red-600">{errorMessage || "Review data unavailable."}</p>
        <Link href="/document-intelligence" className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white">
          Back to Document Intelligence
        </Link>
      </div>
    );
  }

  const inputClass = "w-full rounded-lg border px-2 py-1.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-400";

  const previewPanel =
    previewUrl && !previewError ? (
      <InvoiceDocumentViewer
        url={previewUrl}
        mimeType={previewMime}
        fileName={previewFileName}
        regions={viewerRegions}
        focusTarget={focusTarget}
        activeLineId={activeLineId}
        lineCount={draft.lines.length}
        className="h-full min-h-0"
        isFullscreen={previewFullscreen}
        onOpenFullscreen={() => setPreviewFullscreen(true)}
        onCloseFullscreen={() => setPreviewFullscreen(false)}
      />
    ) : (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">
        {previewError || "No preview available"}
      </div>
    );

  const headerCompact = workspaceLayout === "focus-review";

  const extractionPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div
        className={`shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm ${
          headerCompact ? "max-h-[28vh] overflow-y-auto overscroll-contain p-3" : "p-4"
        }`}
      >
        <div className={`font-black text-slate-900 ${headerCompact ? "mb-2 text-xs" : "mb-3 text-sm"}`}>Invoice Header</div>
        <div className={`grid gap-2 ${headerCompact ? "sm:grid-cols-2 lg:grid-cols-3" : "gap-3 sm:grid-cols-2"}`}>
          {[
            ["supplierName", "Supplier", "text"],
            ["invoiceNumber", "Invoice Number", "text"],
            ["invoiceDate", "Invoice Date", "date"],
            ["accountNumber", "Account Number", "text"],
            ["purchaseOrderNumber", "Order Number", "text"],
            ["customerName", "Customer", "text"],
            ["customerVatNumber", "Customer VAT", "text"],
            ["supplierVatNumber", "Supplier VAT", "text"],
            ["subtotal", "Subtotal", "number"],
            ["vat", "VAT", "number"],
            ["total", "Total", "number"],
          ].map(([key, label, type]) => {
            const fieldKey = key as keyof ReviewDraft["fields"];
            const confKey = fieldKey === "purchaseOrderNumber" ? "purchaseOrderNumber" : fieldKey;
            const score = draft.fields.fieldConfidence[confKey] ?? null;
            const value = draft.fields[fieldKey];
            return (
              <label key={key} className={`rounded-xl border ${headerCompact ? "p-2" : "p-3"} ${fieldClass(score)}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</span>
                  <ConfidenceBadge score={score} />
                </div>
                <input
                  type={type}
                  className={`${inputClass} mt-1 border-0 bg-transparent p-0`}
                  value={type === "number" ? String(value ?? "") : String(value || "")}
                  onChange={(e) =>
                    updateField(
                      fieldKey,
                      type === "number" ? parseMoneyNumber(e.target.value) : (e.target.value as never)
                    )
                  }
                />
              </label>
            );
          })}
        </div>
        {draft ? (
          <div className="mt-3">
            <PoLinkPanel
              documentId={documentId}
              supplierName={draft.fields.supplierName}
              purchaseOrderNumber={draft.fields.purchaseOrderNumber}
              onLinked={(poNumber) => updateField("purchaseOrderNumber", poNumber)}
            />
          </div>
        ) : null}
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
          <div>
            <div className="text-sm font-black text-slate-900">Line Items</div>
            <p className="text-[11px] font-semibold text-slate-500">
              {draft.lines.length} line{draft.lines.length === 1 ? "" : "s"} · click a row to focus the invoice preview
            </p>
          </div>
          <button
            type="button"
            onClick={addInvoiceLine}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-1.5 text-[11px] font-black text-white"
          >
            <Plus size={12} />
            Add Invoice Line
          </button>
        </div>
        {totalsSummary ? <InvoiceTotalsWarningBanner summary={totalsSummary} /> : null}
        <div className="min-h-[280px] flex-1 basis-0 overflow-auto overscroll-contain">
          <table className="min-w-[2100px] w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 shadow-sm">
              <tr>
                <th className="min-w-[200px] px-3 py-2">Description</th>
                <th className="min-w-[100px] px-3 py-2">SKU</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Unit Price</th>
                <th className="px-3 py-2">Excl VAT</th>
                <th className="px-3 py-2">VAT</th>
                <th className="px-3 py-2">Incl VAT</th>
                <th className="px-3 py-2">Conf.</th>
                <th className="min-w-[110px] px-3 py-2">Match Type</th>
                <th className="min-w-[300px] px-3 py-2">Matched Item</th>
                <th className="px-3 py-2">Ignore</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm font-bold text-slate-500">
                    No line items yet. Use &ldquo;Add Invoice Line&rdquo; to create one.
                  </td>
                </tr>
              ) : null}
              {draft.lines.length > 0
                ? draft.lines.map((line, lineIndex) => (
                <tr
                  key={line.id}
                  className={`cursor-pointer border-t border-slate-100 align-top transition hover:bg-violet-50/40 ${
                    activeLineId === line.id ? "bg-violet-50 ring-1 ring-inset ring-violet-300" : ""
                  }`}
                  onClick={() => focusLine(line, lineIndex)}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input className={inputClass} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input className={inputClass} value={line.skuOrProductCode} onChange={(e) => updateLine(line.id, { skuOrProductCode: e.target.value })} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input className={`${inputClass} w-20`} value={String(line.quantity ?? "")} onChange={(e) => updateLine(line.id, { quantity: parseMoneyNumber(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input className={`${inputClass} w-20`} value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input className={`${inputClass} w-24`} value={String(line.unitPrice ?? "")} onChange={(e) => updateLine(line.id, { unitPrice: parseMoneyNumber(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-700" onClick={(e) => e.stopPropagation()}>
                    {line.lineExclVat ?? computeLineAmounts(line).lineExclVat ?? "—"}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input className={`${inputClass} w-20`} value={String(line.vat ?? "")} onChange={(e) => updateLine(line.id, { vat: parseMoneyNumber(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input className={`${inputClass} w-24`} value={String(line.lineTotal ?? "")} onChange={(e) => updateLine(line.id, { lineTotal: parseMoneyNumber(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2">
                    <ConfidenceBadge score={line.confidenceScore} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      className={inputClass}
                      value={line.ignored ? "ignore" : line.matchedEntityType || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "ignore") {
                          updateLine(line.id, { ignored: true, matchedEntityType: null, matchedEntityId: null, matchedEntityName: null });
                          return;
                        }
                        const newType = v as ReviewDraftLine["matchedEntityType"];
                        if (newType === line.matchedEntityType) {
                          updateLine(line.id, { ignored: false, matchedEntityType: newType });
                          return;
                        }
                        updateLine(line.id, {
                          ignored: false,
                          matchedEntityType: newType,
                          matchedEntityId: null,
                          matchedEntityName: null,
                        });
                      }}
                    >
                      <option value="">—</option>
                      <option value="ingredient">Ingredient</option>
                      <option value="packaging">Packaging</option>
                      <option value="product">Product</option>
                      <option value="ignore">Ignore</option>
                    </select>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <LineItemMatchCombobox
                      line={line}
                      matchOptions={draft.matchOptions}
                      disabled={line.ignored}
                      selectedQuality={lineMatchQuality[line.id] ?? null}
                      onSelect={(option, quality) => applyMatchOption(line.id, option, quality)}
                      onClear={() => clearLineMatch(line.id)}
                      onCreateIngredient={() => openCreateModal(line, "ingredient")}
                      onCreatePackaging={() => openCreateModal(line, "packaging")}
                      onEditIngredient={() => openEditIngredient(line)}
                    />
                  </td>
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={line.ignored} onChange={(e) => updateLine(line.id, { ignored: e.target.checked })} />
                  </td>
                </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
        {totalsSummary ? (
          <InvoiceReviewTotalsFooter
            draft={draft}
            summary={totalsSummary}
            onUpdateExtracted={(patch) =>
              setDraft((current) => (current ? { ...current, fields: { ...current.fields, ...patch } } : current))
            }
            onReconciliationNote={(note) =>
              setDraft((current) => (current ? { ...current, reconciliationNote: note } : current))
            }
          />
        ) : null}
      </section>
    </div>
  );

  const reviewBody = (
    <div
      className={`flex flex-col overflow-hidden bg-slate-100 ${
        embedded ? "min-h-[calc(100dvh-5rem)]" : "h-screen"
      } ${previewFullscreen ? "fixed inset-0 z-[70]" : ""}`}
    >
      <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur lg:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/document-intelligence"
              className="inline-flex items-center rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-black text-slate-700"
            >
              ← Back
            </Link>
            <div className="min-w-0 truncate text-sm font-black text-slate-950">
              {draft.fields.invoiceNumber || documentId.slice(0, 8).toUpperCase()}
              <span className="font-semibold text-slate-500"> · {draft.fields.supplierName || "Supplier"}</span>
              {totalsSummary ? (
                <span className="ml-2 text-[10px] font-bold text-violet-700">
                  Invoice {formatMoney(draft.fields.total ?? totalsSummary.sumIncl, draft.fields.currency)}
                  {totalsSummary.hasMajorMismatch
                    ? " · mismatch"
                    : totalsSummary.hasRoundingDifference
                      ? " · rounding"
                      : ""}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ReviewWorkspaceLayoutControls layout={workspaceLayout} onChange={setWorkspaceLayout} />
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={saving}
              className="rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button
              type="button"
              onClick={requestDelete}
              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-700"
            >
              <Trash2 size={11} />
              Delete
            </button>
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={approving}
              className="rounded-lg bg-[#24183F] border border-[#A855F7]/30 px-2.5 py-1 text-[10px] font-black text-[#F8FAFC] disabled:opacity-60"
            >
              {approving ? "Approving…" : "Approve & Update Costs"}
            </button>
          </div>
        </div>
        {message ? <div className="mt-1 rounded bg-[#A855F7]/10 px-2 py-1 text-[10px] font-bold text-[#4D7C0F]">{message}</div> : null}
        {errorMessage ? <div className="mt-1 rounded bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">{errorMessage}</div> : null}
        {costAuditRows.length > 0 ? (
          <div className="mt-1 rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
            Cost audit: {costAuditRows.length} update(s) recorded on approve
          </div>
        ) : null}
        {riskAlerts.length > 0 ? (
          <div className="mt-1 rounded bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-800">
            Procurement risk: {String(riskAlerts[0]?.title || riskAlerts[0]?.risk_type || "Duplicate invoice")} —{" "}
            {String(riskAlerts[0]?.description || "Review before approving")}
          </div>
        ) : null}
        {overrideAudit.length > 0 ? (
          <div className="mt-1 rounded bg-fuchsia-50 px-2 py-1 text-[10px] font-semibold text-fuchsia-800">
            Supervisor override recorded · {String(overrideAudit[0]?.overridden_at || "").slice(0, 16)}
          </div>
        ) : null}
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden p-3 lg:flex-row lg:gap-3 lg:p-4">
        <div
          className={`flex min-h-0 flex-col overflow-hidden transition-[width] duration-200 ${
            previewFullscreen ? "w-[58%] shrink-0" : `shrink-0 ${layoutColumnClass(workspaceLayout, "invoice")}`
          }`}
          onPointerDown={() => setWorkspaceLayout("focus-invoice")}
          role="presentation"
        >
          <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
            <div className="text-sm font-black text-slate-900">Original Invoice</div>
            {workspaceLayout !== "focus-invoice" && !previewFullscreen ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setWorkspaceLayout("focus-invoice")}
                className="text-[10px] font-black text-violet-700 underline"
              >
                Focus Invoice
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{previewPanel}</div>
        </div>

        <div
          className={`flex min-h-0 flex-col overflow-hidden transition-[width] duration-200 ${
            previewFullscreen ? "min-w-0 flex-1 pr-1" : `min-w-0 flex-1 ${layoutColumnClass(workspaceLayout, "review")}`
          }`}
          onPointerDown={() => setWorkspaceLayout("focus-review")}
          role="presentation"
        >
          {workspaceLayout !== "focus-review" && !previewFullscreen ? (
            <div className="mb-1 flex shrink-0 justify-end">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setWorkspaceLayout("focus-review")}
                className="rounded-lg bg-violet-100 px-3 py-1.5 text-[10px] font-black text-violet-800"
              >
                Focus Review
              </button>
            </div>
          ) : null}
          {extractionPanel}
        </div>
      </main>

    </div>
  );

  return (
    <>
      {reviewBody}
      {editIngredientModal ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-slate-950">Edit Ingredient</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Updates the master ingredient record. This line stays mapped.</p>
            <label className="mt-4 grid gap-1 text-xs font-black uppercase text-slate-500">
              Name
              <input
                className={inputClass}
                value={editIngredientModal.name}
                onChange={(e) => setEditIngredientModal({ ...editIngredientModal, name: e.target.value })}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditIngredientModal(null)} className="rounded-xl border px-4 py-2 text-xs font-black">
                Cancel
              </button>
              <button
                type="button"
                disabled={savingIngredient}
                onClick={() => void submitEditIngredient()}
                className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-60"
              >
                {savingIngredient ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {createModal ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-slate-950">
              Add New {createModal.entityType === "packaging" ? "Packaging" : "Ingredient"}
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Prefilled from invoice line. Save links line and remembers supplier mapping.</p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                Name
                <input className={inputClass} value={createModal.name} onChange={(e) => setCreateModal({ ...createModal, name: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                Unit
                <input className={inputClass} value={createModal.unit} onChange={(e) => setCreateModal({ ...createModal, unit: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                Latest cost (from invoice unit price)
                <input
                  type="number"
                  className={inputClass}
                  value={createModal.purchaseCost}
                  onChange={(e) => setCreateModal({ ...createModal, purchaseCost: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCreateModal(null)} className="rounded-xl border px-4 py-2 text-xs font-black">
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingEntity}
                onClick={() => void submitCreateEntity()}
                className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-60"
              >
                {creatingEntity ? "Saving…" : "Save & Link"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {overrideModal?.open ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-rose-800">Approval blocked by company policy</h3>
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs font-semibold text-slate-700">
              {overrideModal.violations.map((v) => (
                <li key={v.rule} className="rounded-lg bg-rose-50 px-2 py-1">
                  {v.message}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs font-bold text-slate-600">Supervisor override</p>
            <label className="mt-2 block text-xs font-black uppercase text-slate-500">
              PIN
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                value={overrideModal.pin}
                onChange={(e) => setOverrideModal({ ...overrideModal, pin: e.target.value })}
              />
            </label>
            <label className="mt-2 block text-xs font-black uppercase text-slate-500">
              Override reason
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                rows={3}
                value={overrideModal.reason}
                onChange={(e) => setOverrideModal({ ...overrideModal, reason: e.target.value })}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverrideModal(null)}
                className="rounded-xl px-4 py-2 text-xs font-black text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => void submitSupervisorOverride()}
                className="rounded-xl bg-fuchsia-600 px-4 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-60"
              >
                {approving ? "Approving…" : "Supervisor override & approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        confirming={deleteConfirm.confirming}
        message={deleteConfirm.message}
        onCancel={deleteConfirm.cancel}
        onConfirm={() => void deleteConfirm.confirm()}
      />
    </>
  );
}
