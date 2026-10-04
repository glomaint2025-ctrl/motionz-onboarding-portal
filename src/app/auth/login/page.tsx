'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input, Button } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';

const RESEND_COOLDOWN_SECONDS = 30;

const textButtonStyle = (inactive: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-medium)',
  cursor: inactive ? 'default' : 'pointer',
  color: inactive ? 'var(--color-text-muted)' : 'var(--color-primary-text)',
});

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Second step for staff: an emailed one-time code (only when an admin has switched it on).
  const [codeStep, setCodeStep] = useState<{ emailHint: string } | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const storeCredential = async () => {
    // Explicitly trigger browser credential manager save prompt
    if (typeof window !== 'undefined' && 'PasswordCredential' in window && (window as any).PasswordCredential) {
      try {
        const id = email.trim();
        const cred = new (window as any).PasswordCredential({
          id,
          password: password,
          name: id.split('@')[0],
        });
        await navigator.credentials?.store?.(cred);
      } catch {
        // Best effort; browser will also save via form semantics
      }
    }
  };

  const backToSignIn = (message?: string) => {
    setCodeStep(null);
    setCode('');
    setNotice(null);
    setResendCooldown(0);
    setPassword('');
    setErrorMessage(message || null);
  };

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
      } else if (data?.codeRequired) {
        setCode('');
        setNotice(null);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        setCodeStep({ emailHint: data.emailHint || 'your Motionz email address' });
      } else if (data?.redirectTo) {
        await storeCredential();
        router.push(data.redirectTo);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (value: string) => {
    if (verifying) return;
    if (!/^\d{6}$/.test(value)) {
      setErrorMessage('Enter the 6-digit code from your email.');
      return;
    }
    setVerifying(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/login/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const data: any = await res.json().catch(() => null);
      if (res.ok && data?.redirectTo) {
        await storeCredential();
        router.push(data.redirectTo);
        return;
      }
      const message = data?.error || `Server response error (${res.status}). Please try again.`;
      if (data?.restart) {
        // Expired, used up or locked: the password step has to be repeated.
        backToSignIn(message);
      } else {
        setErrorMessage(message);
        setCode('');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && digits !== code) submitCode(digits);
  };

  const resendCode = async () => {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/login/resend-code', { method: 'POST' });
      const data: any = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setCode('');
        setNotice('We sent a new code. The previous code no longer works.');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        codeInputRef.current?.focus();
      } else if (data?.restart) {
        backToSignIn(data.error);
      } else {
        setErrorMessage(data?.error || `Could not send a new code (${res.status}). Please try again.`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred.');
    } finally {
      setResending(false);
    }
  };

  // Return focus to the code field once a failed check has finished.
  useEffect(() => {
    if (codeStep && !verifying) codeInputRef.current?.focus();
  }, [codeStep, verifying]);

  const resendInactive = resending || resendCooldown > 0 || verifying;

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <MotionzWordmark size={40} />
        </div>

        <div className="auth-card">
          <h1 className="auth-title">{codeStep ? 'Check your email' : 'Welcome back'}</h1>
          <p className="auth-subtitle">
            {codeStep
              ? `Enter the 6-digit code we emailed to ${codeStep.emailHint}. It expires in 10 minutes.`
              : 'Sign in to see your setup progress, leads and results.'}
          </p>

          {errorMessage && (
            <div className="auth-alert auth-alert-danger" role="alert">
              <Icon name="alert" size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {codeStep && notice && (
            <div className="auth-alert auth-alert-info" role="status" style={{ wordBreak: 'normal' }}>
              <span>{notice}</span>
            </div>
          )}

          {codeStep && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitCode(code);
              }}
              autoComplete="off"
            >
              <Input
                ref={codeInputRef}
                id="login-code"
                name="one-time-code"
                label="Sign-in code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                readOnly={verifying}
                required
                style={{ fontSize: '1.5rem', letterSpacing: '0.4em', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={verifying || code.length !== 6}
                style={{ marginTop: 'var(--space-2)' }}
              >
                {verifying ? 'Checking code...' : 'Verify and sign in'}
              </Button>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-4)',
                }}
              >
                <button
                  type="button"
                  className="auth-link"
                  onClick={resendCode}
                  disabled={resendInactive}
                  style={textButtonStyle(resendInactive)}
                >
                  {resending ? 'Sending...' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </button>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => backToSignIn()}
                  style={textButtonStyle(false)}
                >
                  Use a different account
                </button>
              </div>
            </form>
          )}

          {/* Kept mounted (hidden) during the code step so the browser can still offer to save the password. */}
          <form
            hidden={Boolean(codeStep)}
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
