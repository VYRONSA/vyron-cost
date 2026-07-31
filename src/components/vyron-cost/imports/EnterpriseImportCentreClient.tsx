"use client";

import Link from "next/link";
import { ArrowRight, Download, FileClock, Upload } from "lucide-react";
import { useWorkspacePermissions } from "@/hooks/useWorkspacePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import StatusPill from "@/components/StatusPill";
import type {
  ImportOperationalSnapshot,
  ImportOperationalStatus,
  ImportOperationsCentreData,
} from "@/lib/vyron-import-operations-centre";

type ImportCard = {
  id: string;
  name: string;
  description: string;
  snapshotKey: string;
  actions: {
    importHref?: string;
    templateHref?: string;
    historyHref?: string;
  };
};

const importCards: ImportCard[] = [
  {
    id: "raw-material-import",
    snapshotKey: "raw-material-import",
    name: "Raw Material Import",
    description: "Import ingredient and material records using the existing workspace import flow.",
    actions: {
      importHref: "/import-centre/workspace",
      templateHref: "/api/import-centre/template?module=raw-materials",
      historyHref: "/import-centre/workspace",
    },
  },
  {
    id: "product-import",
    snapshotKey: "product-import",
    name: "Product Import",
    description: "Import finished goods and product master records using the existing workspace import flow.",
    actions: {
      importHref: "/import-centre/workspace",
      templateHref: "/api/import-centre/template?module=finished-goods",
      historyHref: "/import-centre/workspace",
    },
  },
  {
    id: "supplier-import",
    snapshotKey: "supplier-import",
    name: "Supplier Import",
    description: "Import supplier and master data templates through the existing bulk import workflow.",
    actions: {
      importHref: "/imports",
      templateHref: "/imports",
    },
  },
  {
    id: "opening-stock-import",
    snapshotKey: "opening-stock-import",
    name: "Opening Stock Import",
    description: "Load opening quantities and valuations using the current opening stock import workflow.",
    actions: {
      importHref: "/opening-stock-import",
      templateHref: "/opening-stock-import",
      historyHref: "/opening-stock-import",
    },
  },
  {
    id: "customer-price-list-import",
    snapshotKey: "customer-price-list-import",
    name: "Customer Price List Import",
    description: "Upload customer price lists through the existing validated price list import workflow.",
    actions: {
      importHref: "/price-list-import",
      templateHref: "/price-list-import",
      historyHref: "/price-list-import",
    },
  },
  {
    id: "bom-import",
    snapshotKey: "bom-import",
    name: "BOM Import",
    description: "Import BOM structures and validate material dependencies with the current import engine.",
    actions: {
      importHref: "/import-centre/workspace",
      templateHref: "/api/import-centre/template?module=boms",
      historyHref: "/import-centre/workspace",
    },
  },
];

const defaultSnapshot: ImportOperationalSnapshot = {
  lastImportDate: null,
  lastStatus: "Never Run",
  recordsImported: 0,
  importedBy: "System",
  history: [],
  historyAvailable: false,
};

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatRecords(value: number) {
  return new Intl.NumberFormat("en-GB").format(Math.max(0, Number(value || 0)));
}

function statusBadge(status: ImportOperationalStatus) {
  if (status === "Success") {
    return <StatusPill tone="emerald">Success</StatusPill>;
  }
  if (status === "Running") {
    return <StatusPill tone="blue">Running</StatusPill>;
  }
  if (status === "Completed with Warnings") {
    return <StatusPill tone="amber">Completed with Warnings</StatusPill>;
  }
  if (status === "Failed") {
    return <StatusPill tone="red">Failed</StatusPill>;
  }
  return <StatusPill tone="slate">Never Run</StatusPill>;
}

function ActionButton({
  label,
  href,
  disabled,
  icon,
}: {
  label: string;
  href?: string;
  disabled?: boolean;
  icon: React.ReactNode;
}) {
  if (disabled || !href) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-500"
      >
        {icon}
        Not Available
      </button>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]"
    >
      {icon}
      {label}
    </Link>
  );
}

export default function EnterpriseImportCentreClient({
  operationsData,
}: {
  operationsData: ImportOperationsCentreData;
}) {
  const { can } = useWorkspacePermissions();
  const canImport = can("admin.imports");
  const snapshots = operationsData?.snapshots || {};
  const summary = operationsData?.summary || {
    totalImportTypes: importCards.length,
    successfulImportsToday: 0,
    failedImportsToday: 0,
    importsRunning: 0,
    lastImportExecuted: null,
  };

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Master Data",
        title: "Import Operations Centre",
        subtitle: "Single enterprise entry point for import execution, runtime visibility, and operational history.",
        outcomes: [
          "Centralized import access under Master Data",
          "Operational visibility for every import card",
          "Future imports can be onboarded by registering one card",
        ],
      }}
    >
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Total Import Types</div>
          <div className="mt-1 text-2xl font-black text-[#0F172A]">{summary.totalImportTypes}</div>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Successful Today</div>
          <div className="mt-1 text-2xl font-black text-[#0F172A]">{summary.successfulImportsToday}</div>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Failed Today</div>
          <div className="mt-1 text-2xl font-black text-[#0F172A]">{summary.failedImportsToday}</div>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Imports Running</div>
          <div className="mt-1 text-2xl font-black text-[#0F172A]">{summary.importsRunning}</div>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Last Import Executed</div>
          <div className="mt-1 text-sm font-black text-[#0F172A]">{formatDate(summary.lastImportExecuted)}</div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {importCards.map((card) => {
          const snapshot = snapshots[card.snapshotKey] || defaultSnapshot;
          const importEnabled = canImport && Boolean(card.actions.importHref);

          return (
          <article key={card.id} className="rounded-[2rem] border border-[#E2E8F0] bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#0F172A]">{card.name}</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-[#64748B]">{card.description}</p>
              </div>
              <Upload size={20} className="text-[#7E22CE]" />
            </div>

            <dl className="mt-5 grid gap-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm">
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <dt className="font-bold text-[#64748B]">Last Run</dt>
                <dd className="font-black text-[#0F172A]">{formatDate(snapshot.lastImportDate)}</dd>
              </div>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <dt className="font-bold text-[#64748B]">Status</dt>
                <dd>{statusBadge(snapshot.lastStatus)}</dd>
              </div>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <dt className="font-bold text-[#64748B]">Records Imported</dt>
                <dd className="font-black text-[#0F172A]">{formatRecords(snapshot.recordsImported)}</dd>
              </div>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <dt className="font-bold text-[#64748B]">Imported By</dt>
                <dd className="font-black text-[#0F172A]">{snapshot.importedBy || "System"}</dd>
              </div>
            </dl>

            <div className="mt-4 grid gap-2">
              {importEnabled ? (
                <Link
                  href={card.actions.importHref as string}
                  className="inline-flex items-center justify-center gap-2 rounded-xl vyron-grad-deep px-4 py-2.5 text-sm font-black text-[#DDD6FE]"
                >
                  Import
                  <ArrowRight size={14} />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-black text-slate-500"
                >
                  Not Available
                </button>
              )}

              <ActionButton
                label="View History"
                href={card.actions.historyHref}
                disabled={!snapshot.historyAvailable}
                icon={<FileClock size={14} />}
              />

              <ActionButton
                label="Download Template"
                href={card.actions.templateHref}
                disabled={!card.actions.templateHref}
                icon={<Download size={14} />}
              />
            </div>

            <div className="mt-4 rounded-2xl border border-[#E2E8F0] bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Import History</div>
              {snapshot.historyAvailable && snapshot.history.length ? (
                <div className="mt-3 space-y-2">
                  {snapshot.history.slice(0, 3).map((entry) => (
                    <div key={`${entry.date}-${entry.user}-${entry.records}`} className="rounded-xl bg-[#F8FAFC] p-3 text-xs">
                      <div className="font-black text-[#0F172A]">{formatDate(entry.date)}</div>
                      <div className="mt-1 text-[#64748B]">User: {entry.user}</div>
                      <div className="text-[#64748B]">Records: {formatRecords(entry.records)}</div>
                      <div className="mt-1">{statusBadge(entry.status)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm font-semibold text-[#64748B]">No import history available.</p>
              )}
            </div>
          </article>
          );
        })}
      </section>
    </VyronPremiumPageShell>
  );
}
