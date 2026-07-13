import { NextRequest, NextResponse } from "next/server";
import {
  buildFinishedGoodsExportFileName,
  listFinishedGoodsExportRows,
  parseFinishedGoodsExportFilters,
  toFinishedGoodsCsv,
  toFinishedGoodsXlsx,
} from "@/lib/vyron-finished-goods-export";
import { writeInventoryAudit } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { inventoryCompanyContextFromRequest } from "@/lib/vyron-inventory-api-context";
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
    if (format !== "csv" && format !== "xlsx") {
      return NextResponse.json({ ok: false, error: "Unsupported export format." }, { status: 400 });
    }

    const companyId = await resolveApiCompanyIdWithContext(
      supabase,
      inventoryCompanyContextFromRequest(request)
    );

    const filters = parseFinishedGoodsExportFilters(request.nextUrl.searchParams);
    const rows = companyId ? await listFinishedGoodsExportRows(supabase, companyId, filters) : [];

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
          exportType: format === "csv" ? "CSV" : "Excel",
          exportTimestamp: new Date().toISOString(),
          exportedRowCount: rows.length,
          filters,
          clientIp: getClientIp(request),
          userAgent: request.headers.get("user-agent") || null,
        },
      });
    }

    if (format === "csv") {
      const fileName = buildFinishedGoodsExportFileName("csv");
      const csv = `\uFEFF${toFinishedGoodsCsv(rows)}`;
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${fileName}\"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const fileName = buildFinishedGoodsExportFileName("xlsx");
  const workbook = await toFinishedGoodsXlsx(rows);

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
