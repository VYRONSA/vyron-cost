// Test double for next/headers. cookies() answers with exactly the cookies the
// running test says the browser sent — nothing is derived or repaired here.
const state = () => globalThis.__VYRON_SESSION_TEST__ || {};

export async function cookies() {
  const jar = state().cookies || new Map();
  return {
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    has: (name) => jar.has(name),
    // Route handlers write cookies on the response, not here. Server Components
    // cannot write at all; mirror that by ignoring writes.
    set: () => {},
    delete: () => {},
  };
}

export async function headers() {
  return new Headers(state().headers || {});
}
