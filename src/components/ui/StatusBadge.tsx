import React from 'react';

export type StatusVariant = 'done' | 'progress' | 'pending' | 'warning' | 'danger';

export interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  className = '',
}) => {
  // Infer variant from status string if not explicitly provided
  let badgeVariant = variant;
  if (!badgeVariant) {
    const normalized = status.toLowerCase();
    if (normalized === 'done' || normalized === 'active' || normalized === 'verified') {
      badgeVariant = 'done';
    } else if (normalized === 'in progress' || normalized === 'active') {
      badgeVariant = 'progress';
    } else if (normalized === 'warning' || normalized === 'stuck') {
      badgeVariant = 'warning';
    } else if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'error') {
      badgeVariant = 'danger';
    } else {
      badgeVariant = 'pending';
    }
  }

  return (
    <span className={`ui-badge ui-badge-${badgeVariant} ${className}`.trim()}>
      {status}
    </span>
  );
};
