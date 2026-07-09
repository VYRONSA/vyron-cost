import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, "");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing env");

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function cookieHeader(client, session) {
  return `vyron_cost_active_client=${encodeURIComponent(JSON.stringify(client))}; vyron_workspace_user_session=${encodeURIComponent(JSON.stringify(session))}`;
}

async function api(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${appBase}${path}`, { ...options, headers });
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const stamp = Date.now();
  const email = `probe-${stamp}@example.com`;
  const password = "Probe123!";

  const user = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error || !user.data.user?.id) throw new Error(user.error?.message || "user create failed");
  const userId = user.data.user.id;

  let companyId = null;
  let workspaceId = null;
  let customerId = null;
  let productId = null;
  let invoiceId = null;
  let stockItemId = null;

  try {
    const comp = await supabase.from("vyron_cost_companies").insert({ name: `Probe ${stamp}`, trading_name: `Probe ${stamp}` }).select("id,name,trading_name").single();
    if (comp.error) throw comp.error;
    companyId = comp.data.id;

    const ws = await supabase.from("vyron_workspaces").insert({ company_id: companyId, company_name: comp.data.name, trading_name: comp.data.trading_name, package_name: "Professional", status: "Live", user_limit: 5, owner_user_id: userId, contact_email: email }).select("id").single();
    if (ws.error) throw ws.error;
    workspaceId = ws.data.id;

    await supabase.from("vyron_user_profiles").upsert({ id: userId, email, first_name: "Probe", surname: "User", status: "Active", updated_at: new Date().toISOString() }, { onConflict: "id" });
    await supabase.from("vyron_workspace_memberships").insert({ workspace_id: workspaceId, user_id: userId, role: "OWNER", status: "Active", joined_at: new Date().toISOString() });

    const login = await api("/api/workspace/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!login.data?.ok) throw new Error(`login failed: ${JSON.stringify(login.data)}`);
    const cookies = cookieHeader(login.data.client, login.data.session);

    const headers = { "Content-Type": "application/json", Cookie: cookies };

    const c = await api("/api/customers", { method: "POST", headers, body: JSON.stringify({ customerName: `Probe Customer ${stamp}`, terms: "30 Days", status: "Active" }) }, cookies);
    if (!c.data?.ok) throw new Error(`customer create failed ${JSON.stringify(c)}`);
    customerId = c.data.customer.id;

    const p = await api("/api/products", { method: "POST", headers, body: JSON.stringify({ product_name: `Probe Product ${stamp}`, product_category: "Finished Goods", selling_price: 30, total_cost: 15, target_gp: 30, product_status: "Active", sku: `P-${stamp}` }) }, cookies);
    if (!p.data?.ok) throw new Error(`product create failed ${JSON.stringify(p)}`);
    productId = p.data.product.id;

    const stock = await api("/api/inventory/stock", { method: "POST", headers, body: JSON.stringify({ action: "create", entityType: "finished_goods", entityId: productId, description: `Probe Product ${stamp}`, itemCode: `FG-${stamp}`, unit: "unit", currentCost: 15, openingQty: 50, openingDate: "2026-01-01", openingNote: "probe" }) }, cookies);
    if (!stock.data?.ok) throw new Error(`stock create failed ${JSON.stringify(stock)}`);
    stockItemId = stock.data.item.id;

    const inv = await api("/api/customer-invoices", { method: "POST", headers, body: JSON.stringify({ customerId, customerName: `Probe Customer ${stamp}`, lines: [{ productId, productName: `Probe Product ${stamp}`, quantity: 2, sellingPrice: 30, costPerUnit: 15 }] }) }, cookies);
    if (!inv.data?.ok) throw new Error(`invoice create failed ${JSON.stringify(inv)}`);
    invoiceId = inv.data.invoice.id;

    const post = await api(`/api/customer-invoices/${invoiceId}/post-stock`, { method: "POST", headers, body: JSON.stringify({}) }, cookies);
    console.log("POST_STOCK_STATUS", post.status);
    console.log("POST_STOCK_BODY", JSON.stringify(post.data));

    const beforeAdj = await supabase.from("vyron_cost_stock_items").select("qty_on_hand").eq("id", stockItemId).single();
    const adj = await api("/api/inventory-transactions", { method: "POST", headers, body: JSON.stringify({ action: "adjust", stock_item_id: stockItemId, quantity_delta: 3, unit_cost: 15, notes: "probe adjustment", created_by: "probe" }) }, cookies);
    const afterAdj = await supabase.from("vyron_cost_stock_items").select("qty_on_hand").eq("id", stockItemId).single();
    const adjAudit = await supabase.from("vyron_inventory_audit_log").select("id,event_type,detail,created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(20);

    console.log("ADJUST_STATUS", adj.status);
    console.log("ADJUST_BODY", JSON.stringify(adj.data));
    console.log("ADJUST_QTY", JSON.stringify({ before: beforeAdj.data?.qty_on_hand, after: afterAdj.data?.qty_on_hand }));
    console.log("ADJUST_AUDIT_RECENT", JSON.stringify(adjAudit.data || []));
  } finally {
    try { if (invoiceId) await supabase.from("vyron_customer_invoice_lines").delete().eq("invoice_id", invoiceId); } catch {}
    try { if (invoiceId) await supabase.from("vyron_customer_invoices").delete().eq("id", invoiceId); } catch {}
    try { if (workspaceId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId); } catch {}
    try { if (workspaceId) await supabase.from("vyron_workspaces").delete().eq("id", workspaceId); } catch {}
    try { if (companyId) await supabase.from("vyron_cost_companies").delete().eq("id", companyId); } catch {}
    try { await supabase.from("vyron_user_profiles").delete().eq("id", userId); } catch {}
    try { await supabase.auth.admin.deleteUser(userId); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
