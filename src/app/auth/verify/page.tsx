'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input, Button, buttonClasses } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';

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
  // The invite was accepted but the password could not be stored: the form cannot be retried.
  const [passwordNotSaved, setPasswordNotSaved] = useState(false);

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
    if (!token || tokenStatus !== 'valid' || submitting) return;

    // Same rules the server enforces
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password.length > 200) {
      setError('Password must be 200 characters or fewer.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    setError(null);

    let redirecting = false;
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(data?.error || 'We could not finish setting up your account. Please try again.');
        if (data?.code === 'PASSWORD_NOT_SAVED') setPasswordNotSaved(true);
      } else {
        redirecting = true;
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
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      // Stay disabled while the browser navigates to the portal after a confirmed success.
      if (!redirecting) setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <MotionzWordmark size={40} />
        </div>

        <div className="auth-card">
          {tokenStatus === 'checking' && (
            <div className="auth-card-center" role="status" style={{ padding: 'var(--space-6) 0' }}>
              <div className="auth-icon">
                <Icon name="mail" size={24} />
              </div>
              <p>Checking your invitation link...</p>
            </div>
          )}

          {tokenStatus === 'invalid' && (
            <div className="auth-card-center">
              <div className="auth-icon auth-icon-warning">
                <Icon name="alert" size={24} />
              </div>
              <h1 className="auth-title">This link isn&apos;t working</h1>
              <p className="auth-subtitle">
                Invitation links expire and can only be used once. If you already set a password, just sign in.
                Otherwise, ask your Motionz contact to send a new invite.
              </p>

              <div className="auth-alert auth-alert-danger" role="alert">
                <Icon name="alert" size={18} />
                <span>{error || 'This invitation is invalid or has expired.'}</span>
              </div>

              <Link href="/auth/login" className={buttonClasses({ variant: 'primary', size: 'lg', fullWidth: true })}>
                Go to sign in
              </Link>
            </div>
          )}

          {tokenStatus === 'valid' && (
            <div>
              <div className="auth-icon auth-icon-success">
                <Icon name="key" size={24} />
              </div>
              <h1 className="auth-title">Welcome to Motionz</h1>
              <p className="auth-subtitle">
                {invitedEmail ? (
                  <>
                    Create a password for <strong>{invitedEmail}</strong> and you&apos;re in.
                  </>
                ) : (
                  'Create a password to finish setting up your account.'
                )}
              </p>

              {error && (
                <div className="auth-alert auth-alert-danger" role="alert">
                  <Icon name="alert" size={18} />
                  <span>{error}</span>
                </div>
              )}

              {passwordNotSaved && (
                <Link
                  href="/auth/forgot-password"
                  className={buttonClasses({ variant: 'primary', size: 'lg', fullWidth: true })}
                >
                  Set my password
                </Link>
              )}

              <form onSubmit={handleSubmit} method="POST" autoComplete="on" hidden={passwordNotSaved}>
                <Input
                  id="setup-password"
                  name="new-password"
                  label="Create password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  helperText="Use 8 or more characters."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Input
                  id="confirm-password"
                  name="confirm-password"
                  label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Type it again"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={submitting || passwordNotSaved}
                  style={{ marginTop: 'var(--space-2)' }}
                >
                  {submitting ? 'Setting up...' : 'Save password and continue'}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <React.Suspense
      fallback={
        <div className="auth-loading">Loading...</div>
      }
    >
      <VerifyContent />
    </React.Suspense>
  );
}
