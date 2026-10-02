'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';

function SuspendedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams?.get('reason') || 'Your account or organization portal has been suspended.';
  const type = searchParams?.get('type') || 'account';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 'var(--space-4)',
        backgroundColor: 'var(--color-bg-base)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <span
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: '700',
              color: 'var(--color-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            Motionz
          </span>
        </div>

        <Card>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: '600',
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.01em',
                margin: '0 0 var(--space-1) 0',
              }}
            >
              {type === 'tenant' ? 'Portal Suspended' : 'Account Suspended'}
            </h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-muted)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Access to this portal has been disabled by an administrator.
            </p>
          </div>

          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-status-danger-bg)',
              border: '1px solid var(--color-status-danger-border)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--color-status-danger-text)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 'var(--space-1)',
              }}
            >
              Reason
            </div>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-primary)',
                lineHeight: 1.4,
              }}
            >
              {reason}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Link href="/auth/login" style={{ textDecoration: 'none' }}>
              <Button variant="primary" fullWidth>
                Return to Sign In
              </Button>
            </Link>
            <p
              style={{
                margin: 0,
                textAlign: 'center',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
                lineHeight: 1.4,
              }}
            >
              If you believe this is an error, please contact your account manager or system administrator.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function SuspendedPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--color-bg-base)',
          }}
        >
          <p style={{ color: 'var(--color-text-muted)' }}>Loading status...</p>
        </div>
      }
    >
      <SuspendedContent />
    </Suspense>
  );
}
