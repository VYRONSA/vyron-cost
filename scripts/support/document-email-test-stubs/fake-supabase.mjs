/**
 * An in-memory stand-in for the Supabase query builder — enough of it to run
 * the document email routes and the PDF adapters they call.
 *
 * `eq` follows SQL: a NULL column equals nothing, including NULL. That is the
 * property the NULL-company ownership test depends on, so it is not simplified.
 *
 * `failOn` makes the Nth `.from(table)` call throw, to simulate a failure at a
 * precise point (for example inside PDF rendering) without touching the code.
 */
import { randomUUID } from "node:crypto";

export function createFakeSupabase(seed = {}, options = {}) {
  const tables = structuredClone(seed);
  const calls = {};

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.op = "select";
      this.payload = null;
      this.mode = "many";
      this.max = null;
    }
    select() { return this; }
    eq(column, value) {
      this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] === value);
      return this;
    }
    neq(column, value) { this.filters.push((row) => row[column] !== value); return this; }
    in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
    is(column, value) { this.filters.push((row) => (row[column] ?? null) === value); return this; }
    /** SQL LIKE: % is any run of characters, _ is one character; case-sensitive. */
    like(column, pattern) {
      const source = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
      const regex = new RegExp(`^${source}$`, "s");
      this.filters.push((row) => typeof row[column] === "string" && regex.test(row[column]));
      return this;
    }
    gt(column, value) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] > value); return this; }
    gte(column, value) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] >= value); return this; }
    lt(column, value) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] < value); return this; }
    lte(column, value) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] <= value); return this; }
    /** Case-insensitive match. Only literal patterns are supported — a wildcard fails loudly. */
    ilike(column, pattern) {
      if (/[%_]/.test(String(pattern))) throw new Error(`fake ilike: wildcard patterns are not supported ("${pattern}")`);
      this.filters.push((row) => typeof row[column] === "string" && row[column].toLowerCase() === String(pattern).toLowerCase());
      return this;
    }
    order() { return this; }
    limit(count) { this.max = count; return this; }
    insert(payload) { this.op = "insert"; this.payload = payload; return this; }
    /** Insert, or update the row that shares every onConflict column. */
    upsert(payload, options = {}) { this.op = "upsert"; this.payload = payload; this.conflict = String(options.onConflict || "id").split(",").map((c) => c.trim()); return this; }
    update(patch) { this.op = "update"; this.payload = patch; return this; }
    /** Removes only the rows the filters match, and returns them. */
    delete() { this.op = "delete"; return this; }
    maybeSingle() { this.mode = "maybe"; return this.run(); }
    single() { this.mode = "single"; return this.run(); }
    then(resolve, reject) { return this.run().then(resolve, reject); }

    async run() {
      const rows = (tables[this.table] ||= []);
      if (this.op === "upsert") {
        const written = [];
        for (const item of Array.isArray(this.payload) ? this.payload : [this.payload]) {
          const existing = rows.find((row) => this.conflict.every((c) => row[c] !== undefined && row[c] === item[c]));
          if (existing) {
            Object.assign(existing, item);
            written.push(existing);
          } else {
            const created = { id: randomUUID(), created_at: new Date().toISOString(), ...item };
            rows.push(created);
            written.push(created);
          }
        }
        if (this.mode === "single" || this.mode === "maybe") return { data: written[0] ? structuredClone(written[0]) : null, error: null };
        return { data: structuredClone(written), error: null };
      }
      if (this.op === "insert") {
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item) => ({
          id: randomUUID(),
          created_at: new Date().toISOString(),
          ...item,
        }));
        rows.push(...items);
        // insert(...).select().single() returns the one row, as Supabase does.
        if (this.mode === "single") return items.length === 1 ? { data: structuredClone(items[0]), error: null } : { data: null, error: { message: "expected exactly one row" } };
        if (this.mode === "maybe") return { data: items[0] ? structuredClone(items[0]) : null, error: null };
        return { data: structuredClone(items), error: null };
      }
      let matched = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.op === "delete") {
        tables[this.table] = rows.filter((row) => !matched.includes(row));
        return { data: structuredClone(matched), error: null };
      }
      if (this.op === "update") for (const row of matched) Object.assign(row, this.payload);
      if (this.max !== null) matched = matched.slice(0, this.max);
      if (this.mode === "maybe") {
        if (matched.length > 1) return { data: null, error: { message: "multiple rows returned" } };
        return { data: matched[0] ? structuredClone(matched[0]) : null, error: null };
      }
      if (this.mode === "single") {
        if (matched.length !== 1) return { data: null, error: { message: "expected exactly one row" } };
        return { data: structuredClone(matched[0]), error: null };
      }
      return { data: structuredClone(matched), error: null };
    }
  }

  return {
    tables,
    calls,
    from(table) {
      calls[table] = (calls[table] || 0) + 1;
      if (options.failOn && options.failOn.table === table && options.failOn.call === calls[table]) {
        throw new Error(`simulated database failure on ${table}`);
      }
      if (options.missingTables?.includes(table)) {
        const missing = { data: null, error: { message: `relation "public.${table}" does not exist` } };
        const chain = new Proxy({}, { get: (_, prop) => (prop === "then" ? (resolve) => resolve(missing) : () => chain) });
        return chain;
      }
      return new Query(table);
    },
    rpc() {
      return Promise.resolve({ data: null, error: { message: "rpc is not available in the fake" } });
    },
  };
}
