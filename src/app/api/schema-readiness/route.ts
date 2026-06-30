import { NextResponse } from "next/server";
import {
  OPERATIONS_CATCHUP_SQL,
  OPERATIONS_SCHEMA_TABLES,
  checkOperationsSchemaTables,
  formatMissingSchemaMessage,
} from "@/lib/vyron-schema-readiness";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    await requireWorkspacePermission("dashboard.view");
    const tables = await checkOperationsSchemaTables(supabase);
    const missing = tables.filter((row) => row.status === "missing");
    const ready = missing.length === 0;

    return NextResponse.json({
      ok: true,
      ready,
      catchupSql: OPERATIONS_CATCHUP_SQL,
      tables,
      message: ready ? "Operations schema is ready." : formatMissingSchemaMessage(tables),
      rootCause: ready
        ? null
        : "Migrations exist in src/supabase/migrations/20260626–20260704 but have not been applied to this Supabase project. Table names and API references are correct.",
      tablesExpected: OPERATIONS_SCHEMA_TABLES.map((row) => row.table),
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Schema readiness check failed.");
  }
}
