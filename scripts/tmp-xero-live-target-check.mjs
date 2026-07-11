import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  const key = line.slice(0, idx);
  const value = line.slice(idx + 1).replace(/^"|"$/g, "");
  process.env[key] = value;
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase env configuration.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("vyron_xero_workspace_settings")
  .select("workspace_id, connection")
  .limit(50);

if (error) throw error;

const rows = (data || []).map((row) => {
  const connection = row.connection || {};
  const token = String(connection.accessToken || "").trim();
  const refresh = String(connection.refreshToken || "").trim();
  return {
    workspaceId: row.workspace_id,
    connected: Boolean(connection.connected),
    status: connection.status || null,
    tenantId: connection.tenantId || null,
    organisationName: connection.organisationName || null,
    hasTokens: Boolean(token && refresh),
    pendingOrganisationSelection: Boolean(connection.pendingOrganisationSelection),
    tokenExpiresAt: connection.tokenExpiresAt || null,
  };
});

const live = rows.filter((r) => r.connected && r.hasTokens && r.tenantId && r.tenantId !== "—");

console.log(JSON.stringify({ total: rows.length, liveCount: live.length, live }, null, 2));
