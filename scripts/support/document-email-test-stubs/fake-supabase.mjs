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
    order() { return this; }
    limit(count) { this.max = count; return this; }
    insert(payload) { this.op = "insert"; this.payload = payload; return this; }
    update(patch) { this.op = "update"; this.payload = patch; return this; }
    maybeSingle() { this.mode = "maybe"; return this.run(); }
    single() { this.mode = "single"; return this.run(); }
    then(resolve, reject) { return this.run().then(resolve, reject); }

    async run() {
      const rows = (tables[this.table] ||= []);
      if (this.op === "insert") {
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item) => ({
          id: randomUUID(),
          created_at: new Date().toISOString(),
          ...item,
        }));
        rows.push(...items);
        return { data: structuredClone(items), error: null };
      }
      let matched = rows.filter((row) => this.filters.every((filter) => filter(row)));
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
      return new Query(table);
    },
    rpc() {
      return Promise.resolve({ data: null, error: { message: "rpc is not available in the fake" } });
    },
  };
}
