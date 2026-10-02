'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, Button, Input, StatusBadge } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [successEmail, setSuccessEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setErrorMessage('');
    setResetUrl('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        let link = data.resetUrl || '';
        if (typeof window !== 'undefined' && link) {
          try {
            if (link.startsWith('/')) {
              link = `${window.location.origin}${link}`;
            } else {
              const parsed = new URL(link);
              if (parsed.origin !== window.location.origin) {
                link = `${window.location.origin}${parsed.pathname}${parsed.search}`;
              }
            }
          } catch {}
        }
        setResetUrl(link);
        setSuccessEmail(email.trim());
      } else {
        setErrorMessage(data.error || 'Failed to generate password reset link.');
      }
    } catch {
      setErrorMessage('Network connection error. Please try again.');
    } finally {
      setLoading(false);
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
            Reset Account Password
          </p>
        </div>

        <Card>
          {successEmail ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
                <StatusBadge status="Check Your Email" variant="done" />
              </div>

              <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
                Check your inbox
              </h2>

              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: 'var(--space-4)' }}>
                If an account exists for <strong>{successEmail}</strong>, we have emailed a password reset link. It works once and expires in 60 minutes.
              </p>

              {resetUrl && (
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-bg-surface)',
                    border: '1px dashed var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-size-xs)',
                    wordBreak: 'break-all',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  <strong>Development only (no email provider configured):</strong>{' '}
                  <Link href={resetUrl}>{resetUrl}</Link>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Link href="/auth/login" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
                    &larr; Back to Sign In
                  </span>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
                Enter the email address associated with your account. We will email you a secure link to choose a new password.
              </p>

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

              <Input
                id="reset-email"
                type="email"
                label="Account Email"
                placeholder="e.g. michael@apexroofing.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={loading || !email.trim()}
                style={{ marginTop: 'var(--space-4)' }}
              >
                {loading ? 'Generating Reset Link...' : 'Generate Reset Link'}
              </Button>

              <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
                <Link href="/auth/login" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', textDecoration: 'none' }}>
                  &larr; Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
