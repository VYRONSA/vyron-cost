/**
 * One-shot helper: inserts requireWorkspacePermission calls into API route handlers.
 * Run: node scripts/apply-api-permission-guards.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "src/app/api");

const GUARD_IMPORT = `import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";`;

/** file path relative to src/app/api -> { GET?, POST?, PATCH?, PUT?, DELETE? } */
const RULES = {
  "customer-invoices/route.ts": { GET: "invoices.view", POST: "invoices.create" },
  "customer-invoices/[id]/route.ts": { GET: "invoices.view" },
  "customer-invoices/[id]/post/route.ts": { POST: "invoices.reverse" },
  "purchase-orders/route.ts": { GET: "purchase_orders.view", POST: "purchase_orders.create" },
  "purchase-orders/[id]/route.ts": { GET: "purchase_orders.view", PUT: "purchase_orders.edit", PATCH: "purchase_orders.approve" },
  "purchase-orders/open/route.ts": { GET: "purchase_orders.view" },
  "purchase-orders/approval-rules/route.ts": { GET: "purchase_orders.view", POST: "purchase_orders.edit", PATCH: "purchase_orders.edit" },
  "goods-receipts/route.ts": { GET: "goods_receipts.view", POST: "goods_receipts.create" },
  "goods-receipts/[id]/route.ts": { GET: "goods_receipts.view", PATCH: "goods_receipts.create" },
  "inventory/stock/route.ts": { GET: "inventory.view", POST: "inventory.adjustments.post" },
  "inventory/stock/[id]/route.ts": { GET: "inventory.view", PATCH: "inventory.adjustments.post" },
  "inventory/ledger/route.ts": { GET: "inventory.view" },
  "inventory/counts/route.ts": { GET: "inventory.view", POST: "inventory.counts.create" },
  "inventory/counts/[id]/route.ts": { GET: "inventory.view", PATCH: "inventory.counts.approve" },
  "inventory/stats/route.ts": { GET: "inventory.view" },
  "inventory/alerts/route.ts": { GET: "inventory.view" },
  "inventory/alerts/create-po/route.ts": { POST: "purchase_orders.create" },
  "inventory/finished-goods/route.ts": { GET: "inventory.view" },
  "inventory/opening-stock/route.ts": { GET: "inventory.view", POST: "inventory.adjustments.post" },
  "inventory/stock-movements/route.ts": { GET: "inventory.view", POST: "inventory.adjustments.post" },
  "production/runs/route.ts": { GET: "manufacturing.view", POST: "manufacturing.runs.create" },
  "production/runs/[id]/route.ts": { GET: "manufacturing.view", PATCH: "manufacturing.runs.create" },
  "production/runs/[id]/start/route.ts": { POST: "manufacturing.runs.start" },
  "production/runs/[id]/complete/route.ts": { POST: "manufacturing.runs.complete" },
  "production/runs/[id]/reverse/route.ts": { POST: "manufacturing.runs.reverse" },
  "production/runs/[id]/cancel/route.ts": { POST: "manufacturing.runs.create" },
  "production/runs/[id]/approve/route.ts": { POST: "manufacturing.runs.complete" },
  "production/runs/[id]/validate-stock/route.ts": { POST: "manufacturing.view" },
  "production/stats/route.ts": { GET: "manufacturing.view" },
  "production/insights/route.ts": { GET: "manufacturing.view" },
  "production/variances/route.ts": { GET: "manufacturing.view" },
  "production/boms/route.ts": { GET: "manufacturing.view" },
  "production/finished-goods/route.ts": { GET: "manufacturing.view" },
  "recipes/[id]/lines/route.ts": { GET: "boms.view", POST: "boms.edit" },
  "recipes/[id]/lines/[lineId]/route.ts": { PATCH: "boms.edit", DELETE: "boms.delete" },
  "integrations/xero/connection/route.ts": { GET: "xero.view", DELETE: "xero.connect" },
  "integrations/xero/connect/route.ts": { GET: "xero.connect" },
  "integrations/xero/mapping/route.ts": { GET: "xero.view", PATCH: "xero.mapping.edit", POST: "xero.mapping.edit" },
  "integrations/xero/sync-queue/route.ts": { GET: "xero.view", POST: "xero.sync" },
  "integrations/xero/callback/route.ts": { GET: "xero.connect" },
  "reports/sales-intelligence/route.ts": { GET: "reports.view" },
  "reports/product-intelligence/route.ts": { GET: "reports.view" },
};

function ensureImport(content) {
  if (content.includes("requireWorkspacePermission")) return content;
  const lines = content.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("import ")) lastImport = i;
  }
  if (lastImport === -1) return GUARD_IMPORT + "\n" + content;
  lines.splice(lastImport + 1, 0, GUARD_IMPORT);
  return lines.join("\n");
}

function injectGuard(handlerBody, permission) {
  const guard = `    await requireWorkspacePermission("${permission}");`;
  if (handlerBody.includes(`requireWorkspacePermission("${permission}")`)) return handlerBody;
  const tryIdx = handlerBody.indexOf("  try {");
  if (tryIdx !== -1) {
    return handlerBody.replace("  try {", `  try {\n${guard}`);
  }
  const braceIdx = handlerBody.indexOf("{");
  if (braceIdx === -1) return handlerBody;
  const afterBrace = handlerBody.indexOf("\n", braceIdx);
  return handlerBody.slice(0, afterBrace + 1) + guard + "\n" + handlerBody.slice(afterBrace + 1);
}

function patchHandler(content, method, permission) {
  const re = new RegExp(`export async function ${method}\\([^)]*\\)\\s*\\{`, "g");
  let match;
  let result = content;
  const offsets = [];
  while ((match = re.exec(content)) !== null) {
    offsets.push(match.index);
  }
  // patch from end to preserve indices
  for (let i = offsets.length - 1; i >= 0; i--) {
    const start = offsets[i];
    const openBrace = content.indexOf("{", start);
    let depth = 0;
    let end = openBrace;
    for (let j = openBrace; j < content.length; j++) {
      if (content[j] === "{") depth++;
      if (content[j] === "}") {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    const handler = content.slice(start, end);
    if (handler.includes(`requireWorkspacePermission("${permission}")`)) continue;
    const patched = injectGuard(handler, permission);
    result = result.slice(0, start) + patched + result.slice(end);
    content = result;
  }
  return result;
}

function useWorkspaceAccessError(content) {
  return content.replace(
    /return NextResponse\.json\(\{ ok: false, error: error instanceof Error \? error\.message : "([^"]+)" \}, \{ status: 500 \}\);/g,
    'return workspaceAccessErrorResponse(error, "$1");'
  );
}

let patched = 0;
for (const [rel, methods] of Object.entries(RULES)) {
  const file = join(ROOT, rel);
  let content = readFileSync(file, "utf8");
  const original = content;
  content = ensureImport(content);
  for (const [method, permission] of Object.entries(methods)) {
    content = patchHandler(content, method, permission);
  }
  content = useWorkspaceAccessError(content);
  if (content !== original) {
    writeFileSync(file, content);
    patched++;
    console.log("patched", rel);
  }
}

// Special: customer-invoices [id] PATCH action-based guards
const invoiceIdRoute = join(ROOT, "customer-invoices/[id]/route.ts");
let inv = readFileSync(invoiceIdRoute, "utf8");
if (!inv.includes("invoices.reverse") && inv.includes("body.action === \"approve\"")) {
  inv = ensureImport(inv);
  inv = inv.replace(
    `  try {
    if (body.action === "approve") {`,
    `  try {
    if (body.action === "approve") {
      await requireWorkspacePermission("invoices.reverse");`
  );
  inv = inv.replace(
    `    if (body.action === "send") {`,
    `    if (body.action === "send") {
      await requireWorkspacePermission("invoices.email");`
  );
  inv = inv.replace(
    `    if (body.status) {`,
    `    if (body.status) {
      await requireWorkspacePermission("invoices.create");`
  );
  inv = inv.replace(
    /if \(body\.action === "(paid|cancel)"\) \{/g,
    (m) => `${m}\n      await requireWorkspacePermission("invoices.create");`
  );
  if (!inv.includes('requireWorkspacePermission("invoices.view")')) {
    inv = patchHandler(inv, "GET", "invoices.view");
  }
  inv = useWorkspaceAccessError(inv);
  writeFileSync(invoiceIdRoute, inv);
  console.log("patched customer-invoices/[id]/route.ts (actions)");
}

console.log(`Done. ${patched} files updated.`);
