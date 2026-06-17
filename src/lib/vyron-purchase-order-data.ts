import { supabase } from "@/lib/supabase";
import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";
import type { PurchaseOrder } from "@/lib/vyron-cost-data";
import { getPurchaseOrders, getSuppliers } from "@/lib/vyron-cost-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type PurchaseOrderLine = {
  id: string;
  po_id: string;
  item_type: "ingredient" | "product" | "packaging";
  item_id?: string | null;
  item_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  line_total: number;
  notes?: string | null;
};

export type PurchaseOrderDetail = PurchaseOrder & {
  order_date?: string;
  notes?: string | null;
  lines: PurchaseOrderLine[];
};

const demoPoLines: Record<string, PurchaseOrderLine[]> = {
  "demo-po-1": [
    { id: "l1", po_id: "demo-po-1", item_type: "ingredient", item_name: "Chicken Fillet", quantity: 120, unit: "kg", unit_cost: 95, line_total: 11400 },
    { id: "l2", po_id: "demo-po-1", item_type: "ingredient", item_name: "Pastry Shell", quantity: 200, unit: "unit", unit_cost: 4.5, line_total: 900 },
  ],
  "demo-po-2": [
    { id: "l3", po_id: "demo-po-2", item_type: "packaging", item_name: "Pie Box", quantity: 500, unit: "unit", unit_cost: 2.2, line_total: 1100 },
    { id: "l4", po_id: "demo-po-2", item_type: "ingredient", item_name: "Beef Trim", quantity: 80, unit: "kg", unit_cost: 68, line_total: 5440 },
  ],
  "demo-po-3": [
    { id: "l5", po_id: "demo-po-3", item_type: "ingredient", item_name: "Avocado", quantity: 40, unit: "kg", unit_cost: 42, line_total: 1680 },
  ],
};

export const demoPurchaseOrderDetails: PurchaseOrderDetail[] = [
  {
    id: "demo-po-1",
    company_id: HANDCRAFTED_COMPANY_ID,
    po_number: "PO-1001",
    supplier_name_snapshot: "Protein Direct",
    status: "Invoice Variance",
    expected_total: 8200,
    invoice_total: 9500,
    variance: 1300,
    order_date: "2026-05-12",
    notes: "Chicken fillet price increase pending approval.",
    lines: demoPoLines["demo-po-1"],
  },
  {
    id: "demo-po-2",
    company_id: HANDCRAFTED_COMPANY_ID,
    po_number: "PO-1002",
    supplier_name_snapshot: "Cape Dry Goods",
    status: "Matched",
    expected_total: 6300,
    invoice_total: 6300,
    variance: 0,
    order_date: "2026-05-18",
    notes: "Matched to invoice.",
    lines: demoPoLines["demo-po-2"],
  },
  {
    id: "demo-po-3",
    company_id: HANDCRAFTED_COMPANY_ID,
    po_number: "PO-1003",
    supplier_name_snapshot: "Fresh Produce Co",
    status: "Review",
    expected_total: 4200,
    invoice_total: 4620,
    variance: 420,
    order_date: "2026-05-22",
    notes: "Awaiting receipt confirmation.",
    lines: demoPoLines["demo-po-3"],
  },
];

function synthesizeLines(po: PurchaseOrder): PurchaseOrderLine[] {
  const demo = demoPurchaseOrderDetails.find((item) => item.po_number === po.po_number);
  if (demo) return demo.lines;
  return [
    {
      id: `${po.id}-line-1`,
      po_id: po.id,
      item_type: "ingredient",
      item_name: "General supply",
      quantity: 1,
      unit: "lot",
      unit_cost: Number(po.expected_total || 0),
      line_total: Number(po.expected_total || 0),
    },
  ];
}

export async function getPurchaseOrderList(): Promise<PurchaseOrderDetail[]> {
  const { useDemo } = await workspaceScope();
  const orders = await getPurchaseOrders(200);
  if (orders.length) {
    return orders.map((po) => {
      const demo = useDemo
        ? demoPurchaseOrderDetails.find((d) => d.po_number === po.po_number || d.id === po.id)
        : undefined;
      return {
        ...po,
        order_date: demo?.order_date || new Date().toISOString().slice(0, 10),
        notes: demo?.notes || null,
        lines: demo?.lines || synthesizeLines(po),
      };
    });
  }
  return useDemo ? demoPurchaseOrderDetails : [];
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrderDetail | null> {
  const list = await getPurchaseOrderList();
  return list.find((po) => po.id === id) || null;
}

export async function getPurchaseOrderSuppliers() {
  const { useDemo } = await workspaceScope();
  const suppliers = await getSuppliers(200);
  if (suppliers.length) return suppliers;
  return useDemo
    ? [
        { id: "s1", supplier_name: "Protein Direct", category: "Protein", contact_email: null, invoice_email: null, risk_status: "High", last_price_movement: 12.4 },
        { id: "s2", supplier_name: "Cape Dry Goods", category: "Dry Goods", contact_email: null, invoice_email: null, risk_status: "Stable", last_price_movement: 2.1 },
      ]
    : [];
}

export async function savePurchaseOrderHeader(
  po: Partial<PurchaseOrderDetail> & { po_number: string; status: string; expected_total: number; invoice_total: number },
  companyId: string
) {
  if (!supabase || companyId === "demo-company") return po as PurchaseOrderDetail;

  const payload = {
    company_id: companyId,
    supplier_id: po.supplier_id || null,
    po_number: po.po_number,
    supplier_name_snapshot: po.supplier_name_snapshot || null,
    status: po.status,
    expected_total: po.expected_total,
    invoice_total: po.invoice_total,
  };

  if (po.id && !po.id.startsWith("demo-")) {
    const { data, error } = await supabase
      .from("vyron_cost_purchase_orders")
      .update(payload)
      .eq("id", po.id)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { ...data, lines: po.lines || [], order_date: po.order_date, notes: po.notes } as PurchaseOrderDetail;
  }

  const { data, error } = await supabase.from("vyron_cost_purchase_orders").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return { ...data, lines: po.lines || [], order_date: po.order_date, notes: po.notes } as PurchaseOrderDetail;
}

export async function deletePurchaseOrder(id: string, companyId?: string) {
  if (!supabase || id.startsWith("demo-")) return;
  let query = supabase.from("vyron_cost_purchase_orders").delete().eq("id", id);
  if (companyId) query = query.eq("company_id", companyId);
  await query;
}

export function calculatePoLineTotal(quantity: number, unitCost: number) {
  return Number((quantity * unitCost).toFixed(2));
}

export function calculatePoTotals(lines: PurchaseOrderLine[]) {
  const expected = lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0);
  return { expected, invoice: expected, variance: 0 };
}
