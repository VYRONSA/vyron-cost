"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { useAdminPermissions, useManufacturingPermissions } from "@/hooks/useModulePermissions";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";

type BatchStatus = "Draft" | "In Production" | "Completed" | "Reversed" | "Cancelled";

type ManufacturingBatch = {
  id: string;
  batchNumber: string;
  product: string;
  batchDate: string;
  plannedQty: number;
  actualQty: number;
  expectedCost: number;
  actualCost: number;
  wastagePct: number;
  yieldPct: number;
  status: BatchStatus;
  supervisorNote?: string;
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
  editedAt?: string;
  editedBy?: string;
};

type BatchLine = {
  id: string;
  product: string;
  plannedQty: number;
  actualQty: number;
  actualCost: number;
  wastagePct: number;
};

type BatchFormState = {
  product: string;
  plannedQty: number;
  actualQty: number;
  actualCost: number;
  wastagePct: number;
};

const STORAGE_KEY = "vyron-cost-manufacturing-batches-v4";
const SUPERVISOR_NAME = "Supervisor";

const products = [
  { name: "Beef Pie", expectedUnitCost: 13.5 },
  { name: "Chicken Pie", expectedUnitCost: 12.7 },
  { name: "Mutton Pie", expectedUnitCost: 16.0 },
  { name: "Cheese Pie", expectedUnitCost: 11.9 },
  { name: "Pepper Steak Pie", expectedUnitCost: 15.4 },
];

const defaultBatches: ManufacturingBatch[] = [
  {
    id: "mb-0001",
    batchNumber: "MB-0001",
    product: "Beef Pie",
    batchDate: "2026-06-01",
    plannedQty: 1200,
    actualQty: 1200,
    expectedCost: 16200,
    actualCost: 17040,
    wastagePct: 2.8,
    yieldPct: 98.4,
    status: "Completed",
    supervisorNote: "Completed from demo production run.",
  },
  {
    id: "mb-0002",
    batchNumber: "MB-0002",
    product: "Chicken Pie",
    batchDate: "2026-06-02",
    plannedQty: 900,
    actualQty: 880,
    expectedCost: 11400,
    actualCost: 11528,
    wastagePct: 3.4,
    yieldPct: 97.8,
    status: "Completed",
    supervisorNote: "Minor yield loss due to pastry trimming.",
  },
  {
    id: "mb-0003",
    batchNumber: "MB-0003",
    product: "Mutton Pie",
    batchDate: "2026-06-03",
    plannedQty: 600,
    actualQty: 590,
    expectedCost: 9600,
    actualCost: 9941.5,
    wastagePct: 4.2,
    yieldPct: 96.9,
    status: "Completed",
    supervisorNote: "Wastage above preferred 3% threshold.",
  },
];

const emptyForm: BatchFormState = {
  product: "Beef Pie",
  plannedQty: 500,
  actualQty: 500,
  actualCost: 6750,
  wastagePct: 2.5,
};

function createDefaultLine(product = "Beef Pie"): BatchLine {
  const selected = products.find((item) => item.name === product) ?? products[0];
  return {
    id: crypto.randomUUID(),
    product: selected.name,
    plannedQty: 500,
    actualQty: 500,
    actualCost: Number((500 * selected.expectedUnitCost).toFixed(2)),
    wastagePct: 2.5,
  };
}

function batchStorageKey(workspaceId: string | null) {
  return workspaceId ? `${STORAGE_KEY}:${workspaceId}` : STORAGE_KEY;
}

export default function ManufacturingIntelligenceClient() {
  const { canCreate, canStart, canComplete, canReverse } = useManufacturingPermissions();
  const { canCompany, canUsers } = useAdminPermissions();
  const canManageWorkspace = canCompany || canUsers;
  const canUseSupervisorTools =
    canCreate || canStart || canComplete || canReverse || canManageWorkspace;
  const [demoMode, setDemoMode] = useState(false);
  const [batches, setBatches] = useState<ManufacturingBatch[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [batchLines, setBatchLines] = useState<BatchLine[]>([]);
  const [form, setForm] = useState<BatchFormState>(emptyForm);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [supervisorReason, setSupervisorReason] = useState("Supervisor correction before final reporting");

  useEffect(() => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);
    const key = batchStorageKey(client?.id ?? null);
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ManufacturingBatch[];
        if (Array.isArray(parsed)) {
          setBatches(parsed);
          return;
        }
      } catch {
        // fall through
      }
    }
    if (demo) {
      setBatches(defaultBatches);
      setFormOpen(true);
      setBatchLines([createDefaultLine("Beef Pie"), createDefaultLine("Chicken Pie")]);
    } else {
      setBatches([]);
      setFormOpen(false);
      setBatchLines([]);
    }
  }, []);

  useEffect(() => {
    const client = readActiveClient();
    window.localStorage.setItem(batchStorageKey(client?.id ?? null), JSON.stringify(batches));
  }, [batches]);

  const summary = useMemo(() => {
    const active = batches.filter((batch) => batch.status !== "Cancelled" && batch.status !== "Reversed");
    const completed = active.filter((batch) => batch.status === "Completed");
    const openBatches = batches.filter((batch) => batch.status === "Draft" || batch.status === "In Production");
    const produced = completed.reduce((sum, batch) => sum + batch.actualQty, 0);
    const cost = completed.reduce((sum, batch) => sum + batch.actualCost, 0);
    const expected = completed.reduce((sum, batch) => sum + batch.expectedCost, 0);
    const variance = cost - expected;
    const reversed = batches.filter((batch) => batch.status === "Reversed").length;

    return { produced, cost, variance, openCount: openBatches.length, reversed };
  }, [batches]);

  function expectedCost(product: string, qty: number) {
    const selected = products.find((item) => item.name === product) ?? products[0];
    return Number((qty * selected.expectedUnitCost).toFixed(2));
  }

  function buildBatchFromLine(line: BatchLine, indexOffset = 0): ManufacturingBatch {
    const nextNumber = `MB-${String(batches.length + indexOffset + 1).padStart(4, "0")}`;
    const expected = expectedCost(line.product, line.plannedQty);
    const yieldPct = line.plannedQty > 0 ? Number(((line.actualQty / line.plannedQty) * 100).toFixed(1)) : 0;

    return {
      id: crypto.randomUUID(),
      batchNumber: nextNumber,
      product: line.product,
      batchDate: new Date().toISOString().slice(0, 10),
      plannedQty: line.plannedQty,
      actualQty: line.actualQty,
      expectedCost: expected,
      actualCost: line.actualCost,
      wastagePct: line.wastagePct,
      yieldPct,
      status: "Draft",
      supervisorNote: "Created in multi-line batch queue. Stock will only move when completed.",
    };
  }

  function addLine() {
    const nextProduct = products[Math.min(batchLines.length, products.length - 1)]?.name ?? "Beef Pie";
    setBatchLines((current) => [...current, createDefaultLine(nextProduct)]);
  }

  function duplicateLine(line: BatchLine) {
    setBatchLines((current) => [...current, { ...line, id: crypto.randomUUID() }]);
  }

  function removeLine(id: string) {
    setBatchLines((current) => (current.length <= 1 ? current : current.filter((line) => line.id !== id)));
  }

  function updateLine(id: string, patch: Partial<BatchLine>) {
    setBatchLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };

        if (patch.product && patch.actualCost === undefined) next.actualCost = expectedCost(patch.product, next.actualQty);
        if (patch.plannedQty !== undefined && patch.actualCost === undefined) next.actualCost = expectedCost(next.product, patch.plannedQty);

        return next;
      })
    );
  }

  function saveBatchQueue() {
    if (!canCreate) return;
    const validLines = batchLines.filter((line) => line.product && line.plannedQty > 0 && line.actualQty >= 0);
    if (!validLines.length) {
      alert("Add at least one valid manufacturing line.");
      return;
    }

    const created = validLines.map((line, index) => buildBatchFromLine(line, index));
    setBatches((current) => [...created, ...current]);
    setBatchLines([createDefaultLine("Beef Pie"), createDefaultLine("Chicken Pie")]);
    setFormOpen(false);
  }

  function startEdit(batch: ManufacturingBatch) {
    setEditingBatchId(batch.id);
    setForm({
      product: batch.product,
      plannedQty: batch.plannedQty,
      actualQty: batch.actualQty,
      actualCost: batch.actualCost,
      wastagePct: batch.wastagePct,
    });
    setFormOpen(true);
    setSupervisorReason("Supervisor correction before final reporting");
  }

  function saveEdit() {
    if (!canComplete) return;
    if (!editingBatchId) return;

    setBatches((current) =>
      current.map((batch) => {
        if (batch.id !== editingBatchId) return batch;

        const expected = expectedCost(form.product, form.plannedQty);
        const yieldPct = form.plannedQty > 0 ? Number(((form.actualQty / form.plannedQty) * 100).toFixed(1)) : 0;

        return {
          ...batch,
          product: form.product,
          plannedQty: form.plannedQty,
          actualQty: form.actualQty,
          expectedCost: expected,
          actualCost: form.actualCost,
          wastagePct: form.wastagePct,
          yieldPct,
          editedAt: new Date().toISOString(),
          editedBy: SUPERVISOR_NAME,
          supervisorNote: supervisorReason || "Batch edited by supervisor",
        };
      })
    );

    setEditingBatchId(null);
    setForm(emptyForm);
    setFormOpen(false);
  }

  function updateStatus(id: string, status: BatchStatus) {
    if (status === "In Production" && !canStart) return;
    if (status === "Completed" && !canComplete) return;
    if (status === "Cancelled" && !canCreate) return;
    setBatches((current) =>
      current.map((batch) =>
        batch.id === id
          ? {
              ...batch,
              status,
              supervisorNote:
                status === "Completed"
                  ? "Completed by supervisor. Raw materials consumed and finished goods increased."
                  : status === "In Production"
                    ? "Started by supervisor."
                    : status === "Cancelled"
                      ? "Cancelled before completion. No stock movement posted."
                      : batch.supervisorNote,
            }
          : batch
      )
    );
  }

  function reverseBatch(id: string) {
    if (!canReverse) return;
    if (!supervisorReason.trim()) {
      alert("Please enter a supervisor reversal reason first.");
      return;
    }

    const confirmed = window.confirm("Reverse this completed manufacturing batch? This should create correcting stock movements in the live stock engine.");
    if (!confirmed) return;

    setBatches((current) =>
      current.map((batch) =>
        batch.id === id
          ? {
              ...batch,
              status: "Reversed",
              reversedAt: new Date().toISOString(),
              reversedBy: SUPERVISOR_NAME,
              reversalReason: supervisorReason,
              supervisorNote: `Reversed by ${SUPERVISOR_NAME}: ${supervisorReason}`,
            }
          : batch
      )
    );
  }

  function completeAllOpen() {
    if (!canComplete) return;
    const confirmed = window.confirm("Complete all open Draft / In Production batches?");
    if (!confirmed) return;

    setBatches((current) =>
      current.map((batch) =>
        batch.status === "Draft" || batch.status === "In Production"
          ? {
              ...batch,
              status: "Completed",
              supervisorNote: "Bulk completed by supervisor. Stock impact should be posted for each batch.",
            }
          : batch
      )
    );
  }

  function resetDemo() {
    setBatches(defaultBatches);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultBatches));
    setEditingBatchId(null);
    setForm(emptyForm);
    setBatchLines([createDefaultLine("Beef Pie"), createDefaultLine("Chicken Pie")]);
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "manufacturing",
        badge: "Manufacturing Intelligence",
        title: "Manufacturing Intelligence Centre",
        subtitle: "Supervise production batches, variance controls, and reversal governance in one premium workspace.",
        outcomes: ["Control batch execution lifecycle", "Capture supervisor-grade correction notes", "Track cost and yield variance transparently"],
        formulas: ["Variance = Actual Cost - Expected Cost", "Yield % = Actual Qty / Planned Qty", "Expected Cost = Planned Qty x Product Unit Cost"],
        intelligenceItems: [
          { label: "Batch register", detail: `${batches.length} batches tracked in current workspace` },
          { label: "Open workload", detail: `${summary.openCount} draft or in-production batches` },
          { label: "Governance", detail: `${summary.reversed} batches currently marked reversed` },
        ],
      }}
    >
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
      {!demoMode && batches.length === 0 ? (
        <section className="rounded-[32px] border border-dashed border-violet-200 bg-violet-50/50 p-10 text-center">
          <h2 className="text-2xl font-black text-slate-950">No manufacturing batches yet</h2>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            Create recipes and BOMs first, then record production batches to build finished goods stock.
          </p>
        </section>
      ) : null}
      <div className="grid gap-4 md:grid-cols-5">
        <Metric title="Units Produced" value={formatNumber(summary.produced)} />
        <Metric title="Manufacturing Cost" value={formatCurrency(summary.cost)} />
        <Metric title="Cost Variance" value={formatCurrency(summary.variance)} />
        <Metric title="Open Batches" value={formatNumber(summary.openCount)} />
        <Metric title="Reversed Batches" value={formatNumber(summary.reversed)} />
      </div>

      <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.10)]">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <h2 className="text-xl font-black text-slate-950">Manufacturing Control Centre</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-600">
              Add multiple different production batch lines, save them as a queue, and supervise corrections safely.
            </p>
          </div>

          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            {canCreate ? (
              <button
                type="button"
                onClick={() => {
                  setEditingBatchId(null);
                  setForm(emptyForm);
                  setFormOpen((value) => !value);
                }}
                className="rounded-full bg-purple-700 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-purple-700/20"
              >
                {formOpen && !editingBatchId ? "Close Batch Queue" : "New Batch Queue"}
              </button>
            ) : null}
            {canComplete ? (
              <button
                type="button"
                onClick={completeAllOpen}
                className="rounded-full vyron-grad-surface border border-transparent px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-black/20"
              >
                Complete All Open
              </button>
            ) : null}
            {demoMode && canUseSupervisorTools ? (
              <button
                type="button"
                onClick={resetDemo}
                className="rounded-full border border-purple-200 bg-white px-5 py-2.5 text-sm font-black text-purple-800"
              >
                Reset Demo
              </button>
            ) : null}
            {canUseSupervisorTools ? (
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-800"
              >
                Print
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-purple-100 bg-purple-50/70 p-5">
          <label className="block space-y-2 text-sm font-black text-slate-700">
            Supervisor correction / reversal reason
            <input
              value={supervisorReason}
              onChange={(event) => setSupervisorReason(event.target.value)}
              className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none"
              placeholder="Example: Wrong actual quantity captured; approved correction by supervisor"
            />
          </label>
        </div>

        {formOpen ? (
          <div className="mt-5 rounded-[28px] border border-purple-100 bg-purple-50/70 p-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  {editingBatchId ? "Supervisor Edit Batch" : "Create Multi-Line Manufacturing Batch Queue"}
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  {editingBatchId
                    ? "Edit one incorrect batch with a supervisor correction note."
                    : "Add Beef Pie, Chicken Pie, Mutton Pie or any combination before saving the production queue."}
                </p>
              </div>

              {!editingBatchId && canCreate ? (
                <button
                  type="button"
                  onClick={addLine}
                  className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white"
                >
                  Add Another Line
                </button>
              ) : null}
            </div>

            {editingBatchId ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-5">
                <ProductSelect value={form.product} onChange={(value) => setForm((current) => ({ ...current, product: value }))} />
                <NumberField label="Planned Qty" value={form.plannedQty} onChange={(value) => setForm((current) => ({ ...current, plannedQty: value }))} />
                <NumberField label="Actual Qty" value={form.actualQty} onChange={(value) => setForm((current) => ({ ...current, actualQty: value }))} />
                <NumberField label="Actual Cost" value={form.actualCost} onChange={(value) => setForm((current) => ({ ...current, actualCost: value }))} />
                <NumberField label="Wastage %" value={form.wastagePct} onChange={(value) => setForm((current) => ({ ...current, wastagePct: value }))} />

                {canComplete ? (
                  <div className="lg:col-span-5">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white"
                    >
                      Save Supervisor Correction
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {batchLines.map((line, index) => (
                  <div key={line.id} className="rounded-3xl border border-white bg-white/85 p-4 shadow-sm">
                    <div className="grid gap-3 xl:grid-cols-[90px_1.2fr_1fr_1fr_1fr_1fr_190px] xl:items-end">
                      <div className="rounded-2xl bg-purple-100 px-3 py-3 text-center text-sm font-black text-purple-800">
                        Line {index + 1}
                      </div>
                      <ProductSelect value={line.product} onChange={(value) => updateLine(line.id, { product: value })} />
                      <NumberField label="Planned Qty" value={line.plannedQty} onChange={(value) => updateLine(line.id, { plannedQty: value })} />
                      <NumberField label="Actual Qty" value={line.actualQty} onChange={(value) => updateLine(line.id, { actualQty: value })} />
                      <NumberField label="Actual Cost" value={line.actualCost} onChange={(value) => updateLine(line.id, { actualCost: value })} />
                      <NumberField label="Wastage %" value={line.wastagePct} onChange={(value) => updateLine(line.id, { wastagePct: value })} />

                      {canCreate ? (
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <button
                            type="button"
                            onClick={() => duplicateLine(line)}
                            className="rounded-full bg-purple-100 px-3 py-2 text-xs font-black text-purple-800"
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="rounded-full bg-rose-100 px-3 py-2 text-xs font-black text-rose-800"
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {canCreate ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={addLine}
                      className="rounded-full border border-purple-200 bg-white px-5 py-2.5 text-sm font-black text-purple-800"
                    >
                      Add Another Line
                    </button>
                    <button
                      type="button"
                      onClick={saveBatchQueue}
                      className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white"
                    >
                      Save All Lines as Draft Batches
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-[90px_1.2fr_0.8fr_1fr_1fr_1fr_1fr_1fr_1.1fr_220px] gap-3 rounded-3xl bg-slate-950 px-4 py-3 text-xs font-black text-white">
            <div>Batch</div>
            <div>Product</div>
            <div>Date</div>
            <div className="text-right">Planned</div>
            <div className="text-right">Actual</div>
            <div className="text-right">Expected</div>
            <div className="text-right">Actual Cost</div>
            <div className="text-right">Variance</div>
            <div>Status</div>
            <div>Actions</div>
          </div>

          {batches.map((batch) => {
            const variance = batch.actualCost - batch.expectedCost;
            return (
              <div
                key={batch.id}
                className="grid grid-cols-[90px_1.2fr_0.8fr_1fr_1fr_1fr_1fr_1fr_1.1fr_220px] items-center gap-3 rounded-3xl border border-slate-100 bg-white px-4 py-4 text-sm shadow-sm"
              >
                <div className="font-black text-purple-700">{batch.batchNumber}</div>
                <div className="font-black text-slate-950">{batch.product}</div>
                <div className="font-semibold text-slate-600">{batch.batchDate}</div>
                <div className="text-right font-bold">{formatNumber(batch.plannedQty)}</div>
                <div className="text-right font-bold">{formatNumber(batch.actualQty)}</div>
                <div className="text-right font-bold">{formatCurrency(batch.expectedCost)}</div>
                <div className="text-right font-black">{formatCurrency(batch.actualCost)}</div>
                <div className={`text-right font-black ${variance > 0 ? "text-rose-700" : "text-[#7E22CE]"}`}>{formatCurrency(variance)}</div>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${statusClass(batch.status)}`}>
                    {batch.status}
                  </span>
                </div>
                <div className="flex flex-wrap justify-start gap-2">
                  {batch.status === "Draft" && canStart ? (
                    <ActionButton tone="indigo" onClick={() => updateStatus(batch.id, "In Production")}>Start</ActionButton>
                  ) : null}

                  {(batch.status === "In Production" || batch.status === "Draft") && canComplete ? (
                    <ActionButton tone="emerald" onClick={() => updateStatus(batch.id, "Completed")}>Complete</ActionButton>
                  ) : null}

                  {batch.status !== "Reversed" && batch.status !== "Cancelled" && canComplete ? (
                    <ActionButton tone="purple" onClick={() => startEdit(batch)}>Edit</ActionButton>
                  ) : null}

                  {batch.status === "Completed" && canReverse ? (
                    <ActionButton tone="rose" onClick={() => reverseBatch(batch.id)}>Reverse</ActionButton>
                  ) : null}

                  {batch.status !== "Completed" && batch.status !== "Reversed" && batch.status !== "Cancelled" && canCreate ? (
                    <ActionButton tone="slate" onClick={() => updateStatus(batch.id, "Cancelled")}>Cancel</ActionButton>
                  ) : null}
                </div>

                <div className="col-span-10 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
                  <span className="font-black text-slate-900">Supervisor note: </span>
                  {batch.supervisorNote || "—"}
                  {batch.reversalReason ? <span className="ml-2 font-black text-rose-700">Reason: {batch.reversalReason}</span> : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <InfoCard
            title="Multi-Line Batch Queue"
            text="Create several different products in one production session before saving. Each line becomes its own batch record for proper traceability."
          />
          <InfoCard
            title="Supervisor Edit"
            text="Incorrect planned quantity, actual quantity, cost or wastage can be edited with a supervisor correction note."
          />
          <InfoCard
            title="Reverse Completed Batch"
            text="Completed batches can be reversed with a reason. In the live stock engine this should post opposite stock movements for audit safety."
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/manufacturing/finished-goods" className="rounded-full bg-purple-700 px-5 py-2.5 text-sm font-black text-white">
            Open Finished Goods
          </Link>
          <Link href="/inventory" className="rounded-full border border-purple-200 bg-white px-5 py-2.5 text-sm font-black text-purple-800">
            Open Inventory
          </Link>
        </div>
      </div>
      </div>
    </VyronPremiumPageShell>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_16px_50px_rgba(76,29,149,0.10)]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-700">{title}</p>
      <p className="mt-3 truncate text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function ProductSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-2 text-sm font-black text-slate-700">
      Product
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none"
      >
        {products.map((item) => (
          <option key={item.name} value={item.name}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-2 text-sm font-black text-slate-700">
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none"
      />
    </label>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl bg-purple-50 p-5 text-sm font-semibold leading-6 text-purple-950">
      <p className="mb-2 font-black">{title}</p>
      {text}
    </div>
  );
}

function ActionButton({
  children,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  tone: "indigo" | "emerald" | "purple" | "rose" | "slate";
  onClick: () => void;
}) {
  const tones = {
    indigo: "bg-indigo-100 text-indigo-800",
    emerald: "bg-[#A855F7]/12 text-[#4D7C0F]",
    purple: "bg-purple-100 text-purple-800",
    rose: "bg-rose-100 text-rose-800",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs font-black ${tones[tone]}`}>
      {children}
    </button>
  );
}

function statusClass(status: BatchStatus) {
  if (status === "Completed") return "bg-[#A855F7]/12 text-[#4D7C0F]";
  if (status === "In Production") return "bg-indigo-100 text-indigo-800";
  if (status === "Reversed") return "bg-rose-100 text-rose-800";
  if (status === "Cancelled") return "bg-slate-200 text-slate-700";
  return "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
}
