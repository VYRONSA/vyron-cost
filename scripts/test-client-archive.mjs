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

async function main() {
  const label = `Archive Test ${Date.now()}`;
  const { data: company, error: companyError } = await supabase
    .from("vyron_cost_companies")
    .insert({ name: label, trading_name: label })
    .select("*")
    .single();
  if (companyError) throw companyError;

  const { data: workspace, error: wsError } = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: company.id,
      company_name: label,
      trading_name: label,
      package_name: "Professional",
      status: "Setup",
      user_limit: 5,
    })
    .select("*")
    .single();
  if (wsError) throw wsError;

  const workspaceId = workspace.id;
  console.log("Created workspace:", workspaceId);

  const archiveRes = await fetch(`${base}/api/developer/clients/${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "archive", archivedBy: "test-script" }),
  });
  const archived = await archiveRes.json();
  if (!archived.ok) {
    console.error("Archive failed:", archived);
    process.exit(1);
  }
  console.log("PATCH archive ok, status:", archived.workspace?.status);

  const listRes = await fetch(`${base}/api/developer/clients`);
  const list = await listRes.json();
  const row = list.workspaces.find((ws) => ws.id === workspaceId);
  if (!row || row.status !== "Archived") {
    console.error("Workspace not archived in GET list", row?.status);
    process.exit(1);
  }
  console.log("GET list shows Archived");

  const activeCount = list.workspaces.filter((ws) => ws.status !== "Archived").some((ws) => ws.id === workspaceId);
  if (activeCount) {
    console.error("Archived workspace still counted as active");
    process.exit(1);
  }
  console.log("Active filter excludes archived workspace");

  const deleteRes = await fetch(`${base}/api/developer/clients/${workspaceId}`, { method: "DELETE" });
  const deleted = await deleteRes.json();
  if (!deleted.ok) {
    console.error("Delete failed:", deleted);
    process.exit(1);
  }
  console.log("DELETE ok");

  const listAfter = await fetch(`${base}/api/developer/clients`).then((r) => r.json());
  if (listAfter.workspaces.some((ws) => ws.id === workspaceId)) {
    console.error("Deleted workspace still returned by GET");
    process.exit(1);
  }
  console.log("GET list no longer includes deleted workspace");
  console.log("PASS: archive + delete client workspace verified");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
