"use client";

import { useState } from "react";
import { useReportsPermissions } from "@/hooks/useModulePermissions";
import { exportTenantReportCsv, exportTenantReportPdf } from "@/lib/vyron-report-pdf-export";
import type { TenantReportExportPayload } from "@/lib/vyron-report-exports";

type ReportExportActionsProps = {
  reportKey: "inventory-stock" | "manufacturing" | "sales";
};

export default function ReportExportActions({ reportKey }: ReportExportActionsProps) {
  const { canExport } = useReportsPermissions();
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPayload() {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const response = await fetch(`/api/reports/exports/${reportKey}${search}`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok || !data?.export) {
      throw new Error(data?.error || "Report export failed.");
    }

    return data.export as TenantReportExportPayload;
  }

  async function exportPdf() {
    setError(null);
    setBusy("pdf");
    try {
      const payload = await loadPayload();
      exportTenantReportPdf(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed.");
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setError(null);
    setBusy("csv");
    try {
      const payload = await loadPayload();
      exportTenantReportCsv(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black"
        onClick={() => window.print()}
      >
        Print
      </button>
      <button
        type="button"
        disabled={!canExport || busy !== null}
        className="rounded-full bg-violet-700 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        onClick={exportCsv}
      >
        {busy === "csv" ? "Exporting CSV..." : "Export CSV"}
      </button>
      <button
        type="button"
        disabled={!canExport || busy !== null}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
        onClick={exportPdf}
      >
        {busy === "pdf" ? "Generating PDF..." : "Export PDF"}
      </button>
      {error ? <p className="w-full text-xs font-bold text-rose-700">{error}</p> : null}
    </>
  );
}
