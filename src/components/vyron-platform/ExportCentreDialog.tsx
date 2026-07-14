"use client";

import { useMemo } from "react";

type ExportFormat = "xlsx" | "csv" | "pdf";
type ExportScope = "stock_only" | "all" | "selected";
type SortDirection = "asc" | "desc";

type ToggleOption = {
  key: string;
  label: string;
};

type SortOption = {
  key: string;
  label: string;
};

export type ExportCentreState = {
  format: ExportFormat;
  scope: ExportScope;
  includeZeroBalance: boolean;
  includeFlags: Record<string, boolean>;
  inventoryFieldFlags: Record<string, boolean>;
  manufacturingFieldFlags: Record<string, boolean>;
  commercialFieldFlags: Record<string, boolean>;
  filters: {
    dateCreatedFrom: string;
    dateCreatedTo: string;
    dateUpdatedFrom: string;
    dateUpdatedTo: string;
    createdBy: string;
    supplier: string;
    category: string;
    status: string;
    productGroup: string;
    search: string;
  };
  sortBy: string;
  sortDirection: SortDirection;
};

export type ExportCentreDialogProps = {
  open: boolean;
  title: string;
  selectedCount: number;
  busy: boolean;
  error: string;
  state: ExportCentreState;
  onClose: () => void;
  onStateChange: (next: ExportCentreState) => void;
  onExport: () => void;
  includeOptions: ToggleOption[];
  inventoryFieldOptions: ToggleOption[];
  manufacturingFieldOptions: ToggleOption[];
  commercialFieldOptions: ToggleOption[];
  sortOptions: SortOption[];
};

function ToggleGrid({
  title,
  options,
  values,
  onChange,
}: {
  title: string;
  options: ToggleOption[];
  values: Record<string, boolean>;
  onChange: (key: string, checked: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-black text-slate-900">{title}</h3>
      <div className="grid gap-2 md:grid-cols-2">
        {options.map((option) => (
          <label key={option.key} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(values[option.key])}
              onChange={(event) => onChange(option.key, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ExportCentreDialog(props: ExportCentreDialogProps) {
  const {
    open,
    title,
    selectedCount,
    busy,
    error,
    state,
    onClose,
    onStateChange,
    onExport,
    includeOptions,
    inventoryFieldOptions,
    manufacturingFieldOptions,
    commercialFieldOptions,
    sortOptions,
  } = props;

  const selectedScopeDisabled = selectedCount <= 0;

  const canExport = useMemo(() => {
    if (busy) return false;
    if (state.scope === "selected" && selectedCount <= 0) return false;
    return true;
  }, [busy, selectedCount, state.scope]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            <p className="text-sm font-medium text-slate-600">VYRON COST standard reusable Export Centre.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-black text-slate-900">Section 1 · Export Format</h3>
            <div className="grid gap-2">
              {([
                { key: "xlsx", label: "Excel (.xlsx)" },
                { key: "csv", label: "CSV" },
                { key: "pdf", label: "PDF" },
              ] as Array<{ key: ExportFormat; label: string }>).map((option) => (
                <label key={option.key} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="radio"
                    name="export-format"
                    checked={state.format === option.key}
                    onChange={() => onStateChange({ ...state, format: option.key })}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-black text-slate-900">Section 2 · Export Scope</h3>
            <div className="grid gap-2">
              {([
                { key: "stock_only", label: "Finished Goods with Stock Only", disabled: false },
                { key: "all", label: "All Finished Goods", disabled: false },
                {
                  key: "selected",
                  label: `Selected Finished Goods (${selectedCount})`,
                  disabled: selectedScopeDisabled,
                },
              ] as Array<{ key: ExportScope; label: string; disabled: boolean }>).map((option) => (
                <label key={option.key} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="radio"
                    name="export-scope"
                    checked={state.scope === option.key}
                    disabled={option.disabled}
                    onChange={() => {
                      const nextScope = option.key;
                      onStateChange({
                        ...state,
                        scope: nextScope,
                        includeZeroBalance: nextScope === "all" ? true : state.includeZeroBalance,
                      });
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">Section 3 · Include</h3>
          <div className="mb-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={state.includeZeroBalance}
                disabled={state.scope !== "all"}
                onChange={(event) => onStateChange({ ...state, includeZeroBalance: event.target.checked })}
              />
              Include Zero Balance Finished Goods
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {includeOptions.map((option) => (
              <label key={option.key} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(state.includeFlags[option.key])}
                  onChange={(event) =>
                    onStateChange({
                      ...state,
                      includeFlags: { ...state.includeFlags, [option.key]: event.target.checked },
                    })
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ToggleGrid
            title="Section 4 · Inventory Fields"
            options={inventoryFieldOptions}
            values={state.inventoryFieldFlags}
            onChange={(key, checked) =>
              onStateChange({
                ...state,
                inventoryFieldFlags: { ...state.inventoryFieldFlags, [key]: checked },
              })
            }
          />
          <ToggleGrid
            title="Section 5 · Manufacturing Fields"
            options={manufacturingFieldOptions}
            values={state.manufacturingFieldFlags}
            onChange={(key, checked) =>
              onStateChange({
                ...state,
                manufacturingFieldFlags: { ...state.manufacturingFieldFlags, [key]: checked },
              })
            }
          />
          <ToggleGrid
            title="Section 6 · Commercial Fields"
            options={commercialFieldOptions}
            values={state.commercialFieldFlags}
            onChange={(key, checked) =>
              onStateChange({
                ...state,
                commercialFieldFlags: { ...state.commercialFieldFlags, [key]: checked },
              })
            }
          />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">Section 7 · Filtering</h3>
          <div className="grid gap-3 lg:grid-cols-5">
            <input
              type="date"
              value={state.filters.dateCreatedFrom}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, dateCreatedFrom: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Date Created From"
            />
            <input
              type="date"
              value={state.filters.dateCreatedTo}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, dateCreatedTo: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Date Created To"
            />
            <input
              type="date"
              value={state.filters.dateUpdatedFrom}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, dateUpdatedFrom: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Date Updated From"
            />
            <input
              type="date"
              value={state.filters.dateUpdatedTo}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, dateUpdatedTo: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Date Updated To"
            />
            <input
              value={state.filters.search}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, search: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Search"
            />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-5">
            <input
              value={state.filters.createdBy}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, createdBy: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Created By"
            />
            <input
              value={state.filters.supplier}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, supplier: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Supplier"
            />
            <input
              value={state.filters.category}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, category: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Category"
            />
            <input
              value={state.filters.status}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, status: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Status"
            />
            <input
              value={state.filters.productGroup}
              onChange={(event) => onStateChange({ ...state, filters: { ...state.filters, productGroup: event.target.value } })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              placeholder="Product Group"
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">Section 8 · Sorting</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={state.sortBy}
              onChange={(event) => onStateChange({ ...state, sortBy: event.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            <select
              value={state.sortDirection}
              onChange={(event) => onStateChange({ ...state, sortDirection: event.target.value as SortDirection })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</div> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-black text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!canExport}
            className="rounded-full bg-purple-700 px-5 py-2 text-sm font-black text-white shadow-lg shadow-purple-700/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
