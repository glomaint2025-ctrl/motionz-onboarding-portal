'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';

export interface QuickLinksBarProps {
  clientId: string;
  onOpenGHLForm: () => void;
  onOpenA2PForm: () => void;
}

export const QuickLinksBar: React.FC<QuickLinksBarProps> = ({
  clientId,
  onOpenGHLForm,
  onOpenA2PForm,
}) => {
  return (
    <div
      style={{
        padding: 'var(--space-4)',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-subtle)',
        marginBottom: 'var(--space-6)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-3)',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', display: 'block' }}>
          Onboarding Resources & Hub
        </span>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          Quick access to external training, communities, and carrier compliance forms
        </span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <a
          href="https://join.slack.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" size="sm">
            Slack Community
          </Button>
        </a>

        <a
          href="https://skool.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" size="sm">
            Skool Training Hub
          </Button>
        </a>

        <Button variant="outline" size="sm" onClick={onOpenGHLForm}>
          Onboarding Form
        </Button>

        <Button variant="outline" size="sm" onClick={onOpenA2PForm}>
          A2P Carrier Form
        </Button>

        <Link href={`/portal/${clientId}/book-call`}>
          <Button variant="primary" size="sm">
            Book CSM Call
          </Button>
        </Link>
      </div>
    </div>
  );
};
