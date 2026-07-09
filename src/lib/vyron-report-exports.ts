export type ReportSummaryMetric = {
  label: string;
  value: string;
};

export type ReportColumn = {
  key: string;
  label: string;
};

export type ReportFilter = {
  key: string;
  label: string;
  value: string;
};

export type ReportBranding = {
  companyName: string;
  tradingName: string | null;
};

export type TenantReportExportPayload = {
  reportKey: string;
  title: string;
  subtitle: string;
  fileName: string;
  generatedAt: string;
  branding: ReportBranding;
  filters: ReportFilter[];
  summary: ReportSummaryMetric[];
  columns: ReportColumn[];
  rows: string[][];
};

function sanitizeFilePart(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildReportFileName(reportKey: string, companyName: string, generatedAtIso: string) {
  const date = String(generatedAtIso || new Date().toISOString()).slice(0, 10);
  const key = sanitizeFilePart(reportKey || "report");
  const company = sanitizeFilePart(companyName || "company");
  return `vyron-${company}-${key}-${date}.pdf`;
}

export function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatQty(value: number, digits = 2) {
  return Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
