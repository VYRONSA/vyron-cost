// Test double for @/lib/supabase (the browser/anon client).
//
// Opt-in: a test that needs to observe code paths using the anon client sets
// globalThis.__VYRON_SESSION_TEST__.browserSupabase BEFORE importing the
// modules under test, and gets its in-memory stand-in. Every other test gets
// null — exactly what the real module exports when NEXT_PUBLIC_SUPABASE_URL is
// not https, which is the case in these offline tests.
export const supabase = globalThis.__VYRON_SESSION_TEST__?.browserSupabase ?? null;
export const isSupabaseConfigured = Boolean(supabase);
