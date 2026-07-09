import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  process.env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^"|"$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function workspaceCookieHeader(client, session) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  const sessionValue = encodeURIComponent(JSON.stringify(session));
  return `vyron_cost_active_client=${clientValue}; vyron_workspace_user_session=${sessionValue}`;
}

async function ensureSchema() {
  const { error } = await supabase.from("vyron_customer_invoices").select("stock_reversed").limit(1);
  if (!error) return;
  if (String(error.code || "") === "PGRST205" && String(error.message || "").includes("vyron_customer_invoices")) {
    throw new Error(
      "vyron_customer_invoices table is missing in the connected Supabase project. Apply src/supabase/migrations/20260605_manufacturing_customer_invoices_stock.sql and src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql, then restart PostgREST/schema cache."
    );
  }
  if (String(error.message).includes("stock_reversed")) {
    throw new Error(
      "vyron_customer_invoices.stock_reversed is missing. Apply src/supabase/migrations/20260617_invoice_stock_reversal.sql and src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql in Supabase, then re-run."
    );
  }
  throw error;
}

async function main() {
  await ensureSchema();

  const { data: company, error: companyError } = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `Invoice Stock Test ${Date.now()}`, trading_name: "Invoice Stock Test" })
    .select("*")
    .single();
  if (companyError) throw companyError;

  const { data: workspace, error: wsError } = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: company.id,
      company_name: company.name,
      trading_name: company.trading_name,
      package_name: "Professional",
      status: "Setup",
      user_limit: 5,
    })
    .select("*")
    .single();
  if (wsError) throw wsError;

  const ownerEmail = `invoice-owner-${Date.now()}@example.com`;
  const ownerPassword = "Invoice123!";

  const ownerAuth = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { first_name: "Invoice", surname: "Owner" },
  });
  if (ownerAuth.error || !ownerAuth.data.user?.id) {
    throw new Error(ownerAuth.error?.message || "Owner setup failed");
  }
  const ownerUserId = ownerAuth.data.user.id;

  const workspaceOwner = await supabase
    .from("vyron_workspaces")
    .update({ owner_user_id: ownerUserId, contact_email: ownerEmail })
    .eq("id", workspace.id);
  if (workspaceOwner.error) throw workspaceOwner.error;

  const profileUpsert = await supabase.from("vyron_user_profiles").upsert(
    {
      id: ownerUserId,
      email: ownerEmail,
      first_name: "Invoice",
      surname: "Owner",
      status: "Active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profileUpsert.error) throw profileUpsert.error;

  const membershipInsert = await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspace.id,
    user_id: ownerUserId,
    role: "OWNER",
    status: "Active",
    joined_at: new Date().toISOString(),
  });
  if (membershipInsert.error && !String(membershipInsert.error.message || "").includes("duplicate key")) {
    throw membershipInsert.error;
  }

  const ownerLogin = await fetch(`${base}/api/workspace/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
  }).then((r) => r.json());
  if (!ownerLogin.ok) throw new Error(`Owner login failed: ${ownerLogin.error}`);

  const cookie = workspaceCookieHeader(ownerLogin.client, ownerLogin.session);
  const headers = { "Content-Type": "application/json", Cookie: cookie };

  const productRes = await fetch(`${base}/api/products`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      product_name: "Stock Test Finished Good",
      product_category: "Finished Goods",
      selling_price: 12,
      total_cost: 5,
      target_gp: 35,
    }),
  });
  const productPayload = await productRes.json();
  if (!productPayload.ok || !productPayload.product?.id) {
    throw new Error(`Create product failed: ${productPayload.error || productRes.status}`);
  }
  const product = productPayload.product;

  const openingRes = await fetch(`${base}/api/inventory/stock`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "create",
      entityType: "finished_goods",
      entityId: product.id,
      description: product.product_name,
      itemCode: `FG-STOCK-${Date.now()}`,
      currentCost: 5,
      openingQty: 100,
      openingDate: "2026-01-01",
      openingNote: "Test opening balance",
    }),
  });
  const opening = await openingRes.json();
  if (!opening.ok) throw new Error(`Opening stock failed: ${opening.error}`);
  console.log("POST /api/inventory/stock", "ok", "opening qty 100");

  const { data: stockAfterOpen } = await supabase
    .from("vyron_cost_stock_items")
    .select("id, qty_on_hand")
    .eq("company_id", company.id)
    .eq("entity_id", product.id)
    .single();
  if (Number(stockAfterOpen?.qty_on_hand) !== 100) {
    throw new Error(`Expected opening stock 100, got ${stockAfterOpen?.qty_on_hand}`);
  }

  const duplicateOpen = await fetch(`${base}/api/inventory/stock`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "create",
      entityType: "finished_goods",
      entityId: product.id,
      description: product.product_name,
      itemCode: `FG-STOCK-DUP-${Date.now()}`,
      currentCost: 5,
      openingQty: 50,
    }),
  });
  const duplicate = await duplicateOpen.json();
  if (duplicate.ok) throw new Error("Duplicate opening stock should be blocked");
  console.log("Opening stock idempotency", "ok");

  const createRes = await fetch(`${base}/api/customer-invoices`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      customerName: "Stock Test Customer",
      lines: [
        {
          productId: product.id,
          productName: product.product_name,
          quantity: 10,
          sellingPrice: 12,
          costPerUnit: 5,
        },
      ],
    }),
  });
  const created = await createRes.json();
  if (!created.ok) throw new Error(`Create invoice failed: ${created.error}`);
  const invoiceId = created.invoice.id;
  console.log("POST /api/customer-invoices", "ok", invoiceId);

  const postRes = await fetch(`${base}/api/customer-invoices/${invoiceId}/post-stock`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const posted = await postRes.json();
  if (!posted.ok) throw new Error(`Post stock failed: ${posted.error}`);
  console.log("POST /api/customer-invoices/[id]/post-stock", "ok", posted.stockPostingStatus);

  const { data: stockAfterSale } = await supabase
    .from("vyron_cost_stock_items")
    .select("qty_on_hand")
    .eq("id", stockAfterOpen.id)
    .single();
  if (Number(stockAfterSale?.qty_on_hand) !== 90) {
    throw new Error(`Expected stock 90 after sale, got ${stockAfterSale?.qty_on_hand}`);
  }
  console.log("Stock after sale", "ok", stockAfterSale.qty_on_hand);

  const { data: saleLedger } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("*")
    .eq("company_id", company.id)
    .eq("reference_id", invoiceId)
    .eq("movement_type", "Customer Sale");
  if (!saleLedger?.length) throw new Error("Customer Sale ledger entry missing");
  console.log("Ledger Customer Sale", "ok");

  const postAgain = await fetch(`${base}/api/customer-invoices/${invoiceId}/post-stock`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const postedAgain = await postAgain.json();
  if (!postedAgain.ok || !postedAgain.alreadyPosted) throw new Error("Second post-stock should be idempotent");
  console.log("Post-stock idempotency", "ok");

  const reverseRes = await fetch(`${base}/api/customer-invoices/${invoiceId}/reverse-stock`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const reversed = await reverseRes.json();
  if (!reversed.ok) throw new Error(`Reverse stock failed: ${reversed.error}`);
  console.log("POST /api/customer-invoices/[id]/reverse-stock", "ok", reversed.stockPostingStatus);

  const { data: stockAfterReverse } = await supabase
    .from("vyron_cost_stock_items")
    .select("qty_on_hand")
    .eq("id", stockAfterOpen.id)
    .single();
  if (Number(stockAfterReverse?.qty_on_hand) !== 100) {
    throw new Error(`Expected stock 100 after reversal, got ${stockAfterReverse?.qty_on_hand}`);
  }
  console.log("Stock after reversal", "ok", stockAfterReverse.qty_on_hand);

  const { data: reversalLedger } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("*")
    .eq("company_id", company.id)
    .eq("reference_id", invoiceId)
    .eq("movement_type", "Customer Sale Reversal");
  if (!reversalLedger?.length) throw new Error("Customer Sale Reversal ledger entry missing");
  console.log("Ledger reversal", "ok");

  console.log("PASS: invoice stock posting flow verified");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
