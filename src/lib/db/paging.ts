/**
 * Reading "every row" from Supabase.
 *
 * PostgREST answers at most 1,000 rows per request (the project's max-rows setting), whatever
 * limit the query asks for. A list that must be complete (every client, every setup step) is
 * therefore read page by page: the first page also returns the total, the remaining pages are
 * requested together.
 */

/** Rows asked for per request. The server may answer fewer; the helper adapts to what it gets. */
export const PAGE_SIZE = 1000;

/** How many ids go into one `IN (...)` filter, so the request URL stays short. */
export const IN_CHUNK = 100;

/** Above this many ids a list is read whole and filtered in memory instead of using `IN (...)`. */
export const IN_MAX_IDS = 300;

interface PageResult<T> {
  data: T[] | null;
  error: any;
  count?: number | null;
}

/**
 * Every row of a query. `page(from, to)` must build the query with a stable order,
 * `{ count: 'exact' }` in its select, and `.range(from, to)`.
 * Throws whatever `onError` throws for the first failed page.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  onError: (error: any) => never,
  maxRows = 100000
): Promise<T[]> {
  const first = await page(0, PAGE_SIZE - 1);
  if (first.error) onError(first.error);
  const rows = (first.data || []) as T[];
  const step = rows.length;
  const total = Math.min(typeof first.count === 'number' ? first.count : step, maxRows);
  if (step === 0 || total <= step) return rows;

  const starts: number[] = [];
  for (let from = step; from < total; from += step) starts.push(from);
  const rest = await Promise.all(starts.map((from) => page(from, from + step - 1)));
  for (const result of rest) {
    // Rows removed since the first page was read can leave a later page past the end: that page is empty.
    if (result.error?.code === 'PGRST103') continue;
    if (result.error) onError(result.error);
    rows.push(...((result.data || []) as T[]));
  }
  return rows;
}

/** Splits a list into pieces of at most `size`. */
export function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
