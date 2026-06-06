import { NextRequest, NextResponse } from "next/server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { persistSupplierLineMappings } from "@/lib/vyron-supplier-line-learning";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  }

  const body = (await request.json()) as {
    lineId: string;
    entityType: "ingredient" | "packaging";
    name: string;
    unit: string;
    purchaseCost: number;
    supplierName?: string;
  };

  if (!body?.lineId || !body?.name?.trim()) {
    return NextResponse.json({ ok: false, error: "lineId and name are required." }, { status: 400 });
  }

  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select("id, tenant_id, supplier_name, deleted_at")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  if (!document || document.deleted_at) {
    return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  }

  const tenantId = (document.tenant_id as string) || VYRON_DEFAULT_TENANT_ID;
  const supplierName = body.supplierName?.trim() || (document.supplier_name as string) || "";

  let supplierId: string | null = null;
  if (supplierName) {
    const { data: supplierRow } = await supabase
      .from("vyron_cost_suppliers")
      .select("id")
      .eq("company_id", tenantId)
      .ilike("supplier_name", supplierName)
      .maybeSingle();
    supplierId = (supplierRow?.id as string) || null;
  }

  const purchaseCost = Number(body.purchaseCost || 0);
  const category = body.entityType === "packaging" ? "Packaging" : "Ingredient";
  const unit = body.unit?.trim() || "kg";

  const { data: created, error: insertError } = await supabase
    .from("vyron_cost_ingredients")
    .insert({
      company_id: tenantId,
      ingredient_name: body.name.trim(),
      category,
      supplier_id: supplierId,
      purchase_unit: unit,
      recipe_unit: unit,
      purchase_cost: purchaseCost,
      previous_cost: purchaseCost,
      yield_type: "Standard",
      yield_percent: 100,
      true_unit_cost: purchaseCost,
      current_alert: `Created from invoice ${documentId.slice(0, 8)}`,
      updated_at: new Date().toISOString(),
    })
    .select("id, ingredient_name, purchase_cost")
    .single();

  if (insertError || !created) {
    return NextResponse.json({ ok: false, error: insertError?.message || "Could not create ingredient." }, { status: 500 });
  }

  const entityId = created.id as string;
  const entityName = created.ingredient_name as string;
  const entityType = body.entityType;

  const { data: line } = await supabase
    .from("vyron_document_line_items")
    .select("description, sku_product_code, unit, unit_price")
    .eq("id", body.lineId)
    .eq("document_id", documentId)
    .maybeSingle();

  const sourceDescription = String(line?.description || body.name).trim();

  await supabase
    .from("vyron_document_line_items")
    .update({
      matched_entity_type: entityType,
      matched_entity_id: entityId,
      matched_entity_name: entityName,
      mapping_confidence: 95,
      ignored: false,
    })
    .eq("id", body.lineId)
    .eq("document_id", documentId);

  if (supplierName && sourceDescription) {
    await persistSupplierLineMappings(supabase, {
      tenantId,
      supplierName,
      documentId,
      approvedBy: "review-create-entity",
      isApproval: false,
      lines: [
        {
          description: sourceDescription,
          skuOrProductCode: String(line?.sku_product_code || ""),
          unit: String(line?.unit || unit),
          unitPrice: line?.unit_price !== null && line?.unit_price !== undefined ? Number(line.unit_price) : purchaseCost,
          matchedEntityType: entityType,
          matchedEntityId: entityId,
          matchedEntityName: entityName,
        },
      ],
    });
  }

  return NextResponse.json({
    ok: true,
    entityId,
    entityName,
    entityType,
    matchOption: {
      id: entityId,
      name: entityName,
      entityType,
      currentPrice: Number(created.purchase_cost || purchaseCost),
    },
  });
}
