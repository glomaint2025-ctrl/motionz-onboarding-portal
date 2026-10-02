'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input, Button } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const normalizedEmail = email.trim();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password: password,
          redirect: redirectParam || undefined,
        }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        setErrorMessage(`Server response error (${res.status}). Please try again.`);
        return;
      }

      if (!res.ok) {
        if (data?.suspended) {
          const reasonQuery = encodeURIComponent(data?.reason || data?.error || 'Account suspended');
          router.push(`/auth/suspended?reason=${reasonQuery}`);
          return;
        }
        setErrorMessage(data?.error || 'Authentication failed.');
      } else {
        if (data?.redirectTo) {
          // Explicitly trigger browser credential manager save prompt
          if (typeof window !== 'undefined' && 'PasswordCredential' in window && (window as any).PasswordCredential) {
            try {
              const cred = new (window as any).PasswordCredential({
                id: normalizedEmail,
                password: password,
                name: normalizedEmail.split('@')[0],
              });
              await navigator.credentials?.store?.(cred);
            } catch {
              // Best effort; browser will also save via form semantics
            }
          }
          router.push(data.redirectTo);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred.');
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
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to see your setup progress, leads and results.</p>

          {errorMessage && (
            <div className="auth-alert auth-alert-danger" role="alert">
              <Icon name="alert" size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            method="POST"
            action="/api/auth/login"
            autoComplete="on"
          >
            <Input
              id="login-email"
              name="username"
              label="Email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="login-password"
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="auth-row-end">
              <Link href="/auth/forgot-password" className="auth-link">
                Forgot password?
              </Link>
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading}
              style={{ marginTop: 'var(--space-2)' }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="auth-footnote">
          <Icon name="lock" size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Private portal for Motionz clients and team. Need access? Ask your Motionz contact for an invite.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="auth-loading">Loading...</div>
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}
