"use client";

import { useCallback, useEffect, useState } from "react";
import type { PoApprovalRules } from "@/lib/vyron-procurement";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function PurchaseOrderSettingsClient({
  initialRules,
  initialCompanyResolved = true,
}: {
  initialRules: PoApprovalRules;
  initialCompanyResolved?: boolean;
}) {
  const { canEdit } = useModulePermissions("purchase_orders");
  const [rules, setRules] = useState<PoApprovalRules>(initialRules);
  const [companyResolved, setCompanyResolved] = useState(initialCompanyResolved);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { query } = poApiWorkspaceContext();
    try {
      const res = await fetch(`/api/purchase-orders/approval-rules${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok || !data.rules) throw new Error(data.error || "Could not load settings.");
      setRules(data.rules as PoApprovalRules);
      setCompanyResolved(true);
    } catch (err) {
      setCompanyResolved(false);
      setError(err instanceof Error ? err.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!companyResolved) {
      setError("No active workspace company. Select a client workspace before saving settings.");
      return;
    }
    if (!canEdit) {
      setError("You do not have permission to save PO approval settings.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    const { body: workspaceBody } = poApiWorkspaceContext();
    try {
      const res = await fetch("/api/purchase-orders/approval-rules", {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rules, ...workspaceBody }),
      });
      const data = await res.json();
      if (!data.ok || !data.rules) throw new Error(data.error || "Save failed");
      setRules(data.rules as PoApprovalRules);
      setCompanyResolved(true);
      setMessage(data.message || "Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputsDisabled = !companyResolved || !canEdit;

  if (loading) {
    return <p className="text-sm font-bold text-slate-500">Loading PO approval settings…</p>;
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Purchase Order Settings",
        subtitle: "Premium VYRON COST workflow for purchase order settings.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="max-w-xl rounded-[2rem] border border-violet-100 bg-white p-6">
            <h2 className="text-xl font-black">PO & Invoice Approval Thresholds</h2>
            {!companyResolved ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                No active workspace company. Select a client workspace to load and save PO approval settings.
              </p>
            ) : null}
            <p className="mt-2 text-sm text-slate-500">
              &lt; R{rules.autoApproveBelow.toLocaleString()} auto-approve · R{rules.autoApproveBelow.toLocaleString()}–R
              {rules.supervisorApproveBelow.toLocaleString()} supervisor · above manager/CFO
            </p>
            <label className="mt-4 block text-xs font-black uppercase text-slate-500">
              Auto approve below (R)
              <input
                type="number"
                disabled={inputsDisabled}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50"
                value={rules.autoApproveBelow}
                onChange={(e) => setRules((r) => ({ ...r, autoApproveBelow: Number(e.target.value) }))}
              />
            </label>
            <label className="mt-3 block text-xs font-black uppercase text-slate-500">
              Supervisor approval below (R)
              <input
                type="number"
                disabled={inputsDisabled}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50"
                value={rules.supervisorApproveBelow}
                onChange={(e) => setRules((r) => ({ ...r, supervisorApproveBelow: Number(e.target.value) }))}
              />
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                disabled={inputsDisabled}
                checked={rules.requirePoBeforeInvoiceApproval}
                onChange={(e) => setRules((r) => ({ ...r, requirePoBeforeInvoiceApproval: e.target.checked }))}
              />
              Require PO linked before invoice approval
            </label>
            {message ? <p className="mt-3 text-xs font-bold text-violet-700">{message}</p> : null}
            {error ? <p className="mt-3 text-xs font-bold text-red-600">{error}</p> : null}
            {canEdit && companyResolved ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="mt-5 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            ) : null}
          </section>
    </VyronPremiumPageShell>
  );
}
