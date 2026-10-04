'use client';

import React from 'react';
import { Button } from '@/components/ui';

export interface NoticeProps {
  tone?: 'error' | 'success' | 'info';
  children: React.ReactNode;
  /** Shows a "Try again" button, e.g. after a list failed to load. */
  onRetry?: () => void;
  style?: React.CSSProperties;
}

const TONES: Record<NonNullable<NoticeProps['tone']>, React.CSSProperties> = {
  error: {
    backgroundColor: 'var(--color-status-danger-bg)',
    border: '1px solid var(--color-status-danger-border)',
    color: 'var(--color-status-danger-text)',
  },
  success: {
    backgroundColor: 'var(--color-status-done-bg)',
    border: '1px solid var(--color-status-done-border)',
    color: 'var(--color-status-done-text)',
  },
  info: {
    backgroundColor: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-secondary)',
  },
};

/** One banner style for "that did not work" / "saved" messages across the staff pages. */
export const Notice: React.FC<NoticeProps> = ({ tone = 'error', children, onRetry, style }) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 'var(--space-3)',
      flexWrap: 'wrap',
      padding: 'var(--space-3)',
      borderRadius: 'var(--radius-md)',
      fontSize: 'var(--font-size-sm)',
      lineHeight: 1.5,
      ...TONES[tone],
      ...style,
    }}
  >
    <span>{children}</span>
    {onRetry && (
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

/** Plain labels for the client status stored in the database. Unknown values are shown as-is, never as "Active". */
export function clientStatusLabel(status: string | null | undefined, isArchived = false): string {
  if (isArchived || status === 'cancelled') return 'Archived';
  switch (status) {
    case 'active':
      return 'Active';
    case 'onboarding':
      return 'Onboarding';
    case 'suspended':
      return 'Suspended';
    default:
      return status ? `Unknown (${status})` : 'Unknown';
  }
}

/** Copies text and reports whether it worked, so the page can say "Copied" or ask the user to copy by hand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
