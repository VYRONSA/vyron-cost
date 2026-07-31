"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCcw, Save } from "lucide-react";
import { useXeroPermissions } from "@/hooks/useModulePermissions";
import { VYRON_MASTER } from "@/components/vyron-ui";
import {
  DEFAULT_XERO_ACCOUNT_MAPPING,
  filterXeroAccountsForRole,
  type XeroAccountCatalog,
  type XeroAccountMapping,
  type XeroAccountRole,
} from "@/lib/vyron-xero-integration";

const M = VYRON_MASTER;

const COMPANY_DEFAULT_FIELDS: Array<{ key: keyof XeroAccountMapping; label: string; role: XeroAccountRole }> = [
  { key: "salesAccount", label: "Default Sales Account", role: "salesAccount" },
  { key: "costOfSalesAccount", label: "Default Cost of Sales Account", role: "costOfSalesAccount" },
  { key: "inventoryAssetAccount", label: "Default Inventory Asset Account", role: "inventoryAssetAccount" },
  { key: "wipAccount", label: "Default WIP Account", role: "wipAccount" },
  { key: "manufacturingVarianceAccount", label: "Default Manufacturing Variance Account", role: "manufacturingVarianceAccount" },
  { key: "stockAdjustmentAccount", label: "Default Stock Adjustment Account", role: "stockAdjustmentAccount" },
  { key: "freightIncomeAccount", label: "Default Freight Income Account", role: "freightIncomeAccount" },
  { key: "freightExpenseAccount", label: "Default Freight Expense Account", role: "freightExpenseAccount" },
];

type MappingPanelItem = { label: string; ok: boolean; required: string };

export default function XeroFinancialDefaultsClient() {
  const { canSync, canEditMapping } = useXeroPermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<XeroAccountMapping>(DEFAULT_XERO_ACCOUNT_MAPPING);
  const [accountCatalog, setAccountCatalog] = useState<XeroAccountCatalog>({
    syncedAt: null,
    syncedBy: null,
    source: "manual",
    accounts: [],
  });
  const [taxTypes, setTaxTypes] = useState<string[]>([]);
  const [mappingPanel, setMappingPanel] = useState<MappingPanelItem[]>([]);

  async function loadDefaults() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/xero/accounts", { credentials: "include" });
      const data = await response.json();
      if (!data?.ok) {
        setError(data?.error || "Could not load company financial defaults.");
        return;
      }

      setAccountCatalog({
        syncedAt: data.accountCatalog?.syncedAt || null,
        syncedBy: data.accountCatalog?.syncedBy || null,
        source: data.accountCatalog?.source || "manual",
        accounts: Array.isArray(data.accountCatalog?.accounts) ? data.accountCatalog.accounts : [],
      });
      setMapping({ ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(data.mapping || {}) });
      setTaxTypes(Array.isArray(data.taxTypes) ? data.taxTypes : []);
      setMappingPanel(Array.isArray(data.mappingPanel) ? data.mappingPanel : []);
    } catch {
      setError("Could not load company financial defaults.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDefaults();
  }, []);

  async function refreshChartOfAccounts() {
    if (!canSync) return;
    setRefreshing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/xero/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-from-xero" }),
      });
      const data = await response.json();
      if (!data?.ok) {
        setError(data?.error || "Refresh failed.");
        return;
      }
      setMessage("Chart of Accounts refreshed.");
      setAccountCatalog({
        syncedAt: data.accountCatalog?.syncedAt || null,
        syncedBy: data.accountCatalog?.syncedBy || null,
        source: data.accountCatalog?.source || "manual",
        accounts: Array.isArray(data.accountCatalog?.accounts) ? data.accountCatalog.accounts : [],
      });
      setMapping({ ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(data.mapping || {}) });
      setTaxTypes(Array.isArray(data.taxTypes) ? data.taxTypes : []);
      setMappingPanel(Array.isArray(data.mappingPanel) ? data.mappingPanel : []);
    } catch {
      setError("Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function saveDefaults() {
    if (!canEditMapping) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/xero/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-defaults", mapping }),
      });
      const data = await response.json();
      if (!data?.ok) {
        setError(data?.error || "Save failed.");
        return;
      }
      setMapping({ ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(data.mapping || {}) });
      setTaxTypes(Array.isArray(data.taxTypes) ? data.taxTypes : []);
      setMappingPanel(Array.isArray(data.mappingPanel) ? data.mappingPanel : []);
      setMessage("Company financial defaults saved.");
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const accountCount = useMemo(() => accountCatalog.accounts.length, [accountCatalog.accounts.length]);

  function accountOptionsForRole(role: XeroAccountRole) {
    return filterXeroAccountsForRole(accountCatalog.accounts, role);
  }

  function renderAccountSelector(role: XeroAccountRole, value: string, onChange: (next: string) => void) {
    const options = accountOptionsForRole(role);
    const current = String(value || "").trim();
    const hasCurrent = current ? options.some((option) => option.accountCode === current) : false;

    return (
      <select
        value={current}
        disabled={!canEditMapping}
        onChange={(event) => onChange(event.target.value)}
        className={`${M.select} mt-1 w-full`}
      >
        <option value="">Select account</option>
        {current && !hasCurrent ? <option value={current}>Current: {current}</option> : null}
        {options.map((account) => (
          <option key={`${role}-${account.accountCode}-${account.accountId}`} value={account.accountCode}>
            {account.accountCode} - {account.accountName}
            {account.accountType ? ` (${account.accountType})` : ""}
          </option>
        ))}
      </select>
    );
  }

  function renderTaxTypeSelector(value: string, onChange: (next: string) => void) {
    const current = String(value || "").trim();
    const hasCurrent = current ? taxTypes.includes(current) : false;

    return (
      <select
        value={current}
        disabled={!canEditMapping || taxTypes.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className={`${M.select} mt-1 w-full`}
      >
        <option value="">{taxTypes.length > 0 ? "Select Default VAT" : "No synced VAT tax types"}</option>
        {current && !hasCurrent ? <option value={current}>Current: {current}</option> : null}
        {taxTypes.map((taxType) => (
          <option key={taxType} value={taxType}>
            {taxType}
          </option>
        ))}
      </select>
    );
  }

  return (
    <section className={M.moduleDataSection}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0F172A]">Company Financial Defaults</h2>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            Configure company-scoped defaults for financial posting. Product and category mappings can override these.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/integrations/xero" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
            Back to Xero Integration
          </Link>
          {canSync ? (
            <button
              type="button"
              onClick={() => void refreshChartOfAccounts()}
              disabled={refreshing}
              className={`${M.secondaryBtn} px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <RefreshCcw size={14} className="inline" /> {refreshing ? "Refreshing..." : "Refresh Chart of Accounts"}
            </button>
          ) : null}
          {canEditMapping ? (
            <button
              type="button"
              onClick={() => void saveDefaults()}
              disabled={saving || loading}
              className={`${M.primaryBtn} px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Save size={14} className="inline" /> {saving ? "Saving..." : "Save Defaults"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm text-[#334155]">
        <p className="font-bold text-[#0F172A]">Synced Chart of Accounts</p>
        <p className="mt-1 text-xs font-medium text-[#64748B]">
          {accountCatalog.syncedAt
            ? `Synced ${new Date(accountCatalog.syncedAt).toLocaleString()} (${accountCount} accounts).`
            : "No synced chart of accounts yet. Refresh to load local account catalog."}
        </p>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-[#E2E8F0] bg-white p-6 text-sm font-semibold text-[#64748B]">
          Loading company financial defaults...
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {COMPANY_DEFAULT_FIELDS.map(({ key, label, role }) => (
            <label key={key} className="text-xs font-bold text-[#64748B]">
              {label}
              {renderAccountSelector(role, mapping[key], (next) =>
                setMapping((current) => ({ ...current, [key]: next }))
              )}
            </label>
          ))}
          <label className="text-xs font-bold text-[#64748B]">
            Default VAT
            {renderTaxTypeSelector(mapping.vatStandard, (next) =>
              setMapping((current) => ({ ...current, vatStandard: next }))
            )}
          </label>
        </div>
      ) : null}

      {mappingPanel.length > 0 ? (
        <div className="mt-4 space-y-2">
          {mappingPanel.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm">
              <span className="font-medium text-[#334155]">{item.label}</span>
              <span className={`font-bold ${item.ok ? "text-violet-700" : "text-fuchsia-700"}`}>
                {item.ok ? "Ready" : "Required"}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {message ? <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
    </section>
  );
}
