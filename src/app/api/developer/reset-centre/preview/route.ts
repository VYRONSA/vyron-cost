import { NextRequest, NextResponse } from "next/server";
import { developerApiUnauthorized, requirePlatformSessionFromRequest } from "@/lib/vyron-platform-auth";
import {
  isDeveloperResetPasswordConfigured,
  isResetModuleKey,
  listResetAudit,
  previewReset,
  resolveCompanyForReset,
  verifyDeveloperPassword,
} from "@/lib/vyron-developer-reset";
import { getLastBackup, issuePreviewToken } from "@/lib/vyron-developer-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only preview of what a reset module would delete for one company.
 * Requires an authenticated PLATFORM_ADMIN session plus the supervisor password.
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

  let body: { companyId?: string; module?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  // The password is verified on every call and never echoed back.
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
    const rows = await previewReset(companyId, moduleKey);
    const audit = await listResetAudit(companyId);
    const totalRows = rows.reduce((sum, row) => sum + row.row_count, 0);
    const backup = await getLastBackup(company.name, companyId);

    return NextResponse.json({
      ok: true,
      company,
      module: moduleKey,
      rows,
      totalRows,
      audit,
      backup,
      // Binds this preview to the company, module and moment. Execution refuses a stale token.
      previewToken: issuePreviewToken(companyId, moduleKey, totalRows),
      actor: { email: session.email },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Preview failed." },
      { status: 500 }
    );
  }
}
