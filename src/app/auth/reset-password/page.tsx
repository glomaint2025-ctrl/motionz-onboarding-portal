'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, buttonClasses } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams?.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setErrorMessage('Missing password reset token. Please request a new link.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password.length > 200) {
      setErrorMessage('Password must be 200 characters or fewer.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    if (loading) return;
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => null);
      // Success is shown only when the server confirms the password was saved.
      if (res.ok && data?.success === true) {
        setIsSuccess(true);
      } else {
        setErrorMessage(data?.error || 'We could not update your password. Please try again.');
      }
    } catch {
      setErrorMessage('We could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-card auth-card-center">
        <div className="auth-icon auth-icon-warning">
          <Icon name="alert" size={24} />
        </div>
        <h1 className="auth-title">This reset link is incomplete</h1>
        <p className="auth-subtitle">
          The link is missing its security code. Request a new one and use the button in the email.
        </p>
        <Link href="/auth/forgot-password" className={buttonClasses({ variant: 'primary', size: 'lg', fullWidth: true })}>
          Request a new link
        </Link>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="auth-card auth-card-center">
        <div className="auth-icon auth-icon-success">
          <Icon name="check-circle" size={24} />
        </div>
        <h1 className="auth-title">Password updated</h1>
        <p className="auth-subtitle">You&apos;re all set. Sign in with your new password.</p>
        <Link href="/auth/login" className={buttonClasses({ variant: 'primary', size: 'lg', fullWidth: true })}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-icon">
        <Icon name="lock" size={24} />
      </div>
      <h1 className="auth-title">Choose a new password</h1>
      <p className="auth-subtitle">Use at least 8 characters. You&apos;ll use it the next time you sign in.</p>

      {errorMessage && (
        <div className="auth-alert auth-alert-danger" role="alert">
          <Icon name="alert" size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} method="POST">
        <Input
          id="new-password"
          name="new-password"
          type="password"
          label="New password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <Input
          id="confirm-new-password"
          name="confirm-new-password"
          type="password"
          label="Confirm new password"
          placeholder="Type it again"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={loading || !password || !confirmPassword}
          style={{ marginTop: 'var(--space-2)' }}
        >
          {loading ? 'Saving...' : 'Save new password'}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <MotionzWordmark size={40} />
        </div>

        <Suspense
          fallback={
            <div className="auth-card auth-card-center" role="status">
              <p>Loading...</p>
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
