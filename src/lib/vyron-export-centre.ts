import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportFormat = "xlsx" | "csv" | "pdf";

export type ExportBranding = {
  companyName: string;
  tradingName: string | null;
  logoUrl: string | null;
  logoDataUrl?: string | null;
};

export type ExportColumnType = "text" | "number" | "currency" | "percent" | "date";

export type ExportColumn = {
  key: string;
  label: string;
  type: ExportColumnType;
};

export type ExportFilter = {
  key: string;
  label: string;
  value: string;
};

export type ExportRow = Record<string, string | number | null>;

export type ExportAuditInput = {
  userId: string | null;
  userName: string;
  workspaceId: string | null;
  companyId: string;
  exportType: "CSV" | "Excel" | "PDF";
  scope: string;
  filters: Record<string, unknown>;
  rowCount: number;
  durationMs: number;
  clientIp: string | null;
  userAgent: string | null;
};

export type ExportPayload = {
  title: string;
  generatedAtIso: string;
  branding: ExportBranding;
  userName: string;
  filters: ExportFilter[];
  columns: ExportColumn[];
  rows: ExportRow[];
};

export const EXPORT_CURRENCY_FMT = '"R" #,##0.00;[Red]-"R" #,##0.00';

function displayCompanyName(branding: ExportBranding) {
  return branding.tradingName || branding.companyName || "VYRON COST";
}

function valueToCsvCell(value: string | number | null, type: ExportColumnType) {
  if (value == null) return "";
  if (type === "number" || type === "currency" || type === "percent") {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : "";
  }
  if (type === "date") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }
  return String(value);
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCsvBuffer(payload: ExportPayload) {
  const lines: string[] = [];
  lines.push(escapeCsv(payload.title));
  lines.push(`${escapeCsv("Company")},${escapeCsv(displayCompanyName(payload.branding))}`);
  lines.push(`${escapeCsv("Exported At")},${escapeCsv(payload.generatedAtIso)}`);
  lines.push(`${escapeCsv("Exported By")},${escapeCsv(payload.userName)}`);
  if (payload.filters.length) {
    lines.push("");
    lines.push(escapeCsv("Filters"));
    for (const filter of payload.filters) {
      lines.push(`${escapeCsv(filter.label)},${escapeCsv(filter.value)}`);
    }
  }
  lines.push("");
  lines.push(payload.columns.map((column) => escapeCsv(column.label)).join(","));
  for (const row of payload.rows) {
    lines.push(
      payload.columns
        .map((column) => valueToCsvCell((row[column.key] as string | number | null) ?? null, column.type))
        .map((cell) => escapeCsv(cell))
        .join(",")
    );
  }

  return Buffer.from(`\uFEFF${lines.join("\n")}`, "utf8");
}

function parseDateCell(value: string | number | null) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function autoSizeColumns(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    if (typeof column.eachCell !== "function") return;
    let max = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const raw = cell.value;
      let text = "";
      if (raw == null) {
        text = "";
      } else if (raw instanceof Date) {
        text = raw.toISOString().slice(0, 10);
      } else if (raw && typeof raw === "object" && "text" in raw) {
        text = String((raw as { text?: string }).text || "");
      } else {
        text = String(raw);
      }
      max = Math.max(max, text.length + 2);
    });
    column.width = Math.min(64, max);
  });
}

function logoExtensionFromDataUrl(dataUrl: string) {
  const lower = dataUrl.toLowerCase();
  if (lower.startsWith("data:image/png")) return "png" as const;
  if (lower.startsWith("data:image/jpeg")) return "jpeg" as const;
  if (lower.startsWith("data:image/jpg")) return "jpeg" as const;
  return null;
}

export async function buildExcelBuffer(payload: ExportPayload) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Export", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const logoDataUrl = payload.branding.logoDataUrl || null;
  const logoExtension = logoDataUrl ? logoExtensionFromDataUrl(logoDataUrl) : null;
  if (logoDataUrl && logoExtension) {
    const imageId = workbook.addImage({
      base64: logoDataUrl,
      extension: logoExtension,
    });
    worksheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 140, height: 48 },
    });
  }

  worksheet.addRow([displayCompanyName(payload.branding)]);
  worksheet.addRow([payload.title]);
  worksheet.addRow([`Exported At: ${payload.generatedAtIso}`]);
  worksheet.addRow([`Exported By: ${payload.userName}`]);
  worksheet.addRow([`Active Filters: ${payload.filters.map((f) => `${f.label}=${f.value}`).join("; ") || "None"}`]);

  const headerRow = worksheet.addRow(payload.columns.map((column) => column.label));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  for (const row of payload.rows) {
    const values = payload.columns.map((column) => {
      const value = (row[column.key] as string | number | null) ?? null;
      if (column.type === "date") return parseDateCell(value);
      return value;
    });
    worksheet.addRow(values);
  }

  worksheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6, column: payload.columns.length || 1 },
  };

  payload.columns.forEach((column, index) => {
    const excelCol = worksheet.getColumn(index + 1);
    if (column.type === "currency") excelCol.numFmt = EXPORT_CURRENCY_FMT;
    if (column.type === "percent") excelCol.numFmt = "0.00%";
    if (column.type === "date") excelCol.numFmt = "yyyy-mm-dd";
  });

  autoSizeColumns(worksheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function formatForPdf(value: string | number | null, type: ExportColumnType) {
  if (value == null) return "";
  if (type === "currency") {
    return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (type === "percent") {
    const n = Number(value || 0);
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(2)}%`;
  }
  if (type === "number") {
    return Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  return String(value);
}

export function buildPdfBuffer(payload: ExportPayload) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerStartX = payload.branding.logoDataUrl ? 32 : 10;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  if (payload.branding.logoDataUrl) {
    try {
      doc.addImage(payload.branding.logoDataUrl, "PNG", 10, 4, 18, 18);
    } catch {
      // Non-blocking: render company text fallback when image cannot be embedded.
    }
  }
  doc.text(displayCompanyName(payload.branding), headerStartX, 10);
  doc.setFontSize(12);
  doc.text(payload.title, headerStartX, 18);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Exported At: ${payload.generatedAtIso}`, 10, 34);
  doc.text(`Exported By: ${payload.userName}`, 95, 34);
  doc.text(`Filters: ${payload.filters.map((f) => `${f.label}=${f.value}`).join("; ") || "None"}`, 10, 40);

  autoTable(doc, {
    startY: 46,
    head: [payload.columns.map((column) => column.label)],
    body: payload.rows.map((row) => payload.columns.map((column) => formatForPdf((row[column.key] as string | number | null) ?? null, column.type))),
    theme: "striped",
    headStyles: { fillColor: [67, 56, 202] },
    styles: { fontSize: 7.5, cellPadding: 2 },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(`Page ${data.pageNumber}`, pageWidth - 10, pageHeight - 6, { align: "right" });
    },
  });

  const totals = payload.columns
    .filter((column) => column.type === "currency" || column.type === "number")
    .map((column) => {
      const sum = payload.rows.reduce((acc, row) => acc + Number((row[column.key] as number | string | null) || 0), 0);
      return `${column.label}: ${sum.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    });

  if (totals.length) {
    doc.setFontSize(8);
    doc.setTextColor(31, 41, 55);
    doc.text(`Totals: ${totals.join(" | ")}`, 10, pageHeight - 6);
  }

  return Buffer.from(doc.output("arraybuffer"));
}
