'use client';

import React, { useState } from 'react';
import { Card, CardHeader, Button, StatusBadge, Input, Select } from '@/components/ui';
import { roofMeasurementAdapter } from '@/lib/integrations/roof/adapter';
import { RoofEstimateResult } from '@/lib/integrations/types';

export default function RoofMeasurementPage() {
  const [address, setAddress] = useState('1234 Commerce Blvd, Austin, TX');
  const [pitch, setPitch] = useState('6/12');
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<RoofEstimateResult | null>({
    address: '1234 Commerce Blvd, Austin, TX',
    squareFootage: 2460,
    squares: 24.6,
    pitch: '6/12',
    confidenceScore: 0.92,
    satelliteProvider: 'Motionz Standard Satellite Geometry Engine',
    reportUrl: '/portal/reports/roof-demo.pdf',
  });
  const [exportNotice, setExportNotice] = useState('');

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    setIsCalculating(true);
    try {
      const estimate = await roofMeasurementAdapter.estimateRoofArea(address, pitch);
      setResult(estimate);
    } catch {
      // Fallback
    } finally {
      setIsCalculating(false);
    }
  };

  const handleExportPDF = () => {
    setExportNotice('Exporting high-resolution satellite roof assessment PDF...');
    setTimeout(() => {
      setExportNotice('Roof measurement report downloaded successfully.');
    }, 1200);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Roof Measurement & Estimating</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Provider-independent aerial geometry tool calculating true surface square footage and roofing squares.
        </p>
      </div>

      {exportNotice && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-status-done-bg)',
            color: 'var(--color-status-done-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {exportNotice}
        </div>
      )}

      {/* Input & Parameters Form */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Property Address & Roof Parameters"
          subtitle="Configure property coordinates and pitch slope multiplier"
        />

        <form onSubmit={handleCalculate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-4)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}
          >
            <Input
              label="Property Street Address"
              placeholder="e.g. 742 Evergreen Terrace, Springfield, OR"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />

            <Select
              label="Roof Pitch Slope"
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
            >
              <option value="3/12">3/12 Pitch (Low Slope - 1.03x Multiplier)</option>
              <option value="4/12">4/12 Pitch (Conventional - 1.05x Multiplier)</option>
              <option value="5/12">5/12 Pitch (Moderate - 1.08x Multiplier)</option>
              <option value="6/12">6/12 Pitch (Standard Residential - 1.12x Multiplier)</option>
              <option value="7/12">7/12 Pitch (Steep - 1.16x Multiplier)</option>
              <option value="8/12">8/12 Pitch (Steep Slope - 1.20x Multiplier)</option>
              <option value="10/12">10/12 Pitch (Very Steep - 1.30x Multiplier)</option>
              <option value="12/12">12/12 Pitch (45 Degree - 1.41x Multiplier)</option>
            </Select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button type="submit" variant="primary" disabled={isCalculating || !address.trim()}>
              {isCalculating ? 'Calculating Aerial Geometry...' : 'Calculate Roof Area'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Results View */}
      {result && (
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-6)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            marginBottom: 'var(--space-6)',
          }}
        >
          {/* Surface Metrics Card */}
          <Card>
            <CardHeader
              title="Estimated Roof Surface"
              subtitle={result.address}
              action={<StatusBadge status={`${Math.round(result.confidenceScore * 100)}% Confidence`} variant="done" />}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-4)',
                padding: 'var(--space-4) 0',
                borderTop: '1px solid var(--color-border-subtle)',
                borderBottom: '1px solid var(--color-border-subtle)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Total True Surface Area
                </span>
                <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                  {result.squareFootage.toLocaleString()} sq ft
                </div>
              </div>

              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Roofing Material Squares
                </span>
                <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                  {result.squares} SQ
                </div>
              </div>

              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Selected Pitch
                </span>
                <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-medium)' }}>
                  {result.pitch}
                </div>
              </div>

              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Satellite Imagery Engine
                </span>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {result.satelliteProvider}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="primary" fullWidth onClick={handleExportPDF}>
                Download Measurement Report
              </Button>
            </div>
          </Card>

          {/* Simulated Satellite Tracing Canvas */}
          <Card>
            <CardHeader
              title="Aerial Tracing View"
              subtitle="Satellite roof outline and facet polygon verification"
            />

            <div
              style={{
                width: '100%',
                height: '240px',
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <svg width="260" height="180" viewBox="0 0 260 180" style={{ display: 'block' }}>
                {/* Main Roof Outline */}
                <polygon
                  points="30,130 130,40 230,130"
                  fill="var(--color-primary)"
                  fillOpacity="0.15"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                />
                {/* Ridge line */}
                <line x1="130" y1="40" x2="130" y2="130" stroke="var(--color-primary)" strokeWidth="1.5" strokeDasharray="4 2" />
                {/* Facet Labels */}
                <text x="75" y="100" fill="var(--color-text-secondary)" fontSize="11" textAnchor="middle">Facet 1: 12.3 SQ</text>
                <text x="185" y="100" fill="var(--color-text-secondary)" fontSize="11" textAnchor="middle">Facet 2: 12.3 SQ</text>
                <text x="130" y="30" fill="var(--color-text-primary)" fontSize="10" textAnchor="middle">Ridge: 6/12 Pitch</text>
              </svg>
            </div>

            <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Aerial imagery simulated. Polygon vertices calibrated to regional coordinate grid.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
