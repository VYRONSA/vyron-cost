"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import PoLinkPanel from "@/components/PoLinkPanel";
import ExtractionQualityPanel from "@/components/ExtractionQualityPanel";
import InvoiceReviewTotalsFooter, { InvoiceTotalsWarningBanner } from "@/components/InvoiceReviewTotalsFooter";
import LineItemMatchCombobox from "@/components/LineItemMatchCombobox";
import ReviewWorkspaceLayoutControls, {
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
import { traceStart, traceComplete, traceEvent, traceRows } from "@/lib/vyron-workflow-trace";
import {
  type DocumentViewerRegions,
  type ViewerFocusTarget,
  estimateLineBBox,
} from "@/lib/vyron-document-viewer-types";

const InvoiceDocumentViewer = dynamic(() => import("@/components/InvoiceDocumentViewer"), { ssr: false });

function confidenceTone(score: number | null) {
  if (score === null) return "bg-slate-200 text-slate-600";
  if (score >= 85) return "bg-[#A855F7]/12 text-[#7E22CE]";
  if (score >= 70) return "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
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

/**
 * How long the review screen waits for an extraction to appear.
 *
 * Was 60,000ms. Worst measured extraction was 92,867ms (V1, scanned invoice),
 * so the screen gave up while the server was still working and told the
 * operator "taking longer than expected" on a run that then succeeded
 * unseen — a guaranteed stall, not a rare one.
 *
 * The bound that matters is the route's own ceiling: `maxDuration = 120`
 * seconds in app/api/documents/[id]/extract/route.ts. No extraction can outlive
 * it, so waiting past that plus a margin for the final persistence and reload
 * cannot time out on a run that is still viable. If this ever fires now, the
 * request is genuinely dead rather than merely slow.
 */
const EXTRACTION_POLL_TIMEOUT_MS = 150_000;

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
  /** Poll tick sequence for the workflow trace. Reset when polling restarts. */
  const pollTickRef = useRef(0);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [retryingExtraction, setRetryingExtraction] = useState(false);
  /** null = follow the layout default; true/false = the operator's own choice. */
  const [headerOverride, setHeaderOverride] = useState<boolean | null>(null);
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
    const status = next.status.toLowerCase();
    /*
     * A run in progress is polled even when the draft already has content.
     *
     * `hasExtractedContent` is true for any previously extracted document, so
     * re-extracting one used to disable polling entirely: the server replaced
     * the rows while the screen kept showing the PREVIOUS run's, with no refresh
     * and no indication anything had changed. Status "extracting" is a fact
     * about right now and outranks the presence of older content.
     */
    if (status === "extracting") return true;
    if (hasExtractedContent(next)) return false;
    return status === "uploaded" || status === "uploading" || status === "stored";
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

      traceStart("UI REVIEW LOAD", documentId, { reason: "mount or refresh" });
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
        traceComplete("UI REVIEW LOAD", documentId, { status: next.status, lines: next.lines.length });
        traceRows("5-react-grid", documentId, next.lines.length, { ignored: next.lines.filter((l) => l.ignored).length, rendered: next.lines.filter((l) => !l.ignored).length });
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
          traceStart("UI AUTO EXTRACT", documentId);
          setMessage("Starting automatic extraction…");
          const extractRes = await fetch(`/api/documents/${documentId}/extract`, {
            method: "POST",
            signal: controller.signal,
          });
          const extractData = await extractRes.json().catch(() => ({ ok: false }));
          if (!extractRes.ok || (!extractData.ok && !extractData.partial)) {
            throw new Error(extractData.error || "Automatic extraction failed.");
          }
          traceComplete("UI AUTO EXTRACT", documentId, { ok: extractData.ok, partial: Boolean(extractData.partial) });
          traceEvent("UI REFRESH AFTER EXTRACT", documentId);
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
    if (pollingStartedAtRef.current === null) pollTickRef.current = 0;
    pollingStartedAtRef.current = startedAt;

    const poll = async () => {
      try {
        pollTickRef.current += 1;
        const tickNumber = pollTickRef.current;
        const next = await loadReviewDraft(documentId);
        traceEvent("UI POLL TICK", documentId, { tick: tickNumber, pollElapsedMs: Date.now() - startedAt, documentStatus: next.status, rowsSeen: next.lines.length, refreshTriggered: hasExtractedContent(next), completed: hasExtractedContent(next) });
        if (hasExtractedContent(next)) {
          traceEvent("UI POLL RESOLVED", documentId, { status: next.status, lines: next.lines.length });
          setDraft(next);
          setLineMatchQuality(buildInitialLineMatchQuality(next));
          pollingStartedAtRef.current = null;
          return;
        }
        if (Date.now() - startedAt >= EXTRACTION_POLL_TIMEOUT_MS) {
          traceEvent("UI POLL TIMEOUT", documentId, { afterMs: Date.now() - startedAt });
          setMessage("Extraction is taking longer than expected.");
          pollingStartedAtRef.current = null;
          return;
        }
        pollingTimerRef.current = setTimeout(() => {
          void poll();
        }, 1000);
      } catch {
        if (Date.now() - startedAt >= EXTRACTION_POLL_TIMEOUT_MS) {
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
    traceEvent("ADD LINE CLICK", documentId, { before: draft?.lines.length ?? 0 });
    setDraft((current) => {
      if (!current) {
        traceEvent("ADD LINE STATE", documentId, { applied: false, reason: "no draft loaded" });
        return current;
      }
      const next = { ...current, lines: [...current.lines, createEmptyLine()] };
      traceEvent("ADD LINE STATE", documentId, { applied: true, after: next.lines.length });
      return next;
    });
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
      traceStart("UI SAVE DRAFT", documentId, { linesSent: draft.lines.length });
      const result = await saveReviewCorrections(draft);
      traceComplete("UI SAVE DRAFT", documentId, { correctedFieldCount: result?.correctedFieldCount ?? null, mappedLines: result?.mappedLines ?? null });
      traceEvent("UI RELOAD AFTER SAVE", documentId);
      const refreshed = await refreshDraft();
      traceRows("6-persisted-after-save", documentId, refreshed.lines.length, { sent: draft.lines.length });
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

  /*
    The operator's way out of a stuck extraction.

    MEASURED on document f547d4df: it sat in status "extracting" for two days
    after a run died server-side. The screen polled, hit the timeout, printed
    "Extraction is taking longer than expected." and stopped — with no control
    of any kind. The document was unrecoverable from the UI even though a
    single re-run extracted it correctly in 24.6s (4 lines, reconciled to the
    invoice subtotal with zero variance). Nothing was wrong with the extractor;
    the screen simply had no retry.

    The button is offered for the whole of the "extracting" state rather than
    only after the timeout. The draft carries no run timestamp, so the screen
    cannot tell a live run from an abandoned one, and making the operator wait
    150 seconds to find out is the behaviour that produced this defect.

    Declared above the early returns below — it is a hook, and hooks cannot sit
    behind a conditional return.
  */
  const retryExtraction = useCallback(async () => {
    setRetryingExtraction(true);
    setErrorMessage("");
    setMessage("Restarting extraction…");
    try {
      const res = await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (!data.ok && !data.partial)) {
        throw new Error(data.error || "Extraction failed.");
      }
      const refreshed = await loadReviewDraft(documentId);
      setDraft(refreshed);
      setLineMatchQuality(buildInitialLineMatchQuality(refreshed));
      setMessage(`Extraction complete — ${refreshed.lines.length} line item(s) read.`);
    } catch (error) {
      setMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Extraction failed.");
    } finally {
      setRetryingExtraction(false);
    }
  }, [documentId]);

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
        <Link href="/document-intelligence" className="rounded-xl vyron-grad-surface px-4 py-2 text-sm font-semibold text-white">
          Back to Document Intelligence
        </Link>
      </div>
    );
  }

  const inputClass = "w-full rounded-lg border px-2 py-1.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-400";

  /*
    The grid input, sized for scanning rather than for form-filling.

    MEASURED at 1366x768: at px-3 py-2 with a py-1.5 text-sm input, a row is
    47px, so a 16-line invoice needs 752px of a 460px grid and the clerk scrolls
    to see the rest. The printed invoice shows all sixteen lines at once. If the
    extracted table cannot, every line costs a scroll on one side and a hunt on
    the other. At px-2 py-0.5 with a text-xs input a row is ~30px, so sixteen
    lines fit in ~480px and both lists are fully visible together.
  */
  const cellInput = "w-full rounded-md border px-1.5 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-violet-400";
  const cellPad = "px-1.5 py-0.5";

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
      <div className="flex h-full min-h-[160px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">
        {previewError || "No preview available"}
      </div>
    );

  /*
    The invoice header COLLAPSES in the focus modes. It is never removed.

    An earlier revision hid it outright, which left the operator with no way to
    read or edit the supplier, invoice number or dates and — worse — nothing to
    click to bring it back. A control the operator cannot reach is a defect, not
    a layout. The collapsed state is a 30px bar that is always present and
    always clickable, so the header costs almost nothing while remaining one
    click away in every mode.

    The default is open in Split View and closed in the focus modes, because
    MEASURED at 1366x768 the 11-field grid stacks to 1056px in the 221px Focus
    Invoice strip and its capped window still took 257px of the 559px panel,
    leaving the line grid 9px and zero visible rows. Once the operator toggles
    it, their choice wins over the default.
  */
  /*
    Collapsed by default in every mode, including Split View.

    MEASURED at 1366x768 on the 16-line Gourmet invoice: with the header open,
    Split View showed 3 of 16 lines. The header block took 224px of a 559px
    panel to display eleven fields the operator checks once, while the lines
    they check sixteen times were pushed off screen. The bar is always there and
    one click away, and the operator's own toggle still wins.
  */
  const headerOpen = headerOverride ?? false;
  const headerCompact = workspaceLayout !== "split";

  /*
    Column widths are driven by flex-grow weights, not width classes.
    MEASURED at 1366x768: the arbitrary-percentage classes `w-[72%]`/`w-[28%]`
    were never emitted into the stylesheet, so both focus modes fell back to
    `width: auto`; the `shrink-0` invoice column then pinned itself to its
    intrinsic 871px and left the review column 135px wide. At 135px the line
    grid's own title bar, warning banner and totals bar wrapped into 460px of
    chrome, which is why the grid only ever showed two rows.
    Grow weights need no generated class, and because every column has
    flex-basis 0 they divide the row exactly — the gap is subtracted first.
  */
  const columnWeights = previewFullscreen
    ? { invoice: 58, review: 42 }
    : workspaceLayout === "focus-invoice"
      ? { invoice: 78, review: 22 }
      : workspaceLayout === "focus-review"
        ? { invoice: 22, review: 78 }
        : { invoice: 50, review: 50 };

  /*
    The operator's way out of a stuck extraction.

    MEASURED on document f547d4df: it sat in status "extracting" for two days
    after a run died server-side. The screen polled, hit the timeout, printed
    "Extraction is taking longer than expected." and stopped — with no control
    of any kind. The document was unrecoverable from the UI even though a
    single re-run extracted it correctly in 24.6s (4 lines, reconciled to the
    invoice subtotal with zero variance). Nothing was wrong with the extractor;
    the screen simply had no retry.

    The button is offered for the whole of the "extracting" state rather than
    only after the timeout. The draft carries no run timestamp, so the screen
    cannot tell a live run from an abandoned one, and making the operator wait
    150 seconds to find out is the behaviour that produced this defect.
  */
  const extractionInProgress = (draft?.status || "").toLowerCase() === "extracting";

  /*
    One declarative column list, two column sets.

    This replaces twelve hand-written <td> blocks that had to be edited in
    lockstep with the twelve <th> blocks above them. That duplication is why the
    table could only ever have one shape: `min-w-[2100px]`, twelve columns, in a
    785px pane. To read a line total the clerk scrolled roughly 1300px right and
    back again — sixteen times per invoice, three hundred invoices a day.

    `compare` is the six columns actually printed on a supplier invoice, in the
    order they are printed (code first, then description). Nothing else earns
    its width while the operator is checking paper against screen.

    `edit` adds the columns that exist only on our side — VAT, confidence, and
    the master-data mapping — because that work has no counterpart on the page.

    Both sets are table-fixed and sum to 100%, so neither scrolls sideways.
  */
  /*
    Two width scales, because the same six columns live in a 501px pane when
    comparing and a 783px pane when editing.

    MEASURED with one scale: in Split View the six printed columns summed to
    50%, so Description absorbed the other half and the numbers were starved —
    codes rendered "TOM" for TOMONION, units "3l" for 3kg, line totals "1650("
    for 1650,09. A truncated figure cannot be checked against paper, so it is
    worse than the scroll it was meant to remove. `compareWidth` sums to 100
    across the compare set and spends it on the numbers, which are the values
    actually being verified; Description keeps enough to identify the item and
    carries its full text in a tooltip.
  */
  type LineColumn = {
    key: string;
    label: string;
    width: string;
    compareWidth?: string;
    compare: boolean;
    cell: (line: ReviewDraftLine) => React.ReactNode;
  };

  const lineColumns: LineColumn[] = [
    {
      key: "sku", label: "Code", width: "w-[10%]", compareWidth: "w-[14%]", compare: true,
      cell: (line) => (
        <input title={line.skuOrProductCode} className={`${cellInput} ${fieldClass(line.fieldConfidence?.skuOrProductCode ?? null)}`} value={line.skuOrProductCode}
          onChange={(e) => updateLine(line.id, { skuOrProductCode: e.target.value })} />
      ),
    },
    {
      key: "description", label: "Description", width: "w-[19%]", compareWidth: "w-[29%]", compare: true,
      cell: (line) => (
        <input title={line.description} className={`${cellInput} ${fieldClass(line.fieldConfidence?.description ?? null)}`} value={line.description}
          onChange={(e) => updateLine(line.id, { description: e.target.value })} />
      ),
    },
    {
      key: "qty", label: "Qty", width: "w-[6%]", compareWidth: "w-[8%]", compare: true,
      cell: (line) => (
        <input className={`${cellInput} text-right`} value={String(line.quantity ?? "")}
          onChange={(e) => updateLine(line.id, { quantity: parseMoneyNumber(e.target.value) })} />
      ),
    },
    {
      key: "unit", label: "Unit", width: "w-[8%]", compareWidth: "w-[12%]", compare: true,
      cell: (line) => (
        <input className={cellInput} value={line.unit}
          onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
      ),
    },
    {
      key: "unitPrice", label: "Unit Price", width: "w-[9%]", compareWidth: "w-[16%]", compare: true,
      cell: (line) => (
        <input className={`${cellInput} text-right`} value={String(line.unitPrice ?? "")}
          onChange={(e) => updateLine(line.id, { unitPrice: parseMoneyNumber(e.target.value) })} />
      ),
    },
    {
      key: "lineTotal", label: "Line Total", width: "w-[10%]", compareWidth: "w-[17%]", compare: true,
      cell: (line) => (
        <input className={`${cellInput} text-right`} value={String(line.lineTotal ?? "")}
          onChange={(e) => updateLine(line.id, { lineTotal: parseMoneyNumber(e.target.value) })} />
      ),
    },
    {
      key: "vat", label: "VAT", width: "w-[9%]", compare: false,
      cell: (line) => (
        <input className={`${cellInput} text-right`} value={String(line.vat ?? "")}
          onChange={(e) => updateLine(line.id, { vat: parseMoneyNumber(e.target.value) })} />
      ),
    },
    /*
      Excl VAT and the confidence badge used to be columns here. Both were
      dropped so the editing set fits 783px without sideways scrolling, and
      neither took measured evidence with it: Excl VAT is derived from quantity
      x unit price and its sum is on the totals bar, and the per-line confidence
      now tints the row-number cell and is readable exactly on hover. A column
      that costs a horizontal scroll on every one of sixteen rows has to earn
      its width against the only job here, which is comparing to paper.
    */
    {
      key: "matchType", label: "Type", width: "w-[8%]", compare: false,
      cell: (line) => (
        <select
          className={cellInput}
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
            updateLine(line.id, { ignored: false, matchedEntityType: newType, matchedEntityId: null, matchedEntityName: null });
          }}
        >
          <option value="">—</option>
          <option value="ingredient">Ingredient</option>
          <option value="packaging">Packaging</option>
          <option value="product">Product</option>
          <option value="ignore">Ignore</option>
        </select>
      ),
    },
    {
      key: "matchedItem", label: "Mapped To", width: "w-[13%]", compare: false,
      cell: (line) => (
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
      ),
    },
    {
      key: "ignore", label: "Skip", width: "w-[4%]", compare: false,
      cell: (line) => (
        <input type="checkbox" className="mx-auto block" checked={line.ignored}
          onChange={(e) => updateLine(line.id, { ignored: e.target.checked })} />
      ),
    },
  ];

  /* Split View is the comparison mode, so it carries only the printed columns. */
  const comparing = workspaceLayout === "split";
  const visibleColumns = comparing ? lineColumns.filter((c) => c.compare) : lineColumns;

  /*
    Down-column navigation — the mechanic that removes the mouse from the loop.

    A clerk checking sixteen lines against paper does not read a row and then a
    different row; they read one COLUMN down the page — all the quantities, then
    all the unit prices — because that is how the eye compares numbers. Arrow
    Down moves to the same field one row lower and keeps the caret in it, so a
    column of sixteen values is checked with sixteen keystrokes and no clicks
    and no pointing. The active row band follows, so the operator never loses
    their place after glancing at the invoice.

    Selects are left alone: arrow keys already mean something inside them.
  */
  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const target = event.target as HTMLElement;
    if (target.tagName === "SELECT") return;
    /* Declared with the other functions, so TS cannot narrow `draft` from the
       early return above — guard here instead. */
    const lines = draft?.lines ?? [];
    if (!lines.length) return;

    const currentIndex = lines.findIndex((l) => l.id === activeLineId);
    if (currentIndex === -1) {
      event.preventDefault();
      focusLine(lines[0], 0);
      return;
    }
    const nextIndex = event.key === "ArrowDown"
      ? Math.min(lines.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    if (nextIndex === currentIndex) return;
    event.preventDefault();

    const cell = target.closest("td");
    const row = target.closest("tr");
    const columnIndex = cell && row ? Array.from(row.children).indexOf(cell) : -1;

    const nextLine = lines[nextIndex];
    focusLine(nextLine, nextIndex);

    requestAnimationFrame(() => {
      const nextRow = document.querySelector(`[data-line-row="${nextLine.id}"]`);
      nextRow?.scrollIntoView({ block: "nearest" });
      if (columnIndex >= 0) {
        const field = nextRow?.children[columnIndex]?.querySelector("input, select") as HTMLElement | null;
        field?.focus();
      }
    });
  }

  /*
    Focus Invoice gets a fact card, not a squeezed copy of the grid.

    MEASURED at 1366x768: the review column in Focus Invoice is a 221px strip.
    A twelve-column editing grid rendered there is unreadable and unusable — it
    was the same component as the other two modes at a different width, which is
    precisely what makes the three modes feel like one. Focus Invoice exists so
    the operator can READ the page, so the side panel answers only the questions
    a reader asks — who sent it, which invoice, do the totals agree, how many
    lines, is anything unmapped — and stays out of the way otherwise.
  */
  const unmappedCount = draft.lines.filter((l) => !l.ignored && !l.matchedEntityId).length;
  const factCard = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Supplier</div>
        <div className="mt-0.5 text-sm font-black leading-tight text-slate-900">{draft.fields.supplierName || "—"}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Invoice</div>
            <div className="text-xs font-black text-slate-900">{draft.fields.invoiceNumber || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Date</div>
            <div className="text-xs font-black text-slate-900">{draft.fields.invoiceDate || "—"}</div>
          </div>
        </div>
      </div>

      {totalsSummary ? (
        <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Totals</div>
          <dl className="mt-1 space-y-0.5 text-xs font-bold text-slate-700">
            <div className="flex justify-between gap-2"><dt>Excl VAT</dt><dd className="font-black text-slate-900">{formatMoney(totalsSummary.sumExcl, draft.fields.currency || "ZAR")}</dd></div>
            <div className="flex justify-between gap-2"><dt>VAT</dt><dd className="font-black text-slate-900">{formatMoney(totalsSummary.sumVat, draft.fields.currency || "ZAR")}</dd></div>
            <div className="flex justify-between gap-2"><dt>Incl VAT</dt><dd className="font-black text-slate-900">{formatMoney(totalsSummary.sumIncl, draft.fields.currency || "ZAR")}</dd></div>
          </dl>
          <div
            className={`mt-2 rounded-lg px-2 py-1 text-[10px] font-black ${
              totalsSummary.hasMajorMismatch
                ? "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {totalsSummary.hasMajorMismatch ? "Totals do not agree" : "Totals agree with the invoice"}
          </div>
        </div>
      ) : null}

      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Lines</span>
          <span className="text-sm font-black text-slate-900">{draft.lines.length}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Unmapped</span>
          <span className={`text-sm font-black ${unmappedCount ? "text-[var(--vyron-warning-fg)]" : "text-emerald-700"}`}>
            {unmappedCount}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setWorkspaceLayout("focus-review")}
          className="mt-2 w-full rounded-lg vyron-grad-surface px-2 py-1.5 text-[10px] font-black text-white"
        >
          Edit these lines
        </button>
      </div>
    </div>
  );

  const extractionPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {/*
        Everything above the line table is bounded as one block.
        MEASURED in the browser at 1366x768: the header, the 3-way match panel
        and the extraction quality panel were each `shrink-0` and unbounded, so
        together they took the whole column. The line table collapsed to its
        140px floor and rendered entirely below the fold — 16 rows in the DOM,
        zero visible, and no page scroll to reach them. Capping this block is
        what guarantees the table the remaining height in every mode.
      */}
      {/* Always rendered, in every layout mode — this is the way back. */}
      <button
        type="button"
        onClick={() => setHeaderOverride(!headerOpen)}
        aria-expanded={headerOpen}
        className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-left shadow-sm hover:bg-slate-50"
      >
        <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
          Invoice Header
          {!headerOpen && (draft.fields.supplierName || draft.fields.invoiceNumber) ? (
            <span className="ml-2 normal-case tracking-normal text-slate-400">
              {[draft.fields.supplierName, draft.fields.invoiceNumber].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-slate-500 transition ${headerOpen ? "rotate-180" : ""}`} />
      </button>

      <div
        className={`flex min-h-0 shrink flex-col gap-2 overflow-y-auto overscroll-contain ${
          headerOpen ? "max-h-[40%]" : "hidden"
        }`}
      >
      {/*
        The header sizes to its content. It is not capped and does not scroll.
        MEASURED, both directions:
          two-column, uncapped   650px tall, 0px hidden, and at 1366x768 it left
                                 the line grid 0px — no rows visible at all
          capped at 30vh         324px visible with 318px of content HIDDEN
                                 behind a scrollbar the operator never asked for
        Neither is acceptable. Density is the fix rather than truncation: eleven
        fields across four columns occupy three rows instead of six, so every
        field stays on screen AND the grid keeps its height. Nothing is hidden.
      */}
      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
              <label key={key} className={`rounded-xl border p-2 ${fieldClass(score)}`}>
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

      {/*
        Directly above the line table on purpose: "3 of 11 rows read" has to sit
        next to the rows it is describing, or the operator reads the table as
        complete before reaching the caveat.
      */}
      <div className="shrink-0">
        <ExtractionQualityPanel record={draft.extractionQuality} />
      </div>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/*
          One line in the comparison mode, two when editing.
          The title, the count and the hint stack to 40px, which is a line row
          and a half taken from the thing the operator is here to look at. When
          comparing, they sit on one 24px line instead.

          "click a row to focus the invoice preview" used to be here. Nothing
          writes source_page or source_bbox — the insert payload in
          vyron-document-extraction.ts omits both — so the viewer never had a
          region to focus and the promise was never kept. It now describes the
          navigation that does work.
        */}
        <div className={`flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 ${comparing ? "py-1" : "py-2"}`}>
          {comparing ? (
            <div className="min-w-0 truncate text-[11px] font-black text-slate-900">
              Line Items · {draft.lines.length} · as printed on the invoice
            </div>
          ) : (
            <div>
              <div className="text-sm font-black text-slate-900">Line Items</div>
              <p className="text-[11px] font-semibold text-slate-500">
                {draft.lines.length} line{draft.lines.length === 1 ? "" : "s"} · ↑↓ moves down a column
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={addInvoiceLine}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg vyron-grad-surface font-semibold text-white ${
              comparing ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-[11px]"
            }`}
          >
            <Plus size={12} />
            {comparing ? "Add" : "Add Invoice Line"}
          </button>
        </div>
        {/*
          Suppressed while comparing — not because the warning stops mattering,
          but because the totals bar pinned to the bottom of this same section
          already carries the difference and is always on screen. Two statements
          of one fact cost a line row each in the mode with the fewest.
        */}
        {totalsSummary && !comparing ? <InvoiceTotalsWarningBanner summary={totalsSummary} /> : null}
        {/*
          A 280px floor here could exceed the space left after the header block,
          banner and totals footer on a short laptop screen. Every ancestor is
          overflow-hidden, so the excess was not scrollable — it was clipped, and
          the last rows became unreachable. A smaller floor keeps the table from
          collapsing without ever outgrowing its frame.
        */}
        <div className="min-h-0 flex-1 basis-0 overflow-auto overscroll-contain" onKeyDown={handleGridKeyDown}>
          {/*
            table-fixed with percentage widths, never min-w. The clerk compares
            paper to screen; a table wider than its pane turns every line into a
            horizontal round trip.
          */}
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 shadow-sm">
              <tr>
                <th className="w-[4%] px-1.5 py-1 text-center">#</th>
                {visibleColumns.map((col) => (
                  <th key={col.key} className={`${(comparing && col.compareWidth) || col.width} px-1.5 py-1`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.lines.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-sm font-bold text-slate-500">
                    No line items yet. Use &ldquo;Add Invoice Line&rdquo; to create one.
                  </td>
                </tr>
              ) : null}
              {draft.lines.map((line, lineIndex) => (
                <tr
                  key={line.id}
                  data-line-row={line.id}
                  /*
                    The row number and the zebra stripe are both eye-tracking
                    aids, not decoration. The operator counts position against
                    the printed invoice to know they are on the same line, and
                    the stripe keeps the eye on one row while it crosses six
                    columns. The active row is banded hard enough to find again
                    after a glance away at the page.
                  */
                  className={`cursor-pointer border-t border-slate-100 transition ${
                    activeLineId === line.id
                      ? "bg-violet-100 ring-2 ring-inset ring-violet-400"
                      : lineIndex % 2 === 1
                        ? "bg-slate-50/70 hover:bg-violet-50/50"
                        : "hover:bg-violet-50/50"
                  }`}
                  onClick={() => focusLine(line, lineIndex)}
                  /*
                    Every cell stops click propagation so that clicking an input
                    does not re-trigger the row handler — which also meant
                    clicking a field never made its row active, and the first
                    ArrowDown was spent selecting the row the operator was
                    already in. Focus is the honest signal: whatever field the
                    operator lands in, by mouse or by Tab, that row is active.
                  */
                  onFocusCapture={() => setActiveLineId(line.id)}
                >
                  {/*
                    The row number doubles as the confidence indicator. A low
                    score is the one thing that tells the operator "look at this
                    line harder", so it belongs where the eye already is when it
                    counts position against the paper — not in a twelfth column.
                    The exact measured score stays available on hover.
                  */}
                  <td
                    title={line.confidenceScore !== null ? `Extraction confidence ${line.confidenceScore}%` : "Confidence not measured"}
                    className={`${cellPad} text-center text-[10px] font-black ${
                      line.confidenceScore !== null && line.confidenceScore < 70
                        ? "bg-red-100 text-red-700"
                        : activeLineId === line.id
                          ? "text-violet-700"
                          : "text-slate-400"
                    }`}
                  >
                    {lineIndex + 1}
                  </td>
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={cellPad} onClick={(e) => e.stopPropagation()}>
                      {col.cell(line)}
                    </td>
                  ))}
                </tr>
              ))}
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
      /*
        Bounded height, not a minimum.
        `min-h-[calc(100dvh-5rem)]` let the workspace grow past the viewport, so
        a long line-item table scrolled the whole page and carried the invoice
        preview off the top of the screen — exactly when the operator needs to
        compare the two. Filling the shell's frame instead keeps both panes on
        screen and gives each its own scrollbar.
      */
      className={`flex flex-col overflow-hidden bg-slate-100 ${
        embedded ? "h-full min-h-0" : "h-screen"
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
              className="rounded-lg vyron-grad-surface border border-transparent px-2.5 py-1 text-[10px] font-black text-[#F8FAFC] disabled:opacity-60"
            >
              {approving ? "Approving…" : "Approve & Update Costs"}
            </button>
          </div>
        </div>
        {message || extractionInProgress ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded bg-[#A855F7]/10 px-2 py-1 text-[10px] font-bold text-[#4D7C0F]">
            <span>{message || "Extraction in progress…"}</span>
            {extractionInProgress ? (
              <button
                type="button"
                onClick={() => void retryExtraction()}
                disabled={retryingExtraction}
                className="rounded-md border border-violet-300 bg-white px-2 py-0.5 text-[10px] font-black text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >
                {retryingExtraction ? "Retrying…" : "Retry extraction"}
              </button>
            ) : null}
          </div>
        ) : null}
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
          <div className="mt-1 rounded bg-[var(--vyron-warning-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--vyron-warning-fg)]">
            Supervisor override recorded · {String(overrideAudit[0]?.overridden_at || "").slice(0, 16)}
          </div>
        ) : null}
      </header>

      {/* Tightened from p-3/p-4: every millimetre of padding here is a
          millimetre of invoice the operator cannot see. */}
      <main className="flex min-h-0 flex-1 overflow-hidden p-2 lg:flex-row lg:gap-2.5 lg:p-2.5">
        <div
          className="flex min-w-0 min-h-0 flex-col overflow-hidden transition-[flex-grow] duration-200"
          style={{ flexGrow: columnWeights.invoice, flexShrink: 1, flexBasis: 0 }}
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
          className={`flex min-w-0 min-h-0 flex-col overflow-hidden transition-[flex-grow] duration-200 ${
            previewFullscreen ? "pr-1" : ""
          }`}
          style={{ flexGrow: columnWeights.review, flexShrink: 1, flexBasis: 0 }}
          onPointerDown={() => setWorkspaceLayout("focus-review")}
          role="presentation"
        >
          {/*
            The in-column "Focus Review" shortcut is gone. It duplicated the mode
            switch already in the toolbar and cost 28px of the panel — one whole
            line row — in exactly the mode where rows are scarcest.
          */}
          {workspaceLayout === "focus-invoice" && !previewFullscreen ? factCard : extractionPanel}
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
                className="rounded-xl bg-[var(--vyron-warning-solid)] px-4 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-60"
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
