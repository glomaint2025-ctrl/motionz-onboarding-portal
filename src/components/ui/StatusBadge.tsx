import React from 'react';

export type StatusVariant = 'done' | 'progress' | 'pending' | 'warning' | 'danger' | 'suspended';

export interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  className?: string;
  dot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  className = '',
  dot = true,
}) => {
  // Infer variant from status string if not explicitly provided
  let badgeVariant = variant;
  if (!badgeVariant) {
    const normalized = status.toLowerCase();
    if (normalized === 'done' || normalized === 'active' || normalized === 'verified' || normalized === 'connected') {
      badgeVariant = 'done';
    } else if (normalized === 'in progress' || normalized === 'onboarding') {
      badgeVariant = 'progress';
    } else if (normalized === 'warning' || normalized === 'stuck' || normalized === 'not connected' || normalized === 'expired') {
      badgeVariant = 'warning';
    } else if (normalized === 'suspended' || normalized === 'banned' || normalized === 'disabled') {
      badgeVariant = 'suspended';
    } else if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'error' || normalized === 'revoked') {
      badgeVariant = 'danger';
    } else {
      badgeVariant = 'pending';
    }
  }

  return (
    <span className={`ui-badge ui-badge-${badgeVariant} ${className}`.trim()}>
      {dot && <span className="ui-badge-dot" />}
      {status}
    </span>
  );
};
