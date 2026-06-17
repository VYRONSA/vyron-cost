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
const base = "http://localhost:3007";

if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const email = `broken-login-${Date.now()}@vyron-test.local`;
  const password = "BrokenFix123!";

  const { data: company, error: companyError } = await supabase
    .from("vyron_cost_companies")
    .insert({ name: "Broken Login Co", trading_name: "Broken Login", contact_email: email })
    .select("*")
    .single();
  if (companyError) throw companyError;

  const { data: workspace, error: wsError } = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: company.id,
      company_name: "Broken Login Co",
      trading_name: "Broken Login",
      package_name: "Professional",
      status: "Setup",
      user_limit: 5,
      contact_email: email,
      owner_user_id: null,
      owner_first_name: "Broken",
      owner_surname: "Owner",
      owner_email: email,
      owner_mobile: "0821111111",
      owner_login_method: "password",
      owner_login_status: "pending_activation",
    })
    .select("*")
    .single();
  if (wsError) throw wsError;

  console.log("Created broken workspace:", workspace.id);

  const patchRes = await fetch(`${base}/api/developer/clients/${workspace.id}/owner`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "password",
      admin: { firstName: "Broken", surname: "Owner", email, mobile: "0821111111" },
      loginSetup: { method: "password", password },
    }),
  });
  const patch = await patchRes.json();
  if (!patch.ok || !patch.ownerUserId) {
    console.error("Manage Login failed:", patch);
    process.exit(1);
  }
  console.log("Manage Login OK — ownerUserId:", patch.ownerUserId, "status:", patch.ownerDetails.loginStatus);

  const loginRes = await fetch(`${base}/api/workspace/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const login = await loginRes.json();
  if (!login.ok) {
    console.error("Login failed:", login);
    process.exit(1);
  }
  console.log("Login OK — redirect:", login.redirect, "workspace:", login.client.id);
  console.log("PASS: Manage Login + /login flow verified");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
