'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Input, Button } from '@/components/ui';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid');
      setError('No invitation token supplied. Please use the invitation link sent to your email.');
      return;
    }

    const checkToken = async () => {
      try {
        const res = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setTokenStatus('invalid');
          setError(data?.error || 'This invitation is invalid or has expired.');
        } else {
          setTokenStatus('valid');
          setInvitedEmail(data?.email || null);
        }
      } catch {
        setTokenStatus('invalid');
        setError('Network error validating invitation link.');
      }
    };

    checkToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || tokenStatus !== 'valid') return;

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Verification failed.');
      } else {
        // Trigger browser credential manager save prompt
        const saveEmail = data.user?.email || invitedEmail;
        if (typeof window !== 'undefined' && 'PasswordCredential' in window && (window as any).PasswordCredential && saveEmail) {
          try {
            const cred = new (window as any).PasswordCredential({
              id: saveEmail,
              password,
              name: data.user?.full_name || saveEmail.split('@')[0],
            });
            await navigator.credentials?.store?.(cred);
          } catch {
            // Best effort
          }
        }
        router.push(data.redirectTo || '/portal/demo');
      }
    } catch (err: any) {
      setError(err.message || 'Network error during account setup.');
    } finally {
      setSubmitting(false);
    }
  };

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
          {tokenStatus === 'checking' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Validating invitation link...
              </p>
            </div>
          )}

          {tokenStatus === 'invalid' && (
            <div>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <h2
                  style={{
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: '600',
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Invalid or Expired Link
                </h2>
              </div>

              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-status-danger-bg)',
                  border: '1px solid var(--color-status-danger-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-status-danger-text)',
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: '1.4',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {error || 'This invitation is invalid or has expired.'}
              </div>

              <Link href="/auth/login">
                <Button variant="primary" fullWidth>
                  Go to Sign In
                </Button>
              </Link>
            </div>
          )}

          {tokenStatus === 'valid' && (
            <div>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <h2
                  style={{
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: '600',
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Complete Account Setup
                </h2>
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {invitedEmail
                    ? `Set a password for ${invitedEmail} to complete registration.`
                    : 'Choose a secure password to complete your registration.'}
                </p>
              </div>

              {error && (
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-status-danger-bg)',
                    border: '1px solid var(--color-status-danger-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-status-danger-text)',
                    fontSize: 'var(--font-size-xs)',
                    lineHeight: '1.4',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} method="POST" autoComplete="on">
                <Input
                  id="setup-password"
                  name="new-password"
                  label="Create Password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Input
                    id="confirm-password"
                    name="confirm-password"
                    label="Confirm Password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  disabled={submitting}
                  style={{ marginTop: 'var(--space-4)' }}
                >
                  {submitting ? 'Setting up...' : 'Save Password & Enter Portal'}
                </Button>
              </form>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <React.Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Loading...
        </div>
      }
    >
      <VerifyContent />
    </React.Suspense>
  );
}
