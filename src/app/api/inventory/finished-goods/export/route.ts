import { NextRequest, NextResponse } from "next/server";
import {
  buildFinishedGoodsExportFileName,
  listFinishedGoodsExportRows,
  parseFinishedGoodsExportFilters,
  toFinishedGoodsCsvWithCentre,
  toFinishedGoodsPdf,
  toFinishedGoodsXlsx,
  toFinishedGoodsXlsxWithCentre,
} from "@/lib/vyron-finished-goods-export";
import { writeInventoryAudit } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { inventoryCompanyContextFromRequest } from "@/lib/vyron-inventory-api-context";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { BrandingService } from "@/lib/platform/branding";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  if (forwarded.trim()) {
    const [first] = forwarded.split(",");
    return first?.trim() || null;
  }
  const realIp = request.headers.get("x-real-ip") || "";
  return realIp.trim() || null;
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    const session = await requireWorkspacePermission("manufacturing.view");
    await requireWorkspacePermission("finished_goods.export");

    const format = String(request.nextUrl.searchParams.get("format") || "xlsx").toLowerCase();
    if (format !== "csv" && format !== "xlsx" && format !== "pdf") {
      return NextResponse.json({ ok: false, error: "Unsupported export format." }, { status: 400 });
    }

    const companyId = await resolveApiCompanyIdWithContext(
      supabase,
      inventoryCompanyContextFromRequest(request)
    );

    const filters = parseFinishedGoodsExportFilters(request.nextUrl.searchParams);
    if (filters.scope === "selected" && filters.selectedIds.length === 0) {
      return NextResponse.json({ ok: false, error: "No selected finished goods provided." }, { status: 400 });
    }

    const startedAt = Date.now();
    const rows = companyId ? await listFinishedGoodsExportRows(supabase, companyId, filters) : [];

    const workspaceSession = await getServerWorkspaceSession();
    const generatedAtIso = new Date().toISOString();
    const branding = companyId ? await BrandingService.getBrandingByCompanyId(companyId) : null;
    const companyName = branding?.companyName || "VYRON Client";
    const tradingName = branding?.tradingName || null;
    const logoUrl = branding?.logoUrl || null;
    const logoDataUrl = branding?.logoDataUrl || null;
    const userName = `${workspaceSession?.firstName || "Workspace"} ${workspaceSession?.surname || "User"}`.trim();

    if (companyId) {
      await writeInventoryAudit(supabase, {
        companyId,
        eventType: "Finished Goods Exported",
        actor: session.userId || "user",
        detail: "Finished goods export generated.",
        referenceType: "finished_goods_export",
        metadata: {
          userId: session.userId,
          workspaceId: session.workspaceId || null,
          companyId,
          exportType: format === "csv" ? "CSV" : format === "pdf" ? "PDF" : "Excel",
          exportScope: filters.scope,
          durationMs: Date.now() - startedAt,
          includeZeroBalance: filters.includeZeroBalance,
          exportTimestamp: new Date().toISOString(),
          exportedRowCount: rows.length,
          filters,
          clientIp: getClientIp(request),
          userAgent: request.headers.get("user-agent") || null,
        },
      });
    }

    if (format === "pdf") {
      const fileName = buildFinishedGoodsExportFileName("xlsx").replace(/\.xlsx$/i, ".pdf");
      const pdf = toFinishedGoodsPdf(rows, {
        companyName,
        tradingName,
        logoUrl,
        logoDataUrl,
        userName,
        generatedAtIso,
        filters,
      });
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=\"${fileName}\"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "csv") {
      const fileName = buildFinishedGoodsExportFileName("csv");
      const csv = toFinishedGoodsCsvWithCentre(rows, {
        companyName,
        tradingName,
        logoUrl,
        logoDataUrl,
        userName,
        generatedAtIso,
        filters,
      });
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${fileName}\"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const fileName = buildFinishedGoodsExportFileName("xlsx");
    const workbook = await toFinishedGoodsXlsxWithCentre(rows, {
      companyName,
      tradingName,
      logoUrl,
      logoDataUrl,
      userName,
      generatedAtIso,
      filters,
    });

    return new NextResponse(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Finished goods export failed.");
  }
}
