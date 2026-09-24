import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-bg-surface)',
          padding: 'var(--space-4) var(--space-6)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: 'var(--color-primary)' }}>
          Motionz
        </span>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          Private Client Operations Portal
        </span>
      </header>

      <main className="portal-container" style={{ flex: 1, padding: 'var(--space-8) var(--space-4)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ marginBottom: 'var(--space-8)', textAlign: 'center' }}>
            <h1 style={{ fontSize: 'var(--font-size-3xl)', marginBottom: 'var(--space-3)' }}>
              Motionz Client Portal
            </h1>
            <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-secondary)' }}>
              Secure, multi-tenant portal for client onboarding, setup tracking, GoHighLevel lead visibility, campaign tracking, and operational tools.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {/* Client Portal Access */}
            <Card interactive>
              <CardHeader
                title="Client Portal"
                subtitle="Demo Tenant: ABC Roofing"
                action={<StatusBadge status="Client" variant="progress" />}
              />
              <p style={{ marginBottom: 'var(--space-4)' }}>
                Access setup progress, lead and appointment pipeline, tracking sheets, signed contract, orders, and tools.
              </p>
              <Link href="/portal/demo">
                <Button variant="primary" fullWidth>
                  Enter Client Portal
                </Button>
              </Link>
            </Card>

            {/* CSM Workspace Access */}
            <Card interactive>
              <CardHeader
                title="CSM Workspace"
                subtitle="Customer Success Operations"
                action={<StatusBadge status="CSM" variant="done" />}
              />
              <p style={{ marginBottom: 'var(--space-4)' }}>
                Review assigned client portals, update setup progress statuses, edit instructional copy, and support clients.
              </p>
              <Link href="/csm">
                <Button variant="secondary" fullWidth>
                  Enter CSM Workspace
                </Button>
              </Link>
            </Card>

            {/* Admin Command Center Access */}
            <Card interactive>
              <CardHeader
                title="Admin Command Center"
                subtitle="Platform Management"
                action={<StatusBadge status="Admin" variant="warning" />}
              />
              <p style={{ marginBottom: 'var(--space-4)' }}>
                Provision new client tenants, duplicate templates, manage feature toggles, inspect security logs, and oversee integrations.
              </p>
              <Link href="/admin">
                <Button variant="outline" fullWidth>
                  Enter Admin Portal
                </Button>
              </Link>
            </Card>
          </div>

          <div
            style={{
              marginTop: 'var(--space-8)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-bg-surface)',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Internal staff access restricted to @motionz.ai accounts. External clients access portals via secure expiring single-use magic links.
            </p>
          </div>
        </div>
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-bg-surface)',
          padding: 'var(--space-4)',
          textAlign: 'center',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-muted)',
        }}
      >
        Motionz Client Portal &copy; 2026 Motionz.ai. All rights reserved.
      </footer>
    </div>
  );
}
