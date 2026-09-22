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

/**
 * SQL LIKE pattern → RegExp. % is any run, _ is one character, and a backslash
 * makes the next character literal — Postgres's default LIKE escape.
 */
function likeToRegex(pattern, flags) {
  let source = "";
  const text = String(pattern);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      source += text[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (ch === "%") source += ".*";
    else if (ch === "_") source += ".";
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, flags);
}

export function createFakeSupabase(seed = {}, options = {}) {
  const tables = structuredClone(seed);
  const calls = {};

  /*
   * Opt-in unique constraints, so concurrency tests see what Postgres does:
   *   options.unique = { table: [["col_a", "col_b"], { columns: [...], where: (row) => bool }] }
   * As in SQL, a key containing NULL never conflicts. A violation returns
   * { code: "23505" } and writes nothing.
   */
  const uniqueFor = (table) =>
    (options.unique?.[table] || []).map((spec) => (Array.isArray(spec) ? { columns: spec, where: null } : spec));
  const violates = (table, candidate, ignore) =>
    uniqueFor(table).some(({ columns, where }) => {
      if (where && !where(candidate)) return false;
      if (columns.some((c) => candidate[c] === null || candidate[c] === undefined)) return false;
      return (tables[table] || []).some(
        (row) => row !== ignore && !(where && !where(row)) && columns.every((c) => row[c] === candidate[c])
      );
    });
  const duplicateKey = (table) => ({ data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${table}` } });

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
      const regex = likeToRegex(pattern, "s");
      this.filters.push((row) => typeof row[column] === "string" && regex.test(row[column]));
      return this;
    }
    gt(column, value) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] > value); return this; }
    gte(column, value) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] >= value); return this; }
    lt(column, value) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] < value); return this; }
    lte(column, value) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] <= value); return this; }
    /** SQL ILIKE: LIKE, case-insensitive. % is any run of characters, _ is one character. */
    ilike(column, pattern) {
      const regex = likeToRegex(pattern, "is");
      this.filters.push((row) => typeof row[column] === "string" && regex.test(row[column]));
      return this;
    }
    /** PostgREST `not`, for is / eq / in. SQL semantics: a NULL column matches neither side. Anything else fails loudly. */
    not(column, operator, value) {
      if (operator === "is") {
        this.filters.push((row) => (row[column] ?? null) !== value);
        return this;
      }
      if (operator === "eq") {
        this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] !== value);
        return this;
      }
      if (operator === "in") {
        const list = (Array.isArray(value) ? value : String(value).replace(/^\(|\)$/g, "").split(","))
          .map((v) => String(v).trim().replace(/^"|"$/g, ""));
        this.filters.push((row) => row[column] !== null && row[column] !== undefined && !list.includes(String(row[column])));
        return this;
      }
      throw new Error(`fake not: only "is", "eq" and "in" are supported ("${operator}")`);
    }
    /**
     * PostgREST `or` of `column.ilike.%text%` terms (a case-insensitive substring)
     * and `column.eq.value` terms (an exact match), on any column.
     */
    or(expression) {
      const terms = String(expression).split(",").map((term) => {
        const ilike = /^([a-z_]+)\.ilike\.%(.*)%$/i.exec(term.trim());
        if (ilike) {
          const needle = ilike[2].replace(/\\([%_])/g, "$1").toLowerCase();
          return (row) => typeof row[ilike[1]] === "string" && row[ilike[1]].toLowerCase().includes(needle);
        }
        const eq = /^([a-z_]+)\.eq\.(.*)$/i.exec(term.trim());
        if (eq) return (row) => row[eq[1]] !== undefined && row[eq[1]] !== null && String(row[eq[1]]) === eq[2];
        throw new Error(`fake or: unsupported term "${term}"`);
      });
      this.filters.push((row) => terms.some((matches) => matches(row)));
      return this;
    }
    order() { return this; }
    limit(count) { this.max = count; return this; }
    /** PostgREST range: rows from..to inclusive (applied after the filters). */
    range(from, to) { this.skip = from; this.max = to - from + 1; return this; }
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
        // All-or-nothing, like a single INSERT statement.
        for (let i = 0; i < items.length; i++) {
          const batchConflict = uniqueFor(this.table).some(({ columns, where }) =>
            items.slice(0, i).some((other) => (!where || (where(other) && where(items[i]))) && columns.every((c) => items[i][c] !== null && items[i][c] !== undefined && other[c] === items[i][c]))
          );
          if (batchConflict || violates(this.table, items[i], null)) return duplicateKey(this.table);
        }
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
      if (this.op === "update") {
        for (const row of matched) {
          if (violates(this.table, { ...row, ...this.payload }, row)) return duplicateKey(this.table);
        }
        for (const row of matched) Object.assign(row, this.payload);
      }
      if (this.skip) matched = matched.slice(this.skip);
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
