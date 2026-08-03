import { NextRequest, NextResponse } from "next/server";
import {
  appendPlatformAuditEvent,
  developerApiUnauthorized,
  requirePlatformSessionFromRequest,
} from "@/lib/vyron-platform-auth";
import {
  executeReset,
  isDeveloperResetPasswordConfigured,
  isResetModuleKey,
  resolveCompanyForReset,
  validateCleanState,
  verifyDeveloperPassword,
} from "@/lib/vyron-developer-reset";
import { verifyBackup, verifyPreviewToken } from "@/lib/vyron-developer-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The literal the operator must type before a reset is accepted. */
const CONFIRMATION_PHRASE = "DELETE";

/**
 * Destructive. Deletes one module's data for a single company inside a single
 * Postgres transaction. Requires a PLATFORM_ADMIN session, the supervisor
 * password, and the exact confirmation phrase.
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
      { ok: false, error: "VYRON_DEV_RESET_PASSWORD_HASH is not configured. The reset centre is disabled." },
      { status: 503 }
    );
  }

  let body: {
    companyId?: string;
    module?: string;
    password?: string;
    confirmation?: string;
    reason?: string;
    previewToken?: string;
    backupLocation?: string;
    acknowledgedNoBackup?: boolean;
    acknowledgedIrreversible?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!verifyDeveloperPassword(String(body.password || ""))) {
    await appendPlatformAuditEvent({
      eventType: "developer.reset.denied",
      success: false,
      email: session.email,
      userId: session.userId,
      role: session.role,
      detail: "Supervisor password rejected.",
      request,
    });
    return NextResponse.json({ ok: false, error: "Developer supervisor password rejected." }, { status: 403 });
  }

  if (String(body.confirmation || "") !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      { ok: false, error: `Type ${CONFIRMATION_PHRASE} exactly to confirm.` },
      { status: 400 }
    );
  }

  const companyId = String(body.companyId || "").trim();
  const moduleKey = String(body.module || "").trim();

  if (!companyId) {
    return NextResponse.json({ ok: false, error: "companyId is required." }, { status: 400 });
  }
  if (!isResetModuleKey(moduleKey)) {
    return NextResponse.json({ ok: false, error: "Unknown reset module." }, { status: 400 });
  }

  // PCP-045A gate: a stale preview must never authorise a delete.
  const preview = verifyPreviewToken(String(body.previewToken || ""), companyId, moduleKey);
  if (!preview.ok) {
    return NextResponse.json({ ok: false, error: `Cannot continue. ${preview.reason}` }, { status: 409 });
  }

  try {
    // Re-resolve the company server-side: never trust the name the browser showed.
    const company = await resolveCompanyForReset(companyId);

    // PCP-045A gate: backup verified, or its absence explicitly acknowledged.
    const backupLocation = String(body.backupLocation || "").trim();
    let backupCreated = false;
    let verifiedLocation: string | null = null;

    if (backupLocation) {
      const verified = await verifyBackup(backupLocation, companyId);
      if (!verified.ok) {
        return NextResponse.json(
          { ok: false, error: `Cannot continue. ${verified.reason}` },
          { status: 409 }
        );
      }
      backupCreated = true;
      verifiedLocation = backupLocation;
    }

    const acknowledged = Boolean(body.acknowledgedNoBackup) && Boolean(body.acknowledgedIrreversible);
    if (!backupCreated && !acknowledged) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Cannot continue. Create a backup, or tick both acknowledgements to confirm this reset cannot be undone.",
        },
        { status: 409 }
      );
    }

    const result = await executeReset({
      companyId,
      moduleKey,
      actorUserId: session.userId,
      actorEmail: session.email,
      reason: String(body.reason || "").trim() || null,
      backupCreated,
      backupLocation: verifiedLocation,
      backupAcknowledgedWithout: !backupCreated && acknowledged,
    });

    // Prove the clean state rather than asserting it.
    const validation = await validateCleanState(companyId, moduleKey);
    const remaining = validation.remaining;

    await appendPlatformAuditEvent({
      eventType: "developer.reset.executed",
      success: true,
      email: session.email,
      userId: session.userId,
      role: session.role,
      detail: `${moduleKey} on ${company.name} — ${result.total_rows_deleted} rows deleted.`,
      request,
    });

    return NextResponse.json({
      ok: true,
      company,
      module: moduleKey,
      backup: {
        created: backupCreated,
        location: verifiedLocation,
        acknowledgedWithout: !backupCreated && acknowledged,
      },
      rowsDeleted: result.rows_deleted || {},
      totalRowsDeleted: result.total_rows_deleted || 0,
      durationMs: result.duration_ms || 0,
      validation,
      remaining,
      warnings: remaining.length
        ? [`${remaining.length} table(s) still hold rows for this company. See "rows remaining".`]
        : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed.";
    await appendPlatformAuditEvent({
      eventType: "developer.reset.failed",
      success: false,
      email: session.email,
      userId: session.userId,
      role: session.role,
      detail: message,
      request,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
