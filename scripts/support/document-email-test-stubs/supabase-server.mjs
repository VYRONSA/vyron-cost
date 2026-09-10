// Test double for @/lib/supabase-server. Returns the in-memory stand-in the
// running test installed; never a real client, never credentials.
const state = () => globalThis.__VYRON_DOCUMENT_EMAIL_TEST__ || {};

export function isSupabaseServerConfigured() {
  return true;
}
export function isSupabaseServiceRoleConfigured() {
  return state().serviceRoleConfigured !== false;
}
export function getSupabaseAdmin() {
  return state().serviceRoleConfigured === false ? null : state().supabase || null;
}
export function getSupabaseServer() {
  return getSupabaseAdmin();
}
