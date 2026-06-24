import { NextRequest, NextResponse } from "next/server";
import {
  importCentreTemplateCsv,
  type ImportCentreModule,
} from "@/lib/vyron-import-centre-v1";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

function parseModule(value: string | null): ImportCentreModule | null {
  if (value === "raw-materials" || value === "finished-goods" || value === "boms") return value;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireWorkspacePermission("ingredients.view");
    const module = parseModule(request.nextUrl.searchParams.get("module"));
    if (!module) {
      return NextResponse.json({ ok: false, error: "module is required." }, { status: 400 });
    }

    const csv = importCentreTemplateCsv(module);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vyron-${module}-template.csv"`,
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Template download failed.");
  }
}
