'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Skeleton } from '@/components/ui';

interface ContractRecord {
  id: string;
  title: string;
  document_url?: string;
  signed_at?: string;
  ghl_document_id?: string;
  created_at: string;
}

export default function SignedContractPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/portal/${clientId}/contracts`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!isMounted) return;
        if (res.ok) setContracts(data.contracts || []);
        else setError(res.status === 403 ? 'You do not have access to contracts.' : 'Could not load contracts.');
      })
      .catch(() => isMounted && setError('Network error while loading contracts.'))
      .finally(() => isMounted && setIsLoading(false));
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Signed Contract</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Your signed agreement with Motionz.</p>
      </div>

      {isLoading ? (
        <Card>
          <Skeleton width="280px" height="22px" style={{ marginBottom: '8px' }} />
          <Skeleton width="180px" height="14px" />
        </Card>
      ) : error ? (
        <Card>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{error}</p>
        </Card>
      ) : contracts.length === 0 ? (
        <Card>
          <CardHeader title="No signed contract yet" />
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Your agreement will appear here once it has been signed. If you think this is a mistake, contact your CSM.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {contracts.map((contract) => (
            <Card key={contract.id}>
              <CardHeader
                title={contract.title}
                subtitle={
                  contract.signed_at
                    ? `Signed ${new Date(contract.signed_at).toLocaleDateString()}`
                    : 'Awaiting signature'
                }
                action={
                  <StatusBadge
                    status={contract.signed_at ? 'Signed' : 'Pending'}
                    variant={contract.signed_at ? 'done' : 'pending'}
                  />
                }
              />
              {contract.document_url ? (
                <a href={contract.document_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary">Open document</Button>
                </a>
              ) : (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
                  The document file has not been attached yet.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
