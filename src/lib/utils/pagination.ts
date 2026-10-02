/**
 * Generic reusable pagination and query parsing utilities for backend API routes.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Parses and sanitizes pagination and filter query parameters from a Request or URL.
 */
export function parsePaginationParams(
  requestOrUrl: Request | string | URL,
  defaultPageSize = 10
): PaginationParams {
  let url: URL;
  if (typeof requestOrUrl === 'string') {
    url = new URL(requestOrUrl, 'http://localhost');
  } else if ('url' in requestOrUrl && typeof requestOrUrl.url === 'string') {
    url = new URL(requestOrUrl.url, 'http://localhost');
  } else {
    url = requestOrUrl as URL;
  }

  const searchParams = url.searchParams;

  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawPageSize = parseInt(
    searchParams.get('pageSize') || searchParams.get('limit') || String(defaultPageSize),
    10
  );

  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const pageSize = isNaN(rawPageSize) || rawPageSize < 1 ? defaultPageSize : Math.min(100, rawPageSize);
  const offset = (page - 1) * pageSize;

  const search = searchParams.get('search')?.trim() || searchParams.get('q')?.trim() || undefined;
  const status = searchParams.get('status')?.trim() || undefined;
  const sortBy = searchParams.get('sortBy')?.trim() || undefined;
  const rawOrder = searchParams.get('sortOrder')?.toLowerCase();
  const sortOrder = rawOrder === 'asc' ? 'asc' : 'desc';

  return {
    page,
    pageSize,
    offset,
    search,
    status,
    sortBy,
    sortOrder,
  };
}

/**
 * Builds standard pagination metadata given total items count, current page, and page size.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  pageSize: number
): PaginationMeta {
  const safeTotal = Math.max(0, total);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
}
