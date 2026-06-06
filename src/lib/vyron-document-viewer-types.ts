/** Normalized bounding box (0–1) relative to page width/height. Origin top-left. */
export type NormalizedBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentRegionKind =
  | "invoice_number"
  | "supplier"
  | "customer"
  | "invoice_date"
  | "subtotal"
  | "vat"
  | "total"
  | "line_item"
  | "custom";

/** Future OCR overlay: header / totals / custom fields on the invoice. */
export type DocumentFieldRegion = {
  id: string;
  kind: DocumentRegionKind;
  label: string;
  page: number;
  bbox: NormalizedBBox;
  /** Links to review field key or line id when known. */
  targetId?: string;
};

/** Per-line source region on the invoice (stored when extraction provides coordinates). */
export type LineSourceRegion = {
  lineId: string;
  page: number;
  bbox: NormalizedBBox;
};

export type DocumentViewerRegions = {
  pageCount?: number;
  fields: DocumentFieldRegion[];
  lines: LineSourceRegion[];
};

export type ViewerFocusTarget = {
  lineId?: string;
  fieldId?: string;
  page?: number;
  bbox?: NormalizedBBox;
};

export const ZOOM_PRESETS = [1, 1.5, 2, 3] as const;
export type ZoomPreset = (typeof ZOOM_PRESETS)[number];

export type FitMode = "width" | "page" | "custom";

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** Estimate line position on page when OCR bbox is not yet stored. */
export function estimateLineBBox(lineIndex: number, lineCount: number): NormalizedBBox {
  const headerReserve = 0.22;
  const tableHeight = 0.68;
  const rows = Math.max(lineCount, 1);
  const rowHeight = tableHeight / rows;
  const y = clamp01(headerReserve + lineIndex * rowHeight);
  return {
    x: 0.04,
    y,
    width: 0.92,
    height: clamp01(rowHeight * 0.85),
  };
}

export function parseSourceBBox(raw: unknown): NormalizedBBox | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const width = Number(o.width);
  const height = Number(o.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  return { x: clamp01(x), y: clamp01(y), width: clamp01(width), height: clamp01(height) };
}
