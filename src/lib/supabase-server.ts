import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseServerConfigured() {
  return Boolean(supabaseUrl && supabaseUrl.startsWith("https://") && !supabaseUrl.includes("/rest/v1"));
}

export function isSupabaseServiceRoleConfigured() {
  return Boolean(supabaseServiceKey && !supabaseServiceKey.includes("PASTE_YOUR"));
}

/** Service role client — bypasses RLS. Required for document upload API. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseServerConfigured() || !supabaseUrl || !isSupabaseServiceRoleConfigured()) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon client for read-only demo paths. Not used for document uploads. */
export function getSupabaseServer(): SupabaseClient | null {
  if (!isSupabaseServerConfigured() || !supabaseUrl) return null;

  if (isSupabaseServiceRoleConfigured()) {
    return getSupabaseAdmin();
  }

  if (supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return null;
}
