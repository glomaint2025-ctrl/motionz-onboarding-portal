'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';

function SuspendedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams?.get('reason') || 'Your account or organization portal has been suspended.';
  const type = searchParams?.get('type') || 'account';

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <MotionzWordmark size={40} />
        </div>

        <div className="auth-card">
          <div className="auth-icon auth-icon-danger">
            <Icon name="lock" size={24} />
          </div>
          <h1 className="auth-title">{type === 'tenant' ? 'Portal paused' : 'Account paused'}</h1>
          <p className="auth-subtitle">
            Access to this portal has been turned off by a Motionz administrator.
          </p>

          <div className="auth-reason">
            <div className="auth-reason-label">Reason</div>
            <div className="auth-reason-text">{reason}</div>
          </div>

          <Link href="/auth/login" className={buttonClasses({ variant: 'secondary', size: 'lg', fullWidth: true })}>
            Back to sign in
          </Link>
          <p className="auth-footnote" style={{ marginTop: 'var(--space-4)' }}>
            Think this is a mistake? Reach out to your Motionz account manager and we&apos;ll sort it out.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SuspendedPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-loading">Loading...</div>
      }
    >
      <SuspendedContent />
    </Suspense>
  );
}
