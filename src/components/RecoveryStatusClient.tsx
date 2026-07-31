"use client";

import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  addRecoveryEvidence,
  getRecoveryAuditTrail,
  getRecoveryEvidence,
  getRecoveryTrackingByKey,
  saveRecoveryTracking,
  type RecoveryAuditRow,
  type RecoveryEvidenceRow,
} from "@/lib/vyron-cost-recovery-data";

export default function RecoveryStatusClient({
  opportunityId,
  currentStatus,
  potentialRecovery,
}: {
  opportunityId: string;
  currentStatus?: string | null;
  potentialRecovery?: number | null;
}) {
  const [status, setStatus] = useState(currentStatus || "New");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [actionTaken, setActionTaken] = useState(false);
  const [actualRecovery, setActualRecovery] = useState(0);
  const [recoveryDate, setRecoveryDate] = useState("");
  const [recoveryMethod, setRecoveryMethod] = useState("");
  const [recoveryEvidence, setRecoveryEvidence] = useState("");
  const [evidenceRows, setEvidenceRows] = useState<RecoveryEvidenceRow[]>([]);
  const [auditRows, setAuditRows] = useState<RecoveryAuditRow[]>([]);
  const [newEvidenceType, setNewEvidenceType] = useState("Notes");
  const [newEvidenceTitle, setNewEvidenceTitle] = useState("");
  const [newEvidenceContent, setNewEvidenceContent] = useState("");
  const [newEvidenceUrl, setNewEvidenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [tracking, evidence, audit] = await Promise.all([
        getRecoveryTrackingByKey(opportunityId),
        getRecoveryEvidence(opportunityId),
        getRecoveryAuditTrail(opportunityId),
      ]);
      if (cancelled) return;
      if (tracking) {
        setStatus(tracking.status || currentStatus || "New");
        setOwnerName(tracking.ownerName || "");
        setOwnerEmail(tracking.ownerEmail || "");
        setNotes(tracking.notes || "");
        setDueDate(tracking.dueDate || "");
        setActionTaken(Boolean(tracking.actionTaken));
        setActualRecovery(Number(tracking.actualRecovery || 0));
        setRecoveryDate(tracking.recoveryDate || "");
        setRecoveryMethod(tracking.recoveryMethod || "");
        setRecoveryEvidence(tracking.recoveryEvidence || "");
      }
      setEvidenceRows(evidence);
      setAuditRows(audit);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [opportunityId, currentStatus]);

  async function saveTracking(nextStatus: string) {
    setStatus(nextStatus);
    setMessage("");
    setErrorMessage("");

    try {
      await saveRecoveryTracking(opportunityId, {
        status: nextStatus as any,
        ownerName,
        ownerEmail,
        notes,
        dueDate,
        actionTaken,
        actualRecovery,
        recoveryDate,
        recoveryMethod,
        recoveryEvidence,
      });
      const [evidence, audit] = await Promise.all([
        getRecoveryEvidence(opportunityId),
        getRecoveryAuditTrail(opportunityId),
      ]);
      setEvidenceRows(evidence);
      setAuditRows(audit);
      setMessage(`Tracking updated: ${nextStatus}.`);
    } catch (error: any) {
      setErrorMessage(error?.message || "Could not update status.");
    }
  }

  async function saveCurrent() {
    await saveTracking(status);
  }

  async function addEvidenceItem() {
    if (!newEvidenceTitle.trim()) {
      setErrorMessage("Evidence title is required.");
      return;
    }
    setErrorMessage("");
    await addRecoveryEvidence(opportunityId, {
      evidenceType: newEvidenceType,
      title: newEvidenceTitle.trim(),
      content: newEvidenceContent.trim() || undefined,
      documentUrl: newEvidenceUrl.trim() || undefined,
      createdBy: ownerName || "Finance Manager",
    });
    setNewEvidenceTitle("");
    setNewEvidenceContent("");
    setNewEvidenceUrl("");
    const evidence = await getRecoveryEvidence(opportunityId);
    setEvidenceRows(evidence);
    setMessage("Evidence added.");
  }

  const difference = Number(potentialRecovery || 0) - Number(actualRecovery || 0);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "recovery",
        badge: "Recovery Operations",
        title: "Recovery Status Control Room",
        subtitle: "Manage ownership, evidence, and auditability from opportunity to realized recovery.",
        outcomes: ["Maintain accountable owners", "Capture audit-grade evidence", "Track recovered value against potential"],
        formulas: ["Recovery Difference = Potential - Actual", "Status Flow = New > Review > Accepted > Recovered", "Evidence Count = Documents + Notes + Audit entries"],
        intelligenceItems: [
          { label: "Tracking model", detail: "Status transitions and owner assignments are recorded" },
          { label: "Evidence discipline", detail: "Supporting files and notes are attached per opportunity" },
          { label: "Audit trail", detail: "Field-level changes are time-stamped for governance" },
        ],
      }}
    >
      <div className="mt-5 rounded-3xl bg-violet-50 p-5">
        <div className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-violet-700">
        Recovery Tracker
        </div>
        <div className="flex flex-wrap gap-2">
        {["New", "Under Review", "Accepted", "Actioned", "Recovered", "Rejected", "Ignored"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => saveTracking(item)}
            className={`rounded-xl px-4 py-2 text-xs font-black ${
              status === item
                ? "bg-violet-700 text-white"
                : "bg-white text-violet-700"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
          Owner
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </label>
        <label className="rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
          Owner Email
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
        </label>
        <label className="rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
          Due Date
          <input type="date" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
          Recovery Date
          <input type="date" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" value={recoveryDate} onChange={(e) => setRecoveryDate(e.target.value)} />
        </label>
        <label className="rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
          Recovery Method
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" value={recoveryMethod} onChange={(e) => setRecoveryMethod(e.target.value)} />
        </label>
        <label className="rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
          Actual Recovery
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" value={String(actualRecovery)} onChange={(e) => setActualRecovery(Number(e.target.value || 0))} />
        </label>
      </div>

      <label className="mt-3 block rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
        Notes
        <textarea className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="mt-3 block rounded-xl bg-white p-3 text-xs font-bold text-slate-600">
        Recovery Evidence
        <textarea className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" rows={2} value={recoveryEvidence} onChange={(e) => setRecoveryEvidence(e.target.value)} />
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-700">
        <input type="checkbox" checked={actionTaken} onChange={(e) => setActionTaken(e.target.checked)} />
        Mark Action Taken
      </label>

      <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs font-black">
        <div className="rounded-xl bg-white px-3 py-2">Potential: R{Number(potentialRecovery || 0).toFixed(2)}</div>
        <div className="rounded-xl bg-white px-3 py-2">Recovered: R{Number(actualRecovery || 0).toFixed(2)}</div>
        <div className="rounded-xl bg-white px-3 py-2">Difference: R{difference.toFixed(2)}</div>
      </div>

      <button type="button" onClick={saveCurrent} className="mt-3 rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white">
        Save Tracking Updates
      </button>

      <div className="mt-5 rounded-2xl bg-white p-4">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Attach Evidence</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <select className="rounded-lg border border-slate-200 px-2 py-1 text-sm" value={newEvidenceType} onChange={(e) => setNewEvidenceType(e.target.value)}>
            <option>Notes</option>
            <option>Documents</option>
            <option>Supplier correspondence</option>
            <option>Management approval</option>
          </select>
          <input className="rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="Title" value={newEvidenceTitle} onChange={(e) => setNewEvidenceTitle(e.target.value)} />
          <input className="rounded-lg border border-slate-200 px-2 py-1 text-sm md:col-span-2" placeholder="Document URL (optional)" value={newEvidenceUrl} onChange={(e) => setNewEvidenceUrl(e.target.value)} />
          <textarea className="rounded-lg border border-slate-200 px-2 py-1 text-sm md:col-span-2" rows={2} placeholder="Evidence details" value={newEvidenceContent} onChange={(e) => setNewEvidenceContent(e.target.value)} />
        </div>
        <button type="button" onClick={addEvidenceItem} className="mt-2 rounded-xl bg-[#24183F] border border-[#A855F7]/30 px-4 py-2 text-xs font-black text-white">
          Add Evidence
        </button>

        {evidenceRows.length ? (
          <div className="mt-3 space-y-2">
            {evidenceRows.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                [{row.evidence_type}] {row.title} · {new Date(row.created_at).toLocaleString()}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl bg-white p-4">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Audit Trail</div>
        {auditRows.length ? (
          <div className="mt-2 space-y-2">
            {auditRows.slice(0, 8).map((row) => (
              <div key={row.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                {new Date(row.changed_at).toLocaleString()} · {row.field_name}: {row.old_value || "—"} → {row.new_value || "—"} ({row.changed_by || "unknown"})
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">No audit events yet.</div>
        )}
      </div>

      {message && (
        <div className="mt-4 rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/12 px-4 py-3 text-sm font-bold text-[#7E22CE]">
          {message}
        </div>
      )}

        {errorMessage && (
          <div className="mt-4 rounded-2xl bg-red-100 px-4 py-3 text-sm font-bold text-red-700">
            {errorMessage}
          </div>
        )}
      </div>
    </VyronPremiumPageShell>
  );
}
