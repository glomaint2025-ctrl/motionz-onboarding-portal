'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, Input, Skeleton, StatusBadge } from '@/components/ui';
import type { RoofMeasurementResult } from '@/lib/integrations/roof/solar';

interface RecentMeasurement {
  id: string;
  address: string;
  squares?: number;
  pitch?: string;
  created_at: string;
  result_data?: RoofMeasurementResult;
}

export default function RoofMeasurementPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [recent, setRecent] = useState<RecentMeasurement[]>([]);
  const [address, setAddress] = useState('');
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RoofMeasurementResult | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${clientId}/roof-measurement`)
      .then((res) => res.json())
      .then((data) => {
        setConfigured(Boolean(data.configured));
        setRecent(data.recent || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  const measure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    setMeasuring(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${clientId}/roof-measurement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.result);
        setRecent((list) => [
          { id: String(Date.now()), address: data.result.formattedAddress, squares: data.result.squares, pitch: data.result.predominantPitch, created_at: new Date().toISOString(), result_data: data.result },
          ...list,
        ]);
      } else {
        setError(data.error || 'Could not measure this roof.');
      }
    } catch {
      setError('Network error while measuring.');
    } finally {
      setMeasuring(false);
    }
  };

  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>{label}</span>
      <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)' }}>{value}</span>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Roof Measurement</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Enter a property address to get the roof area, roofing squares and pitch from satellite data.
        </p>
      </div>

      {loading ? (
        <Card>
          <Skeleton height="80px" />
        </Card>
      ) : !configured ? (
        <Card>
          <CardHeader title="Coming soon" />
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            The roof measurement tool is being connected. It will be available here shortly.
          </p>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 'var(--space-6)' }}>
            <form onSubmit={measure} style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 320px' }}>
                <Input
                  label="Property address"
                  placeholder="123 Main St, Austin, TX 78701"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="primary" disabled={measuring}>
                {measuring ? 'Measuring...' : 'Measure roof'}
              </Button>
            </form>
            {error && <p style={{ color: 'var(--color-status-danger-text)', margin: 'var(--space-3) 0 0' }}>{error}</p>}
          </Card>

          {result && (
            <Card style={{ marginBottom: 'var(--space-6)' }}>
              <CardHeader
                title={result.formattedAddress}
                subtitle={`Satellite imagery quality: ${result.imageryQuality.toLowerCase()}${result.imageryDate ? ` · captured ${result.imageryDate}` : ''}`}
              />
              <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 'var(--space-5)' }}>
                {fact('Roof area', `${result.roofAreaSqFt.toLocaleString()} sq ft`)}
                {fact('Roofing squares', result.squares)}
                {fact('Squares + 10% waste', result.squaresWithWaste)}
                {fact('Main pitch', result.predominantPitch)}
                {fact('Roof facets', result.facets)}
                {fact('Footprint', `${result.footprintSqFt.toLocaleString()} sq ft`)}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                      <th style={{ padding: 'var(--space-2)' }}>Facet</th>
                      <th style={{ padding: 'var(--space-2)' }}>Pitch</th>
                      <th style={{ padding: 'var(--space-2)' }}>Faces</th>
                      <th style={{ padding: 'var(--space-2)' }}>Area</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.segments.map((s, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                        <td style={{ padding: 'var(--space-2)' }}>{i + 1}</td>
                        <td style={{ padding: 'var(--space-2)' }}>{s.pitch}</td>
                        <td style={{ padding: 'var(--space-2)' }}>{s.facing}</td>
                        <td style={{ padding: 'var(--space-2)' }}>{s.areaSqFt.toLocaleString()} sq ft</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 'var(--space-4) 0 0' }}>
                Estimates from Google satellite data. Always confirm on site before ordering materials.
              </p>
            </Card>
          )}

          <Card>
            <CardHeader title="Recent measurements" />
            {recent.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No measurements yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {recent.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => m.result_data && setResult(m.result_data)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      background: 'transparent',
                      color: 'inherit',
                      textAlign: 'left',
                      cursor: m.result_data ? 'pointer' : 'default',
                    }}
                  >
                    <span>{m.address}</span>
                    <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', whiteSpace: 'nowrap' }}>
                      {m.squares !== undefined && <StatusBadge status={`${m.squares} sq`} variant="progress" />}
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {new Date(m.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
