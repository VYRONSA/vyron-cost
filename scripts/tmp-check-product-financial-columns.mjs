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

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("information_schema.columns")
  .select("column_name")
  .eq("table_schema", "public")
  .eq("table_name", "vyron_cost_products")
  .ilike("column_name", "financial_%")
  .order("column_name", { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(JSON.stringify((data || []).map((r) => r.column_name), null, 2));
