'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';

/**
 * Fixed wording per reason code. Text from the URL is never shown: anyone can craft a link,
 * so only the short codes below are recognised and everything else gets the general message.
 */
const COPY: Record<'account' | 'portal' | 'archived' | 'general', { title: string; message: string }> = {
  account: {
    title: 'Account paused',
    message: 'Your access to this portal has been turned off.',
  },
  portal: {
    title: 'Portal paused',
    message: 'This portal has been paused by Motionz.',
  },
  archived: {
    title: 'Portal archived',
    message: 'This portal has been archived by Motionz.',
  },
  general: {
    title: 'Access paused',
    message: 'Access to this portal has been turned off.',
  },
};

function SuspendedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams?.get('reason');
  const type = searchParams?.get('type');

  const kind: keyof typeof COPY =
    reason === 'archived' || type === 'archived'
      ? 'archived'
      : reason === 'portal' || type === 'tenant'
        ? 'portal'
        : reason === 'account' || type === 'account'
        ? 'account'
        : 'general';
  const copy = COPY[kind];

  // The client's own reason comes from the sign-in step in this browser, never from the URL.
  const [pauseReason, setPauseReason] = React.useState('');
  React.useEffect(() => {
    try {
      setPauseReason(kind === 'portal' ? sessionStorage.getItem('motionz:pause-reason') || '' : '');
    } catch {
      setPauseReason('');
    }
  }, [kind]);

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
          <h1 className="auth-title">{copy.title}</h1>
          <p className="auth-subtitle">{copy.message}</p>
          {pauseReason && <p className="auth-subtitle">Reason: {pauseReason}</p>}

          <Link href="/auth/login" className={buttonClasses({ variant: 'secondary', size: 'lg', fullWidth: true })}>
            Back to sign in
          </Link>
          <p className="auth-footnote" style={{ marginTop: 'var(--space-4)' }}>
            Think this is a mistake? Reach out to your Motionz CSM and we&apos;ll sort it out.
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
