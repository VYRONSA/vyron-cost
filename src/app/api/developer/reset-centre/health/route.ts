import { NextRequest, NextResponse } from "next/server";
import { developerApiUnauthorized, requirePlatformSessionFromRequest } from "@/lib/vyron-platform-auth";
import {
  isDeveloperResetPasswordConfigured,
  isResetModuleKey,
  resolveCompanyForReset,
  verifyDeveloperPassword,
} from "@/lib/vyron-developer-reset";
import { getLastBackup, verifyBackup, verifyPreviewToken } from "@/lib/vyron-developer-backup";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type HealthCheck = { key: string; label: string; ok: boolean; detail: string };

/**
 * Pre-flight gate run immediately before a reset. Returns every check with its
 * verdict so the operator sees exactly which condition blocks execution.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePlatformSessionFromRequest(request, ["PLATFORM_ADMIN"]);
  } catch (error) {
    return developerApiUnauthorized(
      error instanceof Error ? error.message : "Developer authentication required."
    );
  }

  let body: {
    companyId?: string;
    module?: string;
    password?: string;
    previewToken?: string;
    backupLocation?: string;
    acknowledgedNoBackup?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const companyId = String(body.companyId || "").trim();
  const moduleKey = String(body.module || "").trim();
  const checks: HealthCheck[] = [];

  // 1. company id present
  checks.push({
    key: "company_id",
    label: "Company ID supplied",
    ok: Boolean(companyId),
    detail: companyId || "No company selected.",
  });

  // 2. module valid
  checks.push({
    key: "module",
    label: "Reset module valid",
    ok: isResetModuleKey(moduleKey),
    detail: isResetModuleKey(moduleKey) ? moduleKey : "Unknown module.",
  });

  // 3. supervisor password
  const passwordConfigured = isDeveloperResetPasswordConfigured();
  const passwordOk = passwordConfigured && verifyDeveloperPassword(String(body.password || ""));
  checks.push({
    key: "password",
    label: "Developer password verified",
    ok: passwordOk,
    detail: !passwordConfigured
      ? "VYRON_DEV_RESET_PASSWORD_HASH is not configured."
      : passwordOk
        ? "Verified."
        : "Password rejected.",
  });

  // 4. target company resolves
  let companyName = "";
  let companyOk = false;
  if (companyId) {
    try {
      const company = await resolveCompanyForReset(companyId);
      companyName = company.name;
      companyOk = true;
    } catch (error) {
      companyName = error instanceof Error ? error.message : "Lookup failed.";
    }
  }
  checks.push({
    key: "company_found",
    label: "Target company found",
    ok: companyOk,
    detail: companyOk ? companyName : companyName || "Not checked.",
  });

  // 5. transactional path available (the RPC is installed)
  let transactionOk = false;
  let transactionDetail = "Supabase service role is not configured.";
  const supabase = getSupabaseAdmin();
  if (supabase && companyOk) {
    const probe = await supabase.rpc("vyron_dev_reset_preview", {
      p_company_id: companyId,
      p_module: isResetModuleKey(moduleKey) ? moduleKey : "factory",
    });
    transactionOk = !probe.error;
    transactionDetail = probe.error
      ? `Reset functions not installed (${probe.error.code}). Apply supabase/pcp-045-developer-reset-centre.sql.`
      : "Transactional reset functions available.";
  }
  checks.push({
    key: "transaction",
    label: "Transaction available",
    ok: transactionOk,
    detail: transactionDetail,
  });

  // 6. preview still current
  const preview = verifyPreviewToken(String(body.previewToken || ""), companyId, moduleKey);
  checks.push({
    key: "preview",
    label: "Preview still current",
    ok: preview.ok,
    detail: preview.ok
      ? `Issued ${Math.round(preview.ageMs / 1000)}s ago — ${preview.total.toLocaleString()} rows in scope.`
      : preview.reason,
  });

  // 7. backup taken, or its absence acknowledged
  let backupOk = false;
  let backupDetail = "No backup for this company.";
  const backupLocation = String(body.backupLocation || "").trim();
  if (backupLocation && companyId) {
    const verified = await verifyBackup(backupLocation, companyId);
    backupOk = verified.ok;
    backupDetail = verified.ok ? `Verified at ${backupLocation}` : verified.reason || "Backup could not be verified.";
  } else if (companyOk) {
    const last = await getLastBackup(companyName, companyId);
    if (last.exists) {
      backupOk = true;
      backupDetail = `Existing backup at ${last.report.location}`;
    } else if (!last.writable) {
      backupDetail = last.reason || "Backup location is not writable.";
    }
  }
  if (!backupOk && body.acknowledgedNoBackup) {
    backupOk = true;
    backupDetail = "No backup — operator acknowledged this reset cannot be undone.";
  }
  checks.push({
    key: "backup",
    label: "Backup taken or absence acknowledged",
    ok: backupOk,
    detail: backupDetail,
  });

  const ready = checks.every((c) => c.ok);
  return NextResponse.json({
    ok: true,
    ready,
    checks,
    blockedBy: ready ? null : checks.filter((c) => !c.ok).map((c) => c.label),
  });
}
