'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';

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
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <MotionzWordmark size={40} />
        </div>

        <div className="auth-card">
          {successEmail ? (
            <div className="auth-card-center">
              <div className="auth-icon auth-icon-success">
                <Icon name="mail" size={24} />
              </div>
              <h1 className="auth-title">Check your inbox</h1>
              <p className="auth-subtitle">
                If an account exists for <strong>{successEmail}</strong>, we&apos;ve emailed you a link to reset your
                password. It works once and expires in 60 minutes.
              </p>
              <p className="auth-subtitle">
                No email after a few minutes? Check the address for typos and your spam folder, or ask your Motionz
                contact.
              </p>

              {resetUrl && (
                <div className="auth-alert auth-alert-info">
                  <span>
                    <strong>Development only (no email provider configured):</strong>{' '}
                    <Link href={resetUrl}>{resetUrl}</Link>
                  </span>
                </div>
              )}

              <Link href="/auth/login" className="auth-link">
                <Icon name="arrow-left" size={16} />
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="auth-icon">
                <Icon name="key" size={24} />
              </div>
              <h1 className="auth-title">Forgot your password?</h1>
              <p className="auth-subtitle">
                No problem. Enter the email you sign in with and we&apos;ll send you a link to choose a new one.
              </p>

              {errorMessage && (
                <div className="auth-alert auth-alert-danger" role="alert">
                  <Icon name="alert" size={18} />
                  <span>{errorMessage}</span>
                </div>
              )}

              <Input
                id="reset-email"
                type="email"
                label="Email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={loading || !email.trim()}
                style={{ marginTop: 'var(--space-2)' }}
              >
                {loading ? 'Sending link...' : 'Send reset link'}
              </Button>

              <div className="auth-footer-link">
                <Link href="/auth/login" className="auth-link">
                  <Icon name="arrow-left" size={16} />
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
