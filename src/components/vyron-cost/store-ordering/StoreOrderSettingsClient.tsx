"use client";

import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER } from "@/components/vyron-ui";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { StoreOrderApprovalRules } from "@/lib/vyron-store-order-commercial";

export default function StoreOrderSettingsClient() {
  const { canApprove } = useModulePermissions("store_orders");
  const [rules, setRules] = useState<StoreOrderApprovalRules>({
    maxOrderValue: 50000,
    minMarginPct: 25,
    maxQtyVariancePct: 50,
    warnInactiveProducts: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/store-orders/approval-rules");
        const data = await response.json();
        if (data.ok && data.rules) setRules(data.rules as StoreOrderApprovalRules);
      } catch {
        setError("Could not load approval rules.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveRules() {
    if (!canApprove) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/store-orders/approval-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Save failed.");
        return;
      }
      setRules(data.rules as StoreOrderApprovalRules);
      setMessage("Approval warning thresholds saved.");
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Store Ordering",
        title: "Approval Warning Rules",
        subtitle: "Configure commercial warning thresholds — orders are never blocked.",
        outcomes: [
          "Warn when order value exceeds threshold",
          "Warn when margin falls below target",
          "Warn on quantity variance and inactive products",
        ],
      }}
    >
      <div className="space-y-6">
        {message ? (
          <div className="rounded-2xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-semibold text-[var(--vyron-success-fg)]">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={`${VYRON_MASTER.moduleDataSection} grid gap-4 md:grid-cols-2`}>
          <label className="space-y-2 text-sm font-semibold text-[#334155]">
            Max order value (warning)
            <input
              type="number"
              min="0"
              disabled={loading || !canApprove}
              value={rules.maxOrderValue}
              onChange={(e) => setRules((current) => ({ ...current, maxOrderValue: Number(e.target.value) }))}
              className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="space-y-2 text-sm font-semibold text-[#334155]">
            Min margin % (warning)
            <input
              type="number"
              min="0"
              max="100"
              disabled={loading || !canApprove}
              value={rules.minMarginPct}
              onChange={(e) => setRules((current) => ({ ...current, minMarginPct: Number(e.target.value) }))}
              className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="space-y-2 text-sm font-semibold text-[#334155]">
            Max qty variance % above store average
            <input
              type="number"
              min="0"
              disabled={loading || !canApprove}
              value={rules.maxQtyVariancePct}
              onChange={(e) => setRules((current) => ({ ...current, maxQtyVariancePct: Number(e.target.value) }))}
              className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-3 pt-8 text-sm font-semibold text-[#334155]">
            <input
              type="checkbox"
              disabled={loading || !canApprove}
              checked={rules.warnInactiveProducts}
              onChange={(e) => setRules((current) => ({ ...current, warnInactiveProducts: e.target.checked }))}
              className="h-4 w-4"
            />
            Warn when inactive product ordered
          </label>
        </section>

        {canApprove ? (
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void saveRules()}
            className={`${VYRON_MASTER.primaryBtn} px-4 py-2.5 text-sm disabled:opacity-60`}
          >
            {saving ? "Saving…" : "Save Warning Rules"}
          </button>
        ) : null}
      </div>
    </VyronPremiumPageShell>
  );
}
