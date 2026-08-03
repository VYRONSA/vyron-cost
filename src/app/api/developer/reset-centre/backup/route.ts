import { NextRequest, NextResponse } from "next/server";
import {
  appendPlatformAuditEvent,
  developerApiUnauthorized,
  requirePlatformSessionFromRequest,
} from "@/lib/vyron-platform-auth";
import {
  isDeveloperResetPasswordConfigured,
  isResetModuleKey,
  resolveCompanyForReset,
  verifyDeveloperPassword,
} from "@/lib/vyron-developer-reset";
import { createBackup, getLastBackup } from "@/lib/vyron-developer-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current backup status for a company. Read-only. */
export async function GET(request: NextRequest) {
  try {
    await requirePlatformSessionFromRequest(request, ["PLATFORM_ADMIN"]);
  } catch (error) {
    return developerApiUnauthorized(
      error instanceof Error ? error.message : "Developer authentication required."
    );
  }

  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "companyId is required." }, { status: 400 });
  }

  try {
    const company = await resolveCompanyForReset(companyId);
    const backup = await getLastBackup(company.name, companyId);
    return NextResponse.json({ ok: true, company, backup });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backup status failed." },
      { status: 500 }
    );
  }
}

/** Creates a timestamped backup of every table the selected module would delete. */
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

  let body: { companyId?: string; module?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!verifyDeveloperPassword(String(body.password || ""))) {
    return NextResponse.json({ ok: false, error: "Developer supervisor password rejected." }, { status: 403 });
  }

  const companyId = String(body.companyId || "").trim();
  const moduleKey = String(body.module || "").trim();

  if (!companyId) {
    return NextResponse.json({ ok: false, error: "companyId is required." }, { status: 400 });
  }
  if (!isResetModuleKey(moduleKey)) {
    return NextResponse.json({ ok: false, error: "Unknown reset module." }, { status: 400 });
  }

  try {
    const company = await resolveCompanyForReset(companyId);
    const report = await createBackup({
      companyId,
      companyName: company.name,
      moduleKey,
    });

    await appendPlatformAuditEvent({
      eventType: "developer.reset.backup",
      success: true,
      email: session.email,
      userId: session.userId,
      role: session.role,
      detail: `${moduleKey} backup for ${company.name} — ${report.rows} rows to ${report.location}`,
      request,
    });

    return NextResponse.json({ ok: true, company, backup: report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup failed.";
    await appendPlatformAuditEvent({
      eventType: "developer.reset.backup.failed",
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
