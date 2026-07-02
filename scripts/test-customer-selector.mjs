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

function cookieHeader(client, session) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  const sessionValue = encodeURIComponent(JSON.stringify(session));
  return `vyron_cost_active_client=${clientValue}; vyron_workspace_user_session=${sessionValue}`;
}

function normaliseCustomerLikeUi(raw, index) {
  const name = String(
    raw?.name ||
      raw?.customerName ||
      raw?.customer_name ||
      raw?.companyName ||
      raw?.company_name ||
      raw?.tradingName ||
      raw?.trading_name ||
      ""
  ).trim();
  if (!name) return null;

  return {
    id: String(raw?.id || raw?.customerId || `customer-${index}`),
    name,
    email: String(
      raw?.invoiceEmail ||
        raw?.invoice_email ||
        raw?.email ||
        raw?.customerEmail ||
        raw?.customer_email ||
        raw?.contactEmail ||
        raw?.contact_email ||
        ""
    ).trim(),
  };
}

async function main() {
  const stamp = Date.now();
  const ownerEmail = `selector-owner-${stamp}@example.com`;
  const ownerPassword = "Selector123!";

  const { data: company, error: companyError } = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `Selector Test ${stamp}`, trading_name: "Selector Test" })
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
      status: "Live",
      user_limit: 5,
    })
    .select("*")
    .single();
  if (wsError) throw wsError;

  const ownerPatchRes = await fetch(`${base}/api/developer/clients/${workspace.id}/owner`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "password",
      admin: { firstName: "Selector", surname: "Owner", email: ownerEmail, mobile: "0821111111" },
      loginSetup: { method: "password", password: ownerPassword },
    }),
  });
  const ownerPatch = await ownerPatchRes.json();
  if (!ownerPatch.ok) throw new Error(`Owner setup failed: ${ownerPatch.error}`);

  const loginRes = await fetch(`${base}/api/workspace/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
  });
  const login = await loginRes.json();
  if (!login.ok) throw new Error(`Owner login failed: ${login.error}`);

  const cookie = cookieHeader(login.client, login.session);

  const { error: customerSeedError } = await supabase.from("vyron_customers").insert({
    company_id: company.id,
    customer_name: `Selector Customer ${stamp}`,
    email: `selector-customer-${stamp}@example.com`,
    active: true,
  });
  if (customerSeedError) throw customerSeedError;

  const customersRes = await fetch(`${base}/api/customers`, { headers: { Cookie: cookie } });
  const customersPayload = await customersRes.json();
  if (!customersPayload.ok || !Array.isArray(customersPayload.customers)) {
    throw new Error(`GET /api/customers failed: ${customersPayload.error || customersRes.status}`);
  }

  const withSnakeCaseName = customersPayload.customers.find((row) => row.customer_name);
  if (!withSnakeCaseName) throw new Error("Expected at least one row with customer_name field");

  const mapped = normaliseCustomerLikeUi(withSnakeCaseName, 0);
  if (!mapped?.name) throw new Error("UI normalization failed for snake_case customer row");

  console.log("PASS selector_api_customers_returns_rows");
  console.log("PASS selector_normalizes_snake_case_customer_name");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
