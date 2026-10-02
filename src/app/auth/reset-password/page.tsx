'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Input, StatusBadge } from '@/components/ui';

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

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (res.ok) {
        setIsSuccess(true);
      } else {
        setErrorMessage(data.error || 'Failed to reset password.');
      }
    } catch {
      setErrorMessage('Network error while resetting password.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <StatusBadge status="Invalid Link" variant="danger" />
        </div>
        <h2 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-2)' }}>
          Password Reset Token Missing
        </h2>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          This reset link does not contain a valid security token.
        </p>
        <Link href="/auth/forgot-password" style={{ textDecoration: 'none' }}>
          <Button variant="primary" fullWidth>
            Request New Reset Link
          </Button>
        </Link>
      </Card>
    );
  }

  if (isSuccess) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <StatusBadge status="Password Updated" variant="done" />
        </div>
        <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)' }}>
          Your Password Has Been Reset
        </h2>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)', lineHeight: 1.5 }}>
          Your credentials have been securely updated. You can now access your account using your new password.
        </p>
        <Link href="/auth/login" style={{ textDecoration: 'none' }}>
          <Button variant="primary" fullWidth>
            Proceed to Sign In
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', margin: 0 }}>
          Create New Password
        </h2>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
          Choose a secure password of at least 8 characters.
        </p>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-danger, #ef4444)',
            fontSize: 'var(--font-size-xs)',
            marginBottom: 'var(--space-4)',
          }}
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} method="POST">
        <Input
          id="new-password"
          name="new-password"
          type="password"
          label="New Password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div style={{ marginTop: 'var(--space-3)' }}>
          <Input
            id="confirm-new-password"
            name="confirm-new-password"
            type="password"
            label="Confirm New Password"
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={loading || !password || !confirmPassword}
          style={{ marginTop: 'var(--space-5)' }}
        >
          {loading ? 'Updating Password...' : 'Save New Password'}
        </Button>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
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
          <h1
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.025em',
            }}
          >
            Motionz
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
            Establish New Password
          </p>
        </div>

        <Suspense
          fallback={
            <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
              <p style={{ color: 'var(--color-text-muted)' }}>Loading security token...</p>
            </Card>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
