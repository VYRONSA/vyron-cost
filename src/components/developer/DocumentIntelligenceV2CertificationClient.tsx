"use client";

import { useState } from "react";

type InvoiceReport = {
  fileName: string;
  invoiceNumber: string | null;
  pdfValidation: "PASS" | "FAIL";
  documentClassification: {
    detectedType: string | null;
    confidence: number;
  };
  checks: {
    supplierExtraction: "PASS" | "FAIL";
    invoiceNumber: "PASS" | "FAIL";
    invoiceDate: "PASS" | "FAIL";
    purchaseOrder: "PASS" | "FAIL";
    vat: "PASS" | "FAIL";
    total: "PASS" | "FAIL";
    currency: "PASS" | "FAIL";
    jsonValid: "PASS" | "FAIL";
    noNormalizationChangesRequired: "PASS" | "FAIL";
  };
  lineItemCount: {
    expected: number;
    detected: number;
  };
  lineItems: Array<{
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    vat: string | null;
    lineTotal: string | null;
  }>;
  scores: {
    fieldAccuracyPercent: number;
    lineAccuracyPercent: number;
    financialAccuracyPercent: number;
    overallAccuracyPercent: number;
  };
  status: "PASS" | "FAIL";
  reason: string;
  debug: {
    modelUsed: string;
    executionTimeMs: number;
    rawOpenAiJson: Record<string, unknown>;
    validatedJson: Record<string, unknown>;
    normalizedJson: Record<string, unknown>;
  };
};

type FailPayload = {
  ok: false;
  failure: {
    invoiceNumber: string;
    failedFields: string[];
    rawOpenAiJson: Record<string, unknown>;
    validatedJson: Record<string, unknown>;
    normalizedJson: Record<string, unknown>;
    rootCause: string;
    smallestProductionGradeFix: string;
  };
};

type SuccessPayload = {
  ok: true;
  result: {
    reports: InvoiceReport[];
    consecutivePassCount: number;
    certified: boolean;
  };
};

type ApiPayload =
  | ({ ok: false; error?: string } & Partial<FailPayload>)
  | ({ ok: true } & Partial<SuccessPayload>);

function statusColor(status: "PASS" | "FAIL") {
  return status === "PASS" ? "text-violet-700" : "text-red-700";
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 border-b border-slate-200 py-2 text-sm">
      <div className="font-semibold text-slate-700">{label}</div>
      <div className="text-slate-900 break-words">{value || "-"}</div>
    </div>
  );
}

export default function DocumentIntelligenceV2CertificationClient() {
  const [files, setFiles] = useState<File[]>([]);
  const [model, setModel] = useState("");
  const [expectedLineCountsJson, setExpectedLineCountsJson] = useState("{}");
  const [confirmedRealInvoices, setConfirmedRealInvoices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<FailPayload["failure"] | null>(null);
  const [success, setSuccess] = useState<SuccessPayload["result"] | null>(null);

  async function onRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFailure(null);
    setSuccess(null);

    if (!files.length) {
      setError("Upload one or more real supplier invoice PDFs.");
      return;
    }

    if (!confirmedRealInvoices) {
      setError("You must confirm all uploads are real supplier invoices.");
      return;
    }

    const form = new FormData();
    for (const file of files) {
      form.append("files", file);
    }
    form.append("realInvoicesDeclaration", "I_CONFIRM_REAL_SUPPLIER_INVOICES");
    form.append("expectedLineItemCounts", expectedLineCountsJson || "{}");
    if (model.trim()) {
      form.append("model", model.trim());
    }

    setBusy(true);
    try {
      const response = await fetch("/api/developer/document-intelligence-v2", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as ApiPayload;

      if (!response.ok) {
        setError(("error" in payload && typeof payload.error === "string" && payload.error) || "Certification run failed.");
        return;
      }

      if (payload.ok && payload.result) {
        setSuccess(payload.result);
        return;
      }

      if (!payload.ok && payload.failure) {
        setFailure(payload.failure);
        return;
      }

      setError(("error" in payload && typeof payload.error === "string" && payload.error) || "Certification run failed.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Certification run failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Supplier Invoice Document Intelligence V2 Production Certification</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload real supplier invoices, run V2 sequentially, stop on first failure, and certify only after 10 consecutive PASS results.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onRun}>
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Model (optional)"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Expected Line Item Count Map (JSON)</label>
            <textarea
              value={expectedLineCountsJson}
              onChange={(event) => setExpectedLineCountsJson(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
              placeholder='{"invoice-001.pdf": 12, "invoice-002.pdf": 7}'
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={confirmedRealInvoices}
              onChange={(event) => setConfirmedRealInvoices(event.target.checked)}
              className="h-4 w-4"
            />
            I confirm all uploaded documents are real supplier invoices (not synthetic, test, or generated).
          </label>

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Running Certification..." : "Run Production Certification"}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
      </div>

      {failure ? (
        <>
          <div className="rounded-2xl border border-red-300 bg-red-50 p-6 shadow-sm">
            <h2 className="text-xl font-black text-red-800">Certification Stopped: FAIL</h2>
            <div className="mt-4 grid gap-2">
              <FieldRow label="Invoice Number" value={failure.invoiceNumber} />
              <FieldRow label="Field(s) that failed" value={failure.failedFields.join(" | ")} />
              <FieldRow label="Root Cause" value={failure.rootCause} />
              <FieldRow label="Smallest Production-Grade Fix" value={failure.smallestProductionGradeFix} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Raw OpenAI JSON</h2>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(failure.rawOpenAiJson, null, 2)}
            </pre>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Validated JSON</h2>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(failure.validatedJson, null, 2)}
            </pre>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Normalized JSON</h2>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(failure.normalizedJson, null, 2)}
            </pre>
          </div>
        </>
      ) : null}

      {success ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Certification Result</h2>
            <div className="mt-4 grid gap-2">
              <FieldRow label="Consecutive PASS Invoices" value={String(success.consecutivePassCount)} />
              <FieldRow label="Certification Status" value={success.certified ? "CERTIFIED" : "NOT CERTIFIED (need 10 consecutive PASS)"} />
            </div>
          </div>

          {success.reports.map((report, index) => (
            <div key={`${report.fileName}-${index}`} className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black text-slate-900">Invoice {index + 1}: {report.fileName}</h3>
              <p className={`mt-2 text-sm font-bold ${statusColor(report.status)}`}>{report.status} - {report.reason}</p>

              <div className="mt-4 grid gap-2">
                <FieldRow label="PDF Validation" value={report.pdfValidation} />
                <FieldRow label="Document Classification" value={`${report.documentClassification.detectedType || "-"} (${report.documentClassification.confidence}%)`} />
                <FieldRow label="Supplier Extraction" value={report.checks.supplierExtraction} />
                <FieldRow label="Invoice Number" value={report.checks.invoiceNumber} />
                <FieldRow label="Invoice Date" value={report.checks.invoiceDate} />
                <FieldRow label="Purchase Order" value={report.checks.purchaseOrder} />
                <FieldRow label="VAT" value={report.checks.vat} />
                <FieldRow label="Total" value={report.checks.total} />
                <FieldRow label="Currency" value={report.checks.currency} />
                <FieldRow label="Line Item Count" value={`Expected ${report.lineItemCount.expected} / Detected ${report.lineItemCount.detected}`} />
                <FieldRow label="Field Accuracy %" value={`${report.scores.fieldAccuracyPercent}%`} />
                <FieldRow label="Line Accuracy %" value={`${report.scores.lineAccuracyPercent}%`} />
                <FieldRow label="Financial Accuracy %" value={`${report.scores.financialAccuracyPercent}%`} />
                <FieldRow label="Overall Accuracy %" value={`${report.scores.overallAccuracyPercent}%`} />
                <FieldRow label="Execution Time" value={`${report.debug.executionTimeMs} ms`} />
                <FieldRow label="Model Used" value={report.debug.modelUsed} />
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-left text-slate-700">
                      <th className="border border-slate-300 px-3 py-2">Description</th>
                      <th className="border border-slate-300 px-3 py-2">Quantity</th>
                      <th className="border border-slate-300 px-3 py-2">Unit Price</th>
                      <th className="border border-slate-300 px-3 py-2">VAT</th>
                      <th className="border border-slate-300 px-3 py-2">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lineItems.length ? (
                      report.lineItems.map((line, lineIndex) => (
                        <tr key={`${report.fileName}-line-${lineIndex}`}>
                          <td className="border border-slate-300 px-3 py-2">{line.description || "-"}</td>
                          <td className="border border-slate-300 px-3 py-2">{line.quantity || "-"}</td>
                          <td className="border border-slate-300 px-3 py-2">{line.unitPrice || "-"}</td>
                          <td className="border border-slate-300 px-3 py-2">{line.vat || "-"}</td>
                          <td className="border border-slate-300 px-3 py-2">{line.lineTotal || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="border border-slate-300 px-3 py-2 text-slate-500" colSpan={5}>
                          No line items extracted.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
