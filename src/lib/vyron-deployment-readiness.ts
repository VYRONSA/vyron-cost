import { checkExecutionPersistence, type ExecutionPersistenceInfo } from "@/lib/vyron-execution-actions-data";
import {
  checkOperationsSchemaTables,
  OPERATIONS_CATCHUP_SQL,
  type SchemaTableCheck,
} from "@/lib/vyron-schema-readiness";
import {
  isSupabaseServerConfigured,
  isSupabaseServiceRoleConfigured,
  getSupabaseAdmin,
} from "@/lib/supabase-server";
import { isXeroOAuthConfigured } from "@/lib/vyron-xero-integration";
import { readConnection } from "@/lib/vyron-xero-connection-store";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export type ConfigStatus = "configured" | "missing";

export type MigrationCheck = {
  id: string;
  label: string;
  file: string;
  status: ConfigStatus;
  detail: string | null;
};

export type DeploymentReadinessReport = {
  ok: boolean;
  environment: {
    nodeEnv: string;
    supabaseUrl: ConfigStatus;
    supabaseAnonKey: ConfigStatus;
    supabaseServiceRole: ConfigStatus;
    xeroClientId: ConfigStatus;
    xeroClientSecret: ConfigStatus;
    xeroRedirectUri: ConfigStatus;
  };
  workspace: {
    hasActiveWorkspace: boolean;
    workspaceId: string | null;
    workspaceName: string | null;
  };
  company: {
    hasCompany: boolean;
    companyId: string | null;
    companyName: string | null;
  };
  executionPersistence: ExecutionPersistenceInfo;
  migrations: MigrationCheck[];
  schemaTables: SchemaTableCheck[];
  xero: {
    oauthReady: boolean;
    connected: boolean;
    status: string;
    organisationName: string | null;
    missingEnvVars: string[];
  };
  build: {
    isProduction: boolean;
    warnings: string[];
  };
  warnings: string[];
};

const REQUIRED_MIGRATIONS = [
  {
    id: "execution_actions",
    label: "Execution actions table",
    file: "20260618_execution_actions.sql",
  },
  {
    id: "execution_actions_audit",
    label: "Execution actions audit column",
    file: "20260619_execution_actions_audit.sql",
  },
] as const;

function envConfigured(key: string): ConfigStatus {
  const value = process.env[key]?.trim();
  if (!value) return "missing";
  if (value.includes("PASTE_YOUR") || value.includes("your-") || value === "changeme") return "missing";
  return "configured";
}

function isTableMissingError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("could not find the table") ||
    lower.includes("relation") && lower.includes("does not exist")
  );
}

function isColumnMissingError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("action_events") ||
    lower.includes("column") && lower.includes("does not exist")
  );
}

async function checkExecutionMigrations(): Promise<MigrationCheck[]> {
  const results: MigrationCheck[] = REQUIRED_MIGRATIONS.map((migration) => ({
    id: migration.id,
    label: migration.label,
    file: migration.file,
    status: "missing" as ConfigStatus,
    detail: null,
  }));

  if (!isSupabaseServiceRoleConfigured()) {
    for (const row of results) {
      row.detail = "Service role required to verify migration status.";
    }
    return results;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    for (const row of results) {
      row.detail = "Database client unavailable.";
    }
    return results;
  }

  const tableProbe = await supabase.from("execution_actions").select("id").limit(1);
  if (tableProbe.error) {
    if (isTableMissingError(tableProbe.error.message)) {
      results[0].detail = "Table not found in database.";
      results[1].detail = "Depends on execution_actions table.";
      return results;
    }
    results[0].detail = tableProbe.error.message;
    results[1].detail = "Could not verify audit column.";
    return results;
  }

  results[0].status = "configured";
  results[0].detail = "execution_actions table is present.";

  const auditProbe = await supabase.from("execution_actions").select("action_events").limit(1);
  if (auditProbe.error) {
    if (isColumnMissingError(auditProbe.error.message) || isTableMissingError(auditProbe.error.message)) {
      results[1].status = "missing";
      results[1].detail = "action_events column not found — apply audit migration.";
      return results;
    }
    results[1].detail = auditProbe.error.message;
    return results;
  }

  results[1].status = "configured";
  results[1].detail = "action_events JSONB column is present.";
  return results;
}

function collectBuildWarnings(input: {
  isProduction: boolean;
  environment: DeploymentReadinessReport["environment"];
  executionPersistence: ExecutionPersistenceInfo;
  migrations: MigrationCheck[];
  schemaTables: SchemaTableCheck[];
  xero: DeploymentReadinessReport["xero"];
  workspace: DeploymentReadinessReport["workspace"];
  company: DeploymentReadinessReport["company"];
}): string[] {
  const warnings: string[] = [];

  if (input.isProduction) {
    if (input.environment.supabaseUrl === "missing") {
      warnings.push("NEXT_PUBLIC_SUPABASE_URL is not configured for production.");
    }
    if (input.environment.supabaseAnonKey === "missing") {
      warnings.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured for production.");
    }
    if (input.environment.supabaseServiceRole === "missing") {
      warnings.push("SUPABASE_SERVICE_ROLE_KEY is required for server-side persistence in production.");
    }
    if (!input.xero.oauthReady) {
      warnings.push("Xero OAuth environment variables are incomplete — accounting integration will not work.");
    }
    if (input.executionPersistence.mode === "unavailable") {
      warnings.push(
        input.executionPersistence.warning ||
          "Execution Centre persistence is unavailable in production."
      );
    }
    for (const migration of input.migrations) {
      if (migration.status === "missing") {
        warnings.push(`Required migration missing: ${migration.file}`);
      }
    }
    for (const table of input.schemaTables) {
      if (table.status === "missing") {
        warnings.push(`Required table missing: public.${table.table} — apply ${table.migrationFile} or ${OPERATIONS_CATCHUP_SQL}.`);
      }
    }
    if (!input.workspace.hasActiveWorkspace) {
      warnings.push("No active workspace detected — select a client workspace before go-live.");
    }
    if (!input.company.hasCompany) {
      warnings.push("No company linked to the active workspace.");
    }
  } else {
    if (input.executionPersistence.mode === "memory") {
      warnings.push(
        input.executionPersistence.warning ||
          "Execution actions are using in-memory storage in development."
      );
    }
    for (const migration of input.migrations) {
      if (migration.status === "missing") {
        warnings.push(`Migration not applied (dev): ${migration.file}`);
      }
    }
    for (const table of input.schemaTables) {
      if (table.status === "missing") {
        warnings.push(`Table missing (dev): public.${table.table}`);
      }
    }
  }

  return warnings;
}

export async function buildDeploymentReadinessReport(): Promise<DeploymentReadinessReport> {
  const isProduction = process.env.NODE_ENV === "production";
  const workspace = await getServerActiveWorkspace();
  const companyId = await getWorkspaceCompanyId();

  const environment = {
    nodeEnv: process.env.NODE_ENV || "development",
    supabaseUrl: isSupabaseServerConfigured() ? ("configured" as const) : ("missing" as const),
    supabaseAnonKey: envConfigured("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRole: isSupabaseServiceRoleConfigured() ? ("configured" as const) : ("missing" as const),
    xeroClientId: envConfigured("XERO_CLIENT_ID"),
    xeroClientSecret: envConfigured("XERO_CLIENT_SECRET"),
    xeroRedirectUri: envConfigured("XERO_REDIRECT_URI"),
  };

  const executionPersistence = await checkExecutionPersistence();
  const migrations = await checkExecutionMigrations();
  const schemaTables = await checkOperationsSchemaTables();

  const missingXeroEnv = (["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"] as const).filter(
    (key) => envConfigured(key) === "missing"
  );

  let xeroConnected = false;
  let xeroStatus = "Not Connected";
  let xeroOrganisation: string | null = null;

  if (workspace?.id) {
    try {
      const connection = await readConnection(workspace.id);
      xeroConnected = Boolean(connection.connected);
      xeroStatus = connection.status;
      xeroOrganisation = connection.organisationName || null;
    } catch {
      xeroStatus = "Unavailable";
    }
  } else {
    xeroStatus = "No workspace";
  }

  const xero = {
    oauthReady: isXeroOAuthConfigured(),
    connected: xeroConnected,
    status: xeroStatus,
    organisationName: xeroOrganisation,
    missingEnvVars: [...missingXeroEnv],
  };

  const workspaceInfo = {
    hasActiveWorkspace: Boolean(workspace?.id),
    workspaceId: workspace?.id || null,
    workspaceName: workspace?.companyName || workspace?.tradingName || null,
  };

  const companyInfo = {
    hasCompany: Boolean(companyId),
    companyId: companyId || null,
    companyName: workspace?.companyName || workspace?.tradingName || null,
  };

  const buildWarnings = collectBuildWarnings({
    isProduction,
    environment,
    executionPersistence,
    migrations,
    schemaTables,
    xero,
    workspace: workspaceInfo,
    company: companyInfo,
  });

  const warnings = [...buildWarnings];

  if (isProduction && executionPersistence.mode === "memory") {
    warnings.push("Execution actions are falling back to in-memory storage — not safe for production.");
  }

  const envReady =
    environment.supabaseUrl === "configured" &&
    environment.supabaseAnonKey === "configured" &&
    environment.supabaseServiceRole === "configured";

  const migrationsReady = migrations.every((row) => row.status === "configured");
  const schemaReady = schemaTables.every((row) => row.status === "configured");
  const executionReady = isProduction ? executionPersistence.mode === "database" : true;

  const ok = envReady && migrationsReady && schemaReady && executionReady && (!isProduction || xero.oauthReady);

  return {
    ok,
    environment,
    workspace: workspaceInfo,
    company: companyInfo,
    executionPersistence,
    migrations,
    schemaTables,
    xero,
    build: {
      isProduction,
      warnings: buildWarnings,
    },
    warnings,
  };
}
