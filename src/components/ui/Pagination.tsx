'use client';

import React from 'react';
import { Select } from './Select';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
  disabled?: boolean;
  showPageSizeSelector?: boolean;
  showItemCount?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
  className = '',
  disabled = false,
  showPageSizeSelector = true,
  showItemCount = true,
}) => {
  if (totalPages <= 1 && (!totalItems || totalItems <= pageSize)) {
    // If there's only 1 page and no excess items, still show summary if requested, but no buttons
    if (!showItemCount || totalItems === undefined) return null;
  }

  const safePage = Math.max(1, Math.min(currentPage, totalPages || 1));

  // Calculate visible range (e.g. "Showing 1 to 10 of 42 results")
  const startItem = totalItems !== undefined && totalItems > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endItem = totalItems !== undefined ? Math.min(safePage * pageSize, totalItems) : 0;

  // Generate page numbers with ellipses
  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (safePage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }

    if (safePage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages];
  };

  const pages = getPageNumbers();

  return (
    <div className={`ui-pagination-container ${className}`.trim()}>
      {/* Left side: Item count summary & Page size selector */}
      <div className="ui-pagination-left">
        {showItemCount && totalItems !== undefined && (
          <span className="ui-pagination-info">
            Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of{' '}
            <strong>{totalItems}</strong> entries
          </span>
        )}

        {showPageSizeSelector && onPageSizeChange && (
          <div className="ui-pagination-size-selector">
            <span className="ui-pagination-size-label">Per page:</span>
            <div className="ui-pagination-select-wrapper">
              <Select
                value={String(pageSize)}
                disabled={disabled}
                dropUp={true}
                size="sm"
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                options={pageSizeOptions.map((opt) => ({
                  value: String(opt),
                  label: String(opt),
                }))}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right side: Page navigation buttons */}
      {totalPages > 1 && (
        <div className="ui-pagination-controls">
          {/* Previous Page Button */}
          <button
            type="button"
            className="ui-pagination-btn"
            disabled={disabled || safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Previous Page"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span style={{ marginLeft: '4px' }}>Prev</span>
          </button>

          {/* Page Numbers */}
          {pages.map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="ui-pagination-ellipsis">
                  ···
                </span>
              );
            }

            const pageNum = p as number;
            const isActive = pageNum === safePage;

            return (
              <button
                key={pageNum}
                type="button"
                className={`ui-pagination-btn ${isActive ? 'ui-pagination-btn-active' : ''}`}
                disabled={disabled}
                onClick={() => onPageChange(pageNum)}
                aria-current={isActive ? 'page' : undefined}
              >
                {pageNum}
              </button>
            );
          })}

          {/* Next Page Button */}
          <button
            type="button"
            className="ui-pagination-btn"
            disabled={disabled || safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Next Page"
          >
            <span style={{ marginRight: '4px' }}>Next</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
