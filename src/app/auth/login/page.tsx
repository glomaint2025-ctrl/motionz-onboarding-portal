'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Input, Button, StatusBadge } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialError = searchParams.get('error');

  const [activeTab, setActiveTab] = useState<'staff' | 'client'>('staff');
  const [email, setEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'admin' | 'csm'>('admin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError === 'admin_required'
      ? 'Administrator privileges required for that section.'
      : initialError === 'csm_required'
      ? 'CSM credentials required for that section.'
      : null
  );
  const [demoLink, setDemoLink] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setMessage(null);
    setDemoLink(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role: staffRole,
          action: activeTab === 'staff' ? 'staff' : 'magic_link',
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
        setErrorMessage(data?.error || 'Authentication failed.');
      } else {
        if (activeTab === 'staff' && data?.redirectTo) {
          router.push(data.redirectTo);
        } else {
          setMessage(data?.message || 'Magic link generated successfully.');
          if (data?.demoMagicLink) {
            setDemoLink(data.demoMagicLink);
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-4)' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--color-primary)' }}>
            Motionz
          </span>
          <p style={{ marginTop: 'var(--space-1)' }}>Secure Portal Authentication</p>
        </div>

        <Card>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 'var(--space-5)' }}>
            <button
              type="button"
              onClick={() => {
                setActiveTab('staff');
                setErrorMessage(null);
                setMessage(null);
              }}
              style={{
                flex: 1,
                padding: 'var(--space-3)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'staff' ? '2px solid var(--color-primary)' : 'none',
                color: activeTab === 'staff' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: activeTab === 'staff' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
            >
              Motionz Staff
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('client');
                setErrorMessage(null);
                setMessage(null);
              }}
              style={{
                flex: 1,
                padding: 'var(--space-3)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'client' ? '2px solid var(--color-primary)' : 'none',
                color: activeTab === 'client' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: activeTab === 'client' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
            >
              Client Magic Link
            </button>
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
                marginBottom: 'var(--space-4)',
              }}
            >
              {errorMessage}
            </div>
          )}

          {message && (
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-status-done-bg)',
                border: '1px solid var(--color-status-done-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-status-done-text)',
                fontSize: 'var(--font-size-xs)',
                marginBottom: 'var(--space-4)',
              }}
            >
              {message}
            </div>
          )}

          {demoLink && (
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-primary-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <span style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>
                Demo Direct Access:
              </span>
              <a href={demoLink} style={{ wordBreak: 'break-all' }}>
                Activate Magic Link Session
              </a>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {activeTab === 'staff' ? (
              <>
                <Input
                  label="Internal Staff Email (@motionz.ai)"
                  type="email"
                  placeholder="name@motionz.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 'var(--space-1)' }}>
                    Staff Role
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button
                      type="button"
                      variant={staffRole === 'admin' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setStaffRole('admin')}
                      style={{ flex: 1 }}
                    >
                      Admin
                    </Button>
                    <Button
                      type="button"
                      variant={staffRole === 'csm' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setStaffRole('csm')}
                      style={{ flex: 1 }}
                    >
                      CSM
                    </Button>
                  </div>
                </div>
                <Button type="submit" variant="primary" fullWidth disabled={loading}>
                  {loading ? 'Authenticating...' : 'Sign In as Staff'}
                </Button>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-3)', textAlign: 'center' }}>
                  Restricted domain access. Unauthorized attempts are logged.
                </p>
              </>
            ) : (
              <>
                <Input
                  label="Client Organization Email"
                  type="email"
                  placeholder="john@abcroofing.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" fullWidth disabled={loading}>
                  {loading ? 'Sending...' : 'Send Magic Link'}
                </Button>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-3)', textAlign: 'center' }}>
                  We will send a single-use expiring link to access your portal.
                </p>
              </>
            )}
          </form>
        </Card>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
          <Link href="/" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <LoginForm />
    </React.Suspense>
  );
}
