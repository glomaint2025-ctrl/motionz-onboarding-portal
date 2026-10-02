'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Input, Button } from '@/components/ui';

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
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <h2
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: '600',
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              Sign In
            </h2>
          </div>

          {errorMessage && (
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
              {errorMessage}
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
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div style={{ marginTop: 'var(--space-3)' }}>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
                <Link
                  href="/auth/forgot-password"
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-primary, #34A5CB)',
                    textDecoration: 'none',
                  }}
                >
                  Forgot password?
                </Link>
              </div>
            </div>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={loading}
              style={{ marginTop: 'var(--space-4)' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
      <LoginForm />
    </React.Suspense>
  );
}
