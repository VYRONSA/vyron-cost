import { NextRequest, NextResponse } from "next/server";
import {
  appendPlatformAuditEvent,
  developerApiUnauthorized,
  requirePlatformSessionFromRequest,
} from "@/lib/vyron-platform-auth";
import {
  isDeveloperResetPasswordConfigured,
  verifyDeveloperPassword,
} from "@/lib/vyron-developer-reset";
import { forceDeleteClientWorkspace } from "@/lib/vyron-saas-workspace";
import { isProtectedCompany, protectedReason } from "@/lib/vyron-protected-tenants";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import { createBackup, dryRunRestore } from "@/lib/vyron-developer-backup";
import { previewReset } from "@/lib/vyron-developer-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Permanently deletes one or more client workspaces, including their
 * operational data. This is the override for the archive-instead-of-delete
 * behaviour: if the operator selects it and supplies the supervisor password,
 * it goes — data or no data.
 *
 * Irreversible. Requires PLATFORM_ADMIN plus the supervisor password.
 */
export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requirePlatformSessionFromRequest(request, ["PLATFORM_ADMIN"]);
  } catch (error) {
    return developerApiUnauthorized(
      error instanceof Error ? error.message : "Developer authentication required."
    );
  }

  if (!isDeveloperResetPasswordConfigured()) {
    return NextResponse.json(
      { ok: false, error: "VYRON_DEV_RESET_PASSWORD_HASH is not configured. Bulk delete is disabled." },
      { status: 503 }
    );
  }

  const startedAt = Date.now();
  let body: { workspaceIds?: unknown; password?: string; confirmation?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!verifyDeveloperPassword(String(body.password || ""))) {
    await appendPlatformAuditEvent({
      eventType: "developer.clients.bulk_delete.denied",
      success: false,
      email: session.email,
      userId: session.userId,
      role: session.role,
      detail: "Supervisor password rejected.",
      request,
    });
    return NextResponse.json({ ok: false, error: "Developer supervisor password rejected." }, { status: 403 });
  }

  const ids = Array.isArray(body.workspaceIds)
    ? body.workspaceIds.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Select at least one client to delete." }, { status: 400 });
  }

  // Safeguard 3 — the operator must type DELETE <count>, so the number of
  // workspaces going is stated explicitly rather than assumed.
  const expectedPhrase = `DELETE ${ids.length}`;
  if (String(body.confirmation || "").trim() !== expectedPhrase) {
    return NextResponse.json(
      { ok: false, error: `Type "${expectedPhrase}" exactly to confirm.` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase service role is not configured." }, { status: 503 });
  }

  const { data: targets } = await supabase
    .from("vyron_workspaces")
    .select("id, company_id, company_name")
    .in("id", ids);

  // Safeguard 5 — never delete the workspace the operator is currently inside.
  const activeWorkspace = await getServerActiveWorkspace();
  const activeWorkspaceId = activeWorkspace?.id || null;
  const activeCompanyId = activeWorkspace?.companyId || null;

  // Safeguard 2 — the protected list is enforced here, not only in the UI.
  const refused: Array<{ workspaceId: string; companyName: string; reason: string }> = [];
  const allowed: string[] = [];

  for (const id of ids) {
    const target = (targets || []).find((t) => String(t.id) === id);
    const companyName = String(target?.company_name || id);

    if (target && isProtectedCompany(target.company_id)) {
      refused.push({
        workspaceId: id,
        companyName,
        reason: protectedReason(target.company_id) || "Protected tenant",
      });
      continue;
    }
    if (activeWorkspaceId && id === activeWorkspaceId) {
      refused.push({ workspaceId: id, companyName, reason: "Currently active workspace" });
      continue;
    }
    if (activeCompanyId && target?.company_id === activeCompanyId) {
      refused.push({ workspaceId: id, companyName, reason: "Belongs to the currently active workspace" });
      continue;
    }
    allowed.push(id);
  }

  if (!allowed.length) {
    return NextResponse.json(
      { ok: false, error: "Every selected workspace is protected or currently active.", refused },
      { status: 400 }
    );
  }

  const deleted: Array<{
    workspaceId: string;
    companyId: string | null;
    rowsExpected: number;
    rowsCleared: number;
    rowsRemaining: number;
    backupId: string | null;
    verified: boolean;
  }> = [];
  const failed: Array<{ workspaceId: string; error: string }> = [];

  for (const workspaceId of allowed) {
    const target = (targets || []).find((t) => String(t.id) === workspaceId);
    const companyId = target?.company_id ? String(target.company_id) : null;
    const companyName = String(target?.company_name || workspaceId);

    if (!companyId) {
      failed.push({ workspaceId, error: "Workspace has no company; refusing to delete unscoped." });
      continue;
    }

    try {
      // ---- Task 1: mandatory, proven-restorable backup before any delete ----
      const rowsExpected = (await previewReset(companyId, "factory")).reduce(
        (sum, row) => sum + row.row_count,
        0
      );

      const backup = await createBackup({ companyId, companyName, moduleKey: "factory" });
      const dryRun = await dryRunRestore(backup.location, companyId);
      if (!dryRun.ok) {
        failed.push({ workspaceId, error: `Backup not restorable — delete refused. ${dryRun.reason}` });
        continue;
      }
      if (dryRun.rows !== rowsExpected) {
        failed.push({
          workspaceId,
          error: `Backup captured ${dryRun.rows} rows but ${rowsExpected} are in scope — delete refused.`,
        });
        continue;
      }

      const result = await forceDeleteClientWorkspace(workspaceId, session.email);

      // ---- Task 2: verify the delete rather than assume it ----
      const rowsRemaining = (await previewReset(companyId, "factory")).reduce(
        (sum, row) => sum + row.row_count,
        0
      );
      if (rowsRemaining !== 0) {
        failed.push({
          workspaceId,
          error: `Partial delete: ${rowsRemaining} row(s) remain. Restore from ${backup.location}.`,
        });
        continue;
      }

      deleted.push({
        workspaceId,
        companyId: result.companyId ?? null,
        rowsExpected,
        rowsCleared: result.rowsCleared,
        rowsRemaining,
        backupId: backup.location,
        verified: true,
      });
    } catch (error) {
      failed.push({
        workspaceId,
        error: error instanceof Error ? error.message : "Delete failed.",
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  const rowsCleared = deleted.reduce((sum, d) => sum + d.rowsCleared, 0);

  // Safeguard 6 — the audit record must outlive the rows it describes.
  // vyron_dev_reset_audit is company-scoped with ON DELETE CASCADE, so its rows
  // vanish with the company; the platform audit survives and is authoritative here.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  const auditPayload = {
    operator: session.email,
    operatorUserId: session.userId,
    timestamp: new Date().toISOString(),
    ip,
    userAgent: request.headers.get("user-agent") || null,
    durationMs,
    backupIds: deleted.map((d) => d.backupId).filter(Boolean),
    requested: ids.length,
    deletedCount: deleted.length,
    failedCount: failed.length,
    refusedCount: refused.length,
    rowsCleared,
    verificationResult: failed.length === 0 && deleted.every((d) => d.verified) ? "PASS" : "FAIL",
    deleted: deleted.map((d) => ({
      workspaceId: d.workspaceId,
      companyId: d.companyId,
      backupId: d.backupId,
      rowsExpected: d.rowsExpected,
      rowsCleared: d.rowsCleared,
      rowsRemaining: d.rowsRemaining,
      verified: d.verified,
    })),
    protectedRefused: refused.filter((r) => !/active workspace/i.test(r.reason)),
    activeRefused: refused.filter((r) => /active workspace/i.test(r.reason)),
    refused,
    failed,
  };

  await appendPlatformAuditEvent({
    eventType: "developer.clients.bulk_delete",
    success: failed.length === 0,
    email: session.email,
    userId: session.userId,
    role: session.role,
    detail: JSON.stringify(auditPayload),
    request,
  });

  return NextResponse.json({
    ok: failed.length === 0,
    requested: ids.length,
    deletedCount: deleted.length,
    failedCount: failed.length,
    refusedCount: refused.length,
    rowsCleared,
    durationMs,
    deleted,
    refused,
    failed,
  });
}
