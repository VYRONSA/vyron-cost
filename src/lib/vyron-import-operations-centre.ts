import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportOperationalStatus =
  | "Success"
  | "Failed"
  | "Running"
  | "Never Run"
  | "Completed with Warnings";

export type ImportHistoryEntry = {
  date: string;
  user: string;
  records: number;
  status: ImportOperationalStatus;
};

export type ImportOperationalSnapshot = {
  lastImportDate: string | null;
  lastStatus: ImportOperationalStatus;
  recordsImported: number;
  importedBy: string;
  history: ImportHistoryEntry[];
  historyAvailable: boolean;
};

export type ImportOperationsSummary = {
  totalImportTypes: number;
  successfulImportsToday: number;
  failedImportsToday: number;
  importsRunning: number;
  lastImportExecuted: string | null;
};

export type ImportOperationsCentreData = {
  summary: ImportOperationsSummary;
  snapshots: Record<string, ImportOperationalSnapshot>;
};

type GenericRow = Record<string, unknown>;

const DEFAULT_SNAPSHOT: ImportOperationalSnapshot = {
  lastImportDate: null,
  lastStatus: "Never Run",
  recordsImported: 0,
  importedBy: "System",
  history: [],
  historyAvailable: false,
};

function normalizeStatus(value: unknown): ImportOperationalStatus {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "Never Run";
  if (raw.includes("running") || raw.includes("processing") || raw.includes("queued")) return "Running";
  if (raw === "partial" || raw.includes("warning")) return "Completed with Warnings";
  if (raw.includes("fail") || raw.includes("error")) return "Failed";
  if (raw.includes("complete") || raw.includes("success")) return "Success";
  return "Success";
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toRecordCount(row: GenericRow): number {
  const candidates = [
    row.imported_rows,
    row.valid_rows,
    row.records_imported,
    row.total_rows,
  ];
  for (const value of candidates) {
    const num = Number(value || 0);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function toUser(row: GenericRow): string {
  const candidates = [row.created_by, row.imported_by, row.actor, row.user_name, row.user_id];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "System";
}

function mapRows(rows: GenericRow[]): ImportHistoryEntry[] {
  return rows
    .map((row) => ({
      date: toIso(row.created_at || row.imported_at) || "",
      user: toUser(row),
      records: toRecordCount(row),
      status: normalizeStatus(row.status),
    }))
    .filter((row) => row.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function selectRows(
  supabase: SupabaseClient,
  table: string,
  companyId: string
): Promise<GenericRow[]> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) return [];
    return (data || []) as GenericRow[];
  } catch {
    return [];
  }
}

function startOfDayIso(reference = new Date()) {
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).toISOString();
}

function buildSnapshot(rows: GenericRow[], historyAvailable: boolean): ImportOperationalSnapshot {
  if (!rows.length) return { ...DEFAULT_SNAPSHOT, historyAvailable };

  const history = mapRows(rows);
  const latest = history[0];
  if (!latest) return { ...DEFAULT_SNAPSHOT, historyAvailable };

  return {
    lastImportDate: latest.date,
    lastStatus: latest.status,
    recordsImported: latest.records,
    importedBy: latest.user,
    history,
    historyAvailable,
  };
}

export async function getImportOperationsCentreData(
  supabase: SupabaseClient,
  companyId: string,
  totalImportTypes: number
): Promise<ImportOperationsCentreData> {
  const [workspaceRuns, openingRows, priceRows] = await Promise.all([
    selectRows(supabase, "vyron_import_runs", companyId),
    selectRows(supabase, "vyron_opening_stock_import_runs", companyId),
    selectRows(supabase, "vyron_customer_price_list_import_runs", companyId),
  ]);

  const rawRows = workspaceRuns.filter((row) => String(row.entity_type || "").toLowerCase() === "raw-materials");
  const finishedRows = workspaceRuns.filter((row) => String(row.entity_type || "").toLowerCase() === "finished-goods");
  const bomRows = workspaceRuns.filter((row) => String(row.entity_type || "").toLowerCase() === "boms");

  const snapshots: Record<string, ImportOperationalSnapshot> = {
    "raw-material-import": buildSnapshot(rawRows, true),
    "product-import": buildSnapshot(finishedRows, true),
    "bom-import": buildSnapshot(bomRows, true),
    "opening-stock-import": buildSnapshot(openingRows, true),
    "customer-price-list-import": buildSnapshot(priceRows, true),
    "supplier-import": { ...DEFAULT_SNAPSHOT, historyAvailable: false },
  };

  const allHistory = [
    ...snapshots["raw-material-import"].history,
    ...snapshots["product-import"].history,
    ...snapshots["bom-import"].history,
    ...snapshots["opening-stock-import"].history,
    ...snapshots["customer-price-list-import"].history,
  ];

  const dayStart = startOfDayIso();
  const todayEntries = allHistory.filter((entry) => entry.date >= dayStart);
  const lastImportExecuted = allHistory.length
    ? allHistory
        .map((entry) => entry.date)
        .sort((a, b) => (a < b ? 1 : -1))[0]
    : null;

  const importsRunning = Object.values(snapshots).filter((snapshot) => snapshot.lastStatus === "Running").length;

  return {
    summary: {
      totalImportTypes,
      successfulImportsToday: todayEntries.filter((entry) => entry.status === "Success").length,
      failedImportsToday: todayEntries.filter((entry) => entry.status === "Failed").length,
      importsRunning,
      lastImportExecuted,
    },
    snapshots,
  };
}
