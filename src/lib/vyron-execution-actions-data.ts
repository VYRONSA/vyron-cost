import {
  type ExecutionCandidate,
  type ExecutionWorkflowStatus,
} from "@/lib/vyron-execution-centre";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export type ExecutionActionEventType =
  | "created"
  | "approved"
  | "cancelled"
  | "owner_assigned"
  | "due_date_changed"
  | "progress_started"
  | "completed"
  | "notes_added"
  | "benefit_updated";

export type ExecutionActionEvent = {
  id: string;
  type: ExecutionActionEventType;
  label: string;
  detail?: string;
  at: string;
};

export type ExecutionPersistenceMode = "database" | "memory" | "unavailable";

export type ExecutionPersistenceInfo = {
  mode: ExecutionPersistenceMode;
  tableReady: boolean;
  warning: string | null;
};

export type ExecutionActionRow = {
  id: string;
  company_id: string;
  workspace_id: string;
  source_module: "actions-centre" | "decisions-centre" | "root-cause-centre";
  source_key: string;
  title: string;
  category: string;
  priority: string;
  owner: string;
  status: ExecutionWorkflowStatus;
  due_date: string | null;
  expected_outcome: string;
  expected_benefit: number | null;
  actual_benefit: number | null;
  completion_notes: string | null;
  notes: string | null;
  href: string | null;
  source_trace: string[];
  action_events: ExecutionActionEvent[];
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export class ExecutionPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionPersistenceError";
  }
}

type MemoryStore = Map<string, ExecutionActionRow[]>;

const memoryByCompany: MemoryStore = new Map();

function isProductionEnvironment() {
  return process.env.NODE_ENV === "production";
}

function isTableMissingError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("execution_actions") ||
    lower.includes("does not exist") ||
    lower.includes("could not find the table")
  );
}

function readMemory(companyId: string): ExecutionActionRow[] {
  return memoryByCompany.get(companyId) || [];
}

function writeMemory(companyId: string, rows: ExecutionActionRow[]) {
  memoryByCompany.set(companyId, rows);
}

function newEvent(
  type: ExecutionActionEventType,
  label: string,
  detail?: string
): ExecutionActionEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    label,
    detail,
    at: new Date().toISOString(),
  };
}

function parseEvents(raw: unknown): ExecutionActionEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: ExecutionActionEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label || "");
    if (!label) continue;
    events.push({
      id: String(row.id || `evt-${Math.random()}`),
      type: row.type as ExecutionActionEventType,
      label,
      detail: row.detail ? String(row.detail) : undefined,
      at: String(row.at || new Date().toISOString()),
    });
  }
  return events;
}

function mapRow(raw: Record<string, unknown>): ExecutionActionRow {
  return {
    id: String(raw.id),
    company_id: String(raw.company_id),
    workspace_id: String(raw.workspace_id),
    source_module: raw.source_module as ExecutionActionRow["source_module"],
    source_key: String(raw.source_key),
    title: String(raw.title),
    category: String(raw.category),
    priority: String(raw.priority),
    owner: String(raw.owner),
    status: raw.status as ExecutionWorkflowStatus,
    due_date: raw.due_date ? String(raw.due_date) : null,
    expected_outcome: String(raw.expected_outcome || ""),
    expected_benefit: raw.expected_benefit != null ? Number(raw.expected_benefit) : null,
    actual_benefit: raw.actual_benefit != null ? Number(raw.actual_benefit) : null,
    completion_notes: raw.completion_notes ? String(raw.completion_notes) : null,
    notes: raw.notes ? String(raw.notes) : null,
    href: raw.href ? String(raw.href) : null,
    source_trace: Array.isArray(raw.source_trace) ? raw.source_trace.map(String) : [],
    action_events: parseEvents(raw.action_events),
    approved_at: raw.approved_at ? String(raw.approved_at) : null,
    completed_at: raw.completed_at ? String(raw.completed_at) : null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}

function candidateToInsert(
  companyId: string,
  workspaceId: string,
  candidate: ExecutionCandidate
): Omit<
  ExecutionActionRow,
  "id" | "created_at" | "updated_at" | "approved_at" | "completed_at" | "actual_benefit" | "completion_notes" | "notes"
> {
  return {
    company_id: companyId,
    workspace_id: workspaceId,
    source_module: candidate.sourceModule,
    source_key: candidate.sourceKey,
    title: candidate.title,
    category: candidate.category,
    priority: candidate.priority,
    owner: candidate.owner,
    status: "Recommended",
    due_date: candidate.dueDate,
    expected_outcome: candidate.expectedOutcome,
    expected_benefit: candidate.expectedBenefit,
    href: candidate.href,
    source_trace: candidate.sourceTrace,
    action_events: [
      newEvent("created", "Created from intelligence", `Source: ${candidate.sourceModule}`),
    ],
  };
}

export async function checkExecutionPersistence(): Promise<ExecutionPersistenceInfo> {
  const isProd = isProductionEnvironment();

  if (!isSupabaseServiceRoleConfigured()) {
    return {
      mode: isProd ? "unavailable" : "memory",
      tableReady: false,
      warning: isProd
        ? "Supabase service role is not configured. Execution actions cannot be persisted in production."
        : "In-memory storage active for local development. Actions will not survive server restarts.",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      mode: isProd ? "unavailable" : "memory",
      tableReady: false,
      warning: isProd
        ? "Database connection unavailable. Execution actions cannot be persisted in production."
        : "In-memory storage active for local development. Actions will not survive server restarts.",
    };
  }

  const { error } = await supabase.from("execution_actions").select("id").limit(1);
  if (error) {
    if (isTableMissingError(error.message)) {
      return {
        mode: isProd ? "unavailable" : "memory",
        tableReady: false,
        warning: isProd
          ? "The execution_actions table is missing. Apply migrations 20260618_execution_actions.sql and 20260619_execution_actions_audit.sql before using Execution Centre in production."
          : "execution_actions table not found — using in-memory storage for local development only.",
      };
    }
    throw new Error(error.message);
  }

  return { mode: "database", tableReady: true, warning: null };
}

function assertWritablePersistence(persistence: ExecutionPersistenceInfo) {
  if (persistence.mode === "unavailable") {
    throw new ExecutionPersistenceError(
      persistence.warning ||
        "Execution actions cannot be saved because database persistence is unavailable in production."
    );
  }
}

function buildAuditEvents(
  current: ExecutionActionRow,
  update: ExecutionActionUpdate
): ExecutionActionEvent[] {
  const events = [...current.action_events];

  if (update.status === "Approved" && current.status !== "Approved") {
    events.push(newEvent("approved", "Action approved"));
  }
  if (update.status === "Cancelled" && current.status !== "Cancelled") {
    events.push(newEvent("cancelled", "Action rejected / cancelled"));
  }
  if (update.status === "In Progress" && current.status !== "In Progress") {
    events.push(newEvent("progress_started", "Execution started"));
  }
  if (update.status === "Completed" && current.status !== "Completed") {
    events.push(newEvent("completed", "Action marked complete"));
  }
  if (update.owner !== undefined && update.owner !== current.owner) {
    events.push(newEvent("owner_assigned", "Owner assigned", `${current.owner} → ${update.owner}`));
  }
  if (update.due_date !== undefined && update.due_date !== current.due_date) {
    events.push(
      newEvent(
        "due_date_changed",
        "Due date changed",
        `${current.due_date || "—"} → ${update.due_date || "—"}`
      )
    );
  }
  if (
    update.notes !== undefined &&
    update.notes !== current.notes &&
    (update.notes?.trim() ?? "") !== ""
  ) {
    events.push(newEvent("notes_added", "Notes updated"));
  }
  if (
    update.actual_benefit !== undefined &&
    update.actual_benefit !== current.actual_benefit &&
    update.actual_benefit != null
  ) {
    events.push(newEvent("benefit_updated", "Actual benefit recorded", String(update.actual_benefit)));
  }

  return events;
}

export async function listExecutionActions(
  companyId: string,
  persistence?: ExecutionPersistenceInfo
): Promise<ExecutionActionRow[]> {
  const info = persistence || (await checkExecutionPersistence());

  if (info.mode === "database") {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new ExecutionPersistenceError("Database unavailable.");
    const { data, error } = await supabase
      .from("execution_actions")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((row) => mapRow(row as Record<string, unknown>));
  }

  if (info.mode === "memory") {
    return readMemory(companyId);
  }

  return [];
}

export async function syncExecutionActions(
  companyId: string,
  workspaceId: string,
  candidates: ExecutionCandidate[],
  persistence?: ExecutionPersistenceInfo
): Promise<{ inserted: number; total: number; rows: ExecutionActionRow[] }> {
  const info = persistence || (await checkExecutionPersistence());
  assertWritablePersistence(info);

  const now = new Date().toISOString();
  let inserted = 0;

  if (info.mode === "database") {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new ExecutionPersistenceError("Database unavailable.");

    const existing = await listExecutionActions(companyId, info);
    const existingKeys = new Set(existing.map((row) => `${row.source_module}:${row.source_key}`));

    for (const candidate of candidates) {
      const key = `${candidate.sourceModule}:${candidate.sourceKey}`;
      if (existingKeys.has(key)) continue;

      const base = candidateToInsert(companyId, workspaceId, candidate);
      const payload = {
        ...base,
        actual_benefit: null,
        completion_notes: null,
        notes: null,
        approved_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      };

      const { error } = await supabase.from("execution_actions").insert(payload);
      if (error) throw new Error(error.message);
      inserted += 1;
      existingKeys.add(key);
    }

    const rows = await listExecutionActions(companyId, info);
    return { inserted, total: rows.length, rows };
  }

  const current = readMemory(companyId);
  const existingKeys = new Set(current.map((row) => `${row.source_module}:${row.source_key}`));
  const next = [...current];

  for (const candidate of candidates) {
    const key = `${candidate.sourceModule}:${candidate.sourceKey}`;
    if (existingKeys.has(key)) continue;
    const row: ExecutionActionRow = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...candidateToInsert(companyId, workspaceId, candidate),
      actual_benefit: null,
      completion_notes: null,
      notes: null,
      approved_at: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };
    next.push(row);
    inserted += 1;
    existingKeys.add(key);
  }

  writeMemory(companyId, next);
  return { inserted, total: next.length, rows: next };
}

export type ExecutionActionUpdate = {
  status?: ExecutionWorkflowStatus;
  owner?: string;
  due_date?: string | null;
  notes?: string | null;
  completion_notes?: string | null;
  actual_benefit?: number | null;
};

export async function updateExecutionAction(
  companyId: string,
  actionId: string,
  update: ExecutionActionUpdate,
  persistence?: ExecutionPersistenceInfo
): Promise<ExecutionActionRow> {
  const info = persistence || (await checkExecutionPersistence());
  assertWritablePersistence(info);

  const existing = await listExecutionActions(companyId, info);
  const current = existing.find((row) => row.id === actionId);
  if (!current) throw new Error("Execution action not found.");

  const now = new Date().toISOString();
  const action_events = buildAuditEvents(current, update);
  const patch: Record<string, unknown> = {
    updated_at: now,
    action_events,
  };

  if (update.status) {
    patch.status = update.status;
    if (update.status === "Approved") patch.approved_at = now;
    if (update.status === "Completed") patch.completed_at = now;
    if (update.status === "Cancelled") patch.completed_at = null;
  }
  if (update.owner !== undefined) patch.owner = update.owner;
  if (update.due_date !== undefined) patch.due_date = update.due_date;
  if (update.notes !== undefined) patch.notes = update.notes;
  if (update.completion_notes !== undefined) patch.completion_notes = update.completion_notes;
  if (update.actual_benefit !== undefined) patch.actual_benefit = update.actual_benefit;

  if (info.mode === "database") {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new ExecutionPersistenceError("Database unavailable.");

    const { data, error } = await supabase
      .from("execution_actions")
      .update(patch)
      .eq("id", actionId)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Execution action not found.");
    return mapRow(data as Record<string, unknown>);
  }

  const rows = readMemory(companyId);
  const index = rows.findIndex((row) => row.id === actionId);
  const next: ExecutionActionRow = {
    ...current,
    ...update,
    action_events,
    updated_at: now,
    approved_at:
      update.status === "Approved"
        ? now
        : update.status === "Cancelled"
          ? null
          : current.approved_at,
    completed_at:
      update.status === "Completed"
        ? now
        : update.status === "Cancelled"
          ? null
          : current.completed_at,
  };
  rows[index] = next;
  writeMemory(companyId, rows);
  return next;
}

export async function getExecutionAction(
  companyId: string,
  actionId: string
): Promise<ExecutionActionRow | null> {
  const rows = await listExecutionActions(companyId);
  return rows.find((row) => row.id === actionId) || null;
}
