import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  borderRadius = 'var(--radius-sm, 6px)',
  className = '',
  style,
  ...props
}) => {
  return (
    <div
      className={`ui-skeleton ${className}`.trim()}
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      {...props}
    />
  );
};

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 5, columns = 5 }) => {
  return (
    <div className="ui-skeleton-table" aria-busy="true" aria-label="Loading">
      {/* Header bar skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 'var(--space-4)',
          padding: 'var(--space-4)',
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-bg-surface)',
        }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`th-${i}`} width={i === 0 ? '60%' : '45%'} height="14px" />
        ))}
      </div>

      {/* Row skeletons */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`tr-${r}`}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: 'var(--space-4)',
              padding: 'var(--space-4)',
              alignItems: 'center',
              borderBottom: r < rows - 1 ? '1px solid var(--color-border-subtle)' : 'none',
            }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <div key={`td-${r}-${c}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Skeleton width={c === 0 ? '80%' : c === 1 ? '65%' : '50%'} height="15px" />
                {c === 0 && <Skeleton width="45%" height="11px" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export interface CardSkeletonProps {
  height?: string | number;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({ height = '140px' }) => {
  return (
    <div className="ui-skeleton-card" style={{ height }} aria-busy="true" aria-label="Loading">
      <Skeleton width="40%" height="20px" />
      <Skeleton width="70%" height="14px" />
      <div style={{ marginTop: 'auto' }}>
        <Skeleton width="25%" height="12px" />
      </div>
    </div>
  );
};
