import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * BOMs that contain other BOMs.
 *
 * A BOM line stands for one of three things: an ingredient, packaging, or
 * another BOM. The third is new. Everything here is about that case — resolving
 * what a child BOM costs, refusing cycles, refusing deletes that would orphan a
 * parent, and turning a nested structure into the flat list of ingredients a
 * production run actually consumes.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not compute money. A sub-BOM line is arithmetically identical to an
 * ingredient line — quantity x unit cost x wastage — so it carries the child's
 * cost per unit in the line's own unit_cost and flows through calcLineCost and
 * computeRecipeCosts untouched. There is one costing engine, and this is not a
 * second one: a BOM containing no child BOMs takes exactly the same code path,
 * with exactly the same arithmetic, as it did before this file existed.
 */

export const BOM_PURPOSES = ["Finished Good", "Sub-BOM"] as const;
export type BomPurpose = (typeof BOM_PURPOSES)[number];

export const BOM_PURPOSE_LABELS: Record<BomPurpose, string> = {
  "Finished Good": "Finished Good",
  "Sub-BOM": "Sub-BOM / Assembly",
};

export const BOM_PURPOSE_DESCRIPTIONS: Record<BomPurpose, string> = {
  "Finished Good": "This BOM produces a finished product or pack that can be sold.",
  "Sub-BOM": "This BOM is used as a component inside another BOM.",
};

export function normaliseBomPurpose(value: unknown): BomPurpose {
  const raw = String(value ?? "").trim();
  return BOM_PURPOSES.find((p) => p.toLowerCase() === raw.toLowerCase()) ?? "Finished Good";
}

/** The line type a BOM-in-a-BOM line carries. */
export const SUB_BOM_LINE_TYPE = "Sub-BOM";

export function isSubBomLine(line: { child_bom_id?: string | null }) {
  return Boolean(line.child_bom_id);
}

/* --------------------------------------------------------------- child cost */

export type ChildBomSummary = {
  id: string;
  bom_name: string;
  bom_purpose: BomPurpose;
  cost_per_unit: number;
  yield_unit: string | null;
};

/**
 * What one unit of a child BOM costs.
 *
 * cost_per_unit is the BOM's own stored figure — total cost divided by yield —
 * so a parent line for 2 units contributes exactly twice it, through the same
 * multiplication every other line uses.
 *
 * Scoped to the company: a child in another tenant is not found, so it cannot be
 * priced, quite apart from the database refusing to store the reference at all.
 */
export async function loadChildBoms(
  supabase: SupabaseClient,
  companyId: string,
  bomIds: string[]
): Promise<Map<string, ChildBomSummary>> {
  const ids = [...new Set(bomIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("vyron_cost_boms")
    .select("id, bom_name, bom_purpose, cost_per_unit, yield_unit")
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);

  return new Map(
    (data || []).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        bom_name: String(row.bom_name || ""),
        bom_purpose: normaliseBomPurpose(row.bom_purpose),
        cost_per_unit: Number(row.cost_per_unit || 0),
        yield_unit: row.yield_unit ? String(row.yield_unit) : null,
      },
    ])
  );
}

/* ------------------------------------------------------------------- cycles */

export class CircularBomError extends Error {
  readonly path: string[];
  constructor(path: string[]) {
    super("This BOM cannot be added because it would create a circular BOM.");
    this.name = "CircularBomError";
    this.path = path;
  }
}

/**
 * Refuse a child that can reach its own parent.
 *
 * Walks down from the proposed child following child_bom_id. If the parent turns
 * up anywhere in that subtree, adding the line would close a loop — directly
 * (A -> A), at two levels (A -> B -> A), or at any depth. The walk is breadth
 * first over distinct BOM ids, so a diamond is visited once and a pre-existing
 * cycle elsewhere in the data cannot make it run forever.
 *
 * Called before the insert, so nothing is partially saved.
 */
export async function assertNoCircularBom(
  supabase: SupabaseClient,
  companyId: string,
  parentBomId: string,
  childBomId: string
): Promise<void> {
  if (parentBomId === childBomId) {
    throw new CircularBomError([parentBomId, childBomId]);
  }

  const seen = new Set<string>([childBomId]);
  let frontier = [childBomId];
  const cameFrom = new Map<string, string>();

  while (frontier.length) {
    const { data, error } = await supabase
      .from("vyron_cost_bom_lines")
      .select("bom_id, child_bom_id")
      .eq("company_id", companyId)
      .in("bom_id", frontier)
      .not("child_bom_id", "is", null);
    if (error) throw new Error(error.message);

    const next: string[] = [];
    for (const row of data || []) {
      const child = String(row.child_bom_id);
      if (!cameFrom.has(child)) cameFrom.set(child, String(row.bom_id));

      if (child === parentBomId) {
        // Rebuild the loop for the message.
        const path = [parentBomId];
        let cursor: string | undefined = String(row.bom_id);
        const guard = new Set<string>();
        while (cursor && cursor !== childBomId && !guard.has(cursor)) {
          guard.add(cursor);
          path.unshift(cursor);
          cursor = cameFrom.get(cursor);
        }
        path.unshift(childBomId);
        path.unshift(parentBomId);
        throw new CircularBomError(path);
      }

      if (!seen.has(child)) {
        seen.add(child);
        next.push(child);
      }
    }
    frontier = next;
  }
}

/* --------------------------------------------------------- delete protection */

export type ParentBomReference = { id: string; bom_name: string };

/** Which BOMs use this one as a component. */
export async function findParentBoms(
  supabase: SupabaseClient,
  companyId: string,
  bomId: string
): Promise<ParentBomReference[]> {
  const { data, error } = await supabase
    .from("vyron_cost_bom_lines")
    .select("bom_id")
    .eq("company_id", companyId)
    .eq("child_bom_id", bomId);
  if (error) throw new Error(error.message);

  const parentIds = [...new Set((data || []).map((r) => String(r.bom_id)))];
  if (!parentIds.length) return [];

  const { data: boms, error: bomErr } = await supabase
    .from("vyron_cost_boms")
    .select("id, bom_name")
    .eq("company_id", companyId)
    .in("id", parentIds);
  if (bomErr) throw new Error(bomErr.message);

  return (boms || []).map((b) => ({ id: String(b.id), bom_name: String(b.bom_name || "") }));
}

export class BomInUseError extends Error {
  readonly parents: ParentBomReference[];
  constructor(parents: ParentBomReference[]) {
    super(
      `Cannot delete this BOM because it is used by another BOM: ${parents.map((p) => p.bom_name).join(", ")}.`
    );
    this.name = "BomInUseError";
    this.parents = parents;
  }
}

/* ---------------------------------------------------------------- explosion */

export type ExplodableLine = {
  id?: string;
  line_type: string;
  ingredient_id: string | null;
  child_bom_id?: string | null;
  line_name: string;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  wastage_percent?: number | null;
};

export type ExplodedLine = ExplodableLine & {
  /** How the line reached the run, for the operator to read on the run. */
  via?: string | null;
};

/**
 * Flatten a BOM's lines into what production will actually consume.
 *
 * WHY EXPLOSION, AND NOT CONSUMING THE CHILD AS STOCK
 * The stock model keys every stock item on an entity: an ingredient id, a
 * packaging id, or a product id for a finished good. A Sub-BOM has no product
 * by definition, so it has no stock item and there is nothing to consume. A run
 * line with no ingredient resolves to stock_item_id = null in
 * resolveStockItemForLine, and a run that reaches completion consuming nothing
 * is exactly the silent-underconsumption failure the engine already refuses to
 * create. So a sub-assembly is expanded into the ingredients and packaging it is
 * made of, scaled by the quantity the parent asked for.
 *
 * A child that IS a finished good in its own right — its own product and its own
 * stock item — is a different case, and is left to the caller: `stockedChildIds`
 * names those, and they are passed through untouched so the existing
 * finished-goods stock path handles them rather than being expanded.
 *
 * Quantities multiply down the tree, so 2 of a child that uses 0.125 kg of rice
 * consumes 0.25 kg. Wastage stays on the line it was recorded against.
 */
export async function explodeBomLines(
  supabase: SupabaseClient,
  companyId: string,
  bomId: string,
  options: { multiplier?: number; stockedChildIds?: Set<string>; depth?: number; visited?: Set<string> } = {}
): Promise<ExplodedLine[]> {
  const multiplier = options.multiplier ?? 1;
  const depth = options.depth ?? 0;
  const visited = options.visited ?? new Set<string>();

  if (depth > 20) {
    throw new Error("BOM nesting is deeper than 20 levels — refusing to expand further.");
  }
  if (visited.has(bomId)) {
    throw new CircularBomError([...visited, bomId]);
  }
  visited.add(bomId);

  const { data: lines, error } = await supabase
    .from("vyron_cost_bom_lines")
    .select("id, line_type, ingredient_id, child_bom_id, line_name, quantity, unit, unit_cost, wastage_percent")
    .eq("company_id", companyId)
    .eq("bom_id", bomId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const out: ExplodedLine[] = [];

  for (const raw of lines || []) {
    const line = raw as unknown as ExplodableLine;
    const scaledQty = Number(line.quantity || 0) * multiplier;

    if (!line.child_bom_id) {
      out.push({ ...line, quantity: scaledQty });
      continue;
    }

    // A child held as its own finished good keeps its identity so the existing
    // stock path can consume it.
    if (options.stockedChildIds?.has(String(line.child_bom_id))) {
      out.push({ ...line, quantity: scaledQty });
      continue;
    }

    const nested = await explodeBomLines(supabase, companyId, String(line.child_bom_id), {
      multiplier: scaledQty,
      stockedChildIds: options.stockedChildIds,
      depth: depth + 1,
      visited: new Set(visited),
    });
    for (const n of nested) {
      out.push({ ...n, via: n.via ? `${line.line_name} › ${n.via}` : line.line_name });
    }
  }

  visited.delete(bomId);
  return out;
}
