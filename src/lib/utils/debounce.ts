/**
 * Debounce utility to prevent rapid successive function calls (e.g. search inputs).
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs = 300
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, delayMs);
  };
}

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Paginates an in-memory or database collection cleanly with boundary enforcement.
 */
export function paginate<T>(
  items: T[],
  page = 1,
  pageSize = 25
): PaginationResult<T> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(100, pageSize));
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / safePageSize) || 1;
  const startIndex = (safePage - 1) * safePageSize;
  const paginatedItems = items.slice(startIndex, startIndex + safePageSize);

  return {
    items: paginatedItems,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    totalItems,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
}
