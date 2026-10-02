import React from 'react';

export type StatusVariant = 'done' | 'progress' | 'pending' | 'warning' | 'danger' | 'suspended';

export interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  className?: string;
  dot?: boolean;
}

const DONE = new Set(['done', 'active', 'verified', 'connected', 'complete', 'completed', 'approved', 'signed', 'paid', 'delivered', 'won', 'success']);
const PROGRESS = new Set(['in progress', 'onboarding', 'processing', 'shipped', 'sent', 'scheduled', 'submitted', 'in review', 'reviewing']);
const WARNING = new Set(['warning', 'stuck', 'not connected', 'expired', 'needs attention', 'overdue', 'action needed']);
const SUSPENDED = new Set(['suspended', 'banned', 'disabled']);
const DANGER = new Set(['cancelled', 'canceled', 'failed', 'error', 'revoked', 'rejected', 'lost']);

/** Pick a colour from common status words when no explicit variant is passed. */
export function inferStatusVariant(status: string): StatusVariant {
  const normalized = status.toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (DONE.has(normalized)) return 'done';
  if (PROGRESS.has(normalized)) return 'progress';
  if (WARNING.has(normalized)) return 'warning';
  if (SUSPENDED.has(normalized)) return 'suspended';
  if (DANGER.has(normalized)) return 'danger';
  return 'pending';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  className = '',
  dot = true,
}) => {
  const badgeVariant = variant || inferStatusVariant(status);

  return (
    <span className={`ui-badge ui-badge-${badgeVariant} ${className}`.trim()}>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      {status}
    </span>
  );
};
