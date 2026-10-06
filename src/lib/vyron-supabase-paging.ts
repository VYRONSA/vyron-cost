/**
 * Read every row a report needs. PostgREST caps one response (1000 rows by
 * default) and silently returns the first page only, and `.in()` with
 * hundreds of ids overflows a URL — a report that reads either way without
 * paging under-counts a busy tenant without any error.
 */

type PageResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export const READ_PAGE = 1000;
export const IN_CHUNK = 150;

/**
 * Every page of one query. `build(from, to)` must apply `.range(from, to)` over a stable order.
 * The server may return fewer rows than asked for (its own cap can be below the page size), so
 * reading advances by what came back and stops only at an empty page — never at a short one.
 */
export async function readAllPages<T>(build: (from: number, to: number) => PageResult, pageSize = READ_PAGE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as T[];
    if (!page.length) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}

/** Every row for a list of ids: chunked `.in()`, each chunk read page by page. */
export async function readAllIn<T>(ids: string[], build: (chunk: string[], from: number, to: number) => PageResult, chunkSize = IN_CHUNK, pageSize = READ_PAGE): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    rows.push(...(await readAllPages<T>((from, to) => build(chunk, from, to), pageSize)));
  }
  return rows;
}
