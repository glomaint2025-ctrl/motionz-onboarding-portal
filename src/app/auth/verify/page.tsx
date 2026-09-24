'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No verification token supplied.');
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Verification failed.');
        } else {
          setSuccess(true);
          setTimeout(() => {
            router.push(data.redirectTo || '/portal/demo');
          }, 1200);
        }
      } catch (err: any) {
        setError(err.message || 'Network error during verification.');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token, router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-4)' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--color-primary)' }}>
            Motionz
          </span>
          <p style={{ marginTop: 'var(--space-1)' }}>Magic Link Verification</p>
        </div>

        <Card>
          {loading && (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <StatusBadge status="Verifying Token" variant="progress" />
              <p style={{ marginTop: 'var(--space-4)' }}>
                Validating your secure single-use access link...
              </p>
            </div>
          )}

          {!loading && success && (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <StatusBadge status="Authenticated" variant="done" />
              <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 'var(--space-3) 0 var(--space-2)' }}>
                Session Established
              </h2>
              <p>Entering your private client portal...</p>
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
              <StatusBadge status="Access Denied" variant="danger" />
              <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 'var(--space-3) 0 var(--space-2)' }}>
                Invalid or Expired Link
              </h2>
              <p style={{ color: 'var(--color-status-danger-text)', marginBottom: 'var(--space-5)' }}>
                {error}
              </p>
              <Link href="/auth/login">
                <Button variant="primary" fullWidth>
                  Request a New Magic Link
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <VerifyContent />
    </React.Suspense>
  );
}
