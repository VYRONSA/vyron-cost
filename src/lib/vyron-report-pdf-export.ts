import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { TenantReportExportPayload } from "@/lib/vyron-report-exports";

function drawHeader(doc: jsPDF, payload: TenantReportExportPayload) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 38, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("VYRON COST", 14, 14);
  doc.setFontSize(12);
  doc.text(payload.title, 14, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Company: ${payload.branding.tradingName || payload.branding.companyName}`, 14, 30);
  doc.text(`Generated: ${new Date(payload.generatedAt).toLocaleString()}`, 110, 30);
}

export function exportTenantReportPdf(payload: TenantReportExportPayload) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  drawHeader(doc, payload);

  let y = 48;

  if (payload.subtitle) {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(payload.subtitle, 14, y);
    y += 7;
  }

  if (payload.filters.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Filters", 14, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    for (const filter of payload.filters) {
      doc.text(`${filter.label}: ${filter.value}`, 16, y);
      y += 4.5;
    }
    y += 2;
  }

  if (payload.summary.length) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Metric", "Value"]],
      body: payload.summary.map((metric) => [metric.label, metric.value]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
      margin: { left: 14, right: 14 },
    });

    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 7;
  }

  autoTable(doc, {
    startY: y,
    theme: "striped",
    head: [payload.columns.map((column) => column.label)],
    body: payload.rows,
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [67, 56, 202] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setTextColor(100);
      doc.setFontSize(8);
      doc.text(`Page ${data.pageNumber}`, 190, pageHeight - 8, { align: "right" });
    },
  });

  doc.save(payload.fileName);
}

export function exportTenantReportCsv(payload: TenantReportExportPayload) {
  const lines: string[] = [];
  lines.push(`\"${payload.title.replace(/\"/g, '\"\"')}\"`);
  lines.push(`\"Generated\",\"${new Date(payload.generatedAt).toISOString()}\"
\"Company\",\"${(payload.branding.tradingName || payload.branding.companyName).replace(/\"/g, '\"\"')}\"`);

  if (payload.filters.length) {
    lines.push("");
    lines.push("\"Filters\"");
    for (const filter of payload.filters) {
      lines.push(`\"${filter.label.replace(/\"/g, '\"\"')}\",\"${filter.value.replace(/\"/g, '\"\"')}\"
`);
    }
  }

  if (payload.summary.length) {
    lines.push("");
    lines.push("\"Summary\"");
    lines.push("\"Metric\",\"Value\"");
    for (const metric of payload.summary) {
      lines.push(`\"${metric.label.replace(/\"/g, '\"\"')}\",\"${metric.value.replace(/\"/g, '\"\"')}\"`);
    }
  }

  lines.push("");
  lines.push(payload.columns.map((column) => `\"${column.label.replace(/\"/g, '\"\"')}\"`).join(","));
  for (const row of payload.rows) {
    lines.push(row.map((cell) => `\"${String(cell || "").replace(/\"/g, '\"\"')}\"`).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.fileName.replace(/\.pdf$/i, ".csv");
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportTenantReportExcel(payload: TenantReportExportPayload) {
  const workbook = XLSX.utils.book_new();

  const summaryRows: Array<Record<string, string>> = [
    { Metric: "Report", Value: payload.title },
    { Metric: "Generated", Value: new Date(payload.generatedAt).toISOString() },
    { Metric: "Company", Value: payload.branding.tradingName || payload.branding.companyName },
    ...payload.summary.map((row) => ({ Metric: row.label, Value: row.value })),
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  if (payload.filters.length) {
    const filterRows = payload.filters.map((row) => ({ Filter: row.label, Value: row.value }));
    const filtersSheet = XLSX.utils.json_to_sheet(filterRows);
    XLSX.utils.book_append_sheet(workbook, filtersSheet, "Filters");
  }

  const rowObjects = payload.rows.map((row) => {
    const record: Record<string, string> = {};
    payload.columns.forEach((column, index) => {
      record[column.label] = String(row[index] || "");
    });
    return record;
  });
  const dataSheet = XLSX.utils.json_to_sheet(rowObjects);
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Data");

  const fileName = payload.fileName.replace(/\.pdf$/i, ".xlsx");
  XLSX.writeFile(workbook, fileName);
}
