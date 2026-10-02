'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function TemplatesPage() {
  const [template] = useState({
    title: 'Motionz Standard Portal Template',
    version: '1.0.0',
    slug: 'standard-template',
    description: 'Canonical baseline portal blueprint containing the 5 confirmed onboarding setup steps and 3 base video scripts.',
  });

  const baseSteps = [
    {
      key: 'google_sheet',
      name: 'Google Sheet',
      owner: 'WE HANDLE',
      whatItIs: 'Setting up your campaign tracking sheet with automated lead and performance metrics.',
      rightNow: 'Motionz team is preparing your custom tracking sheet.',
      unlocks: 'Live campaign tracking in the Tracking tab.',
    },
    {
      key: 'ghl_a2p',
      name: 'GoHighLevel / A2P Verified',
      owner: 'WE HANDLE',
      whatItIs: 'Configuring your GoHighLevel sub-account, pipelines, and carrier A2P 10DLC registration.',
      rightNow: 'Registration submitted to carrier networks for verification.',
      unlocks: 'Direct lead synchronization, SMS messaging, and appointment booking.',
    },
    {
      key: 'facebook',
      name: 'Facebook',
      owner: 'YOUR ACTION',
      whatItIs: 'Connecting your business Facebook page and ad account access for lead generation.',
      rightNow: 'Awaiting client access delegation or page confirmation.',
      unlocks: 'Targeted paid advertising and lead campaign launch.',
    },
    {
      key: 'domain_web',
      name: 'Domain, email & website',
      owner: 'WE HANDLE',
      whatItIs: 'Provisioning your custom domain, business email accounts, and launching your company website.',
      rightNow: 'Domain records configured and SSL certificates generated.',
      unlocks: 'Professional online web presence and verified email delivery.',
    },
    {
      key: 'phone_system',
      name: 'Phone system & A2P texting',
      owner: 'WE HANDLE',
      whatItIs: 'Provisioning your local business phone number and configuring call forwarding and texting.',
      rightNow: 'Phone system routing rules configured.',
      unlocks: 'Direct two-way calling and carrier-compliant customer SMS.',
    },
  ];

  const baseScripts = [
    {
      title: 'Script 1: Introduction and Brand Story',
      content: 'Hello, I am {{client_name}} with {{company_name}}. We specialize in providing residential and commercial roof restoration and inspections throughout our local community. Our team is committed to safety, reliability, and long-lasting quality.',
    },
    {
      title: 'Script 2: Service Offer and Customer Value',
      content: 'At {{company_name}}, we know your roof is your property first line of defense. My name is {{client_name}}, and we offer comprehensive roof assessments designed to identify issues before they lead to expensive structural damage.',
    },
    {
      title: 'Script 3: Call to Action and Inspection Booking',
      content: 'Looking for honest, professional roofing services? Reach out to {{client_name}} at {{company_name}} today to schedule your complimentary inspection.',
    },
  ];

  return (
    <div>
      {/* 1. Breadcrumb */}
      <div className="ui-breadcrumb">
        <Link href="/admin">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Master Templates</span>
      </div>

      {/* 2. Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
            Master Portal Templates
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            Govern baseline onboarding milestones and script blueprints cloned into client portals.
          </p>
        </div>
        <Link href="/admin/clients/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#2563eb', padding: '9px 18px', fontWeight: 600, borderRadius: 'var(--radius-md)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Provision Client from Template
          </Button>
        </Link>
      </div>

      {/* 3. Template Hero Card */}
      <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ui-stat-icon-wrapper ui-stat-icon-blue" style={{ width: '40px', height: '40px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                {template.title}
              </h2>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Slug: <code style={{ color: '#38bdf8' }}>{template.slug}</code> · Version: {template.version}
              </span>
            </div>
          </div>
          <span className="ui-pill-status ui-pill-status-active">
            <span className="ui-pill-status-dot" />
            Canonical Default
          </span>
        </div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 'var(--space-2) 0 0 0', lineHeight: 1.5 }}>
          {template.description}
        </p>
      </div>

      {/* 4. The 5 Baseline Confirmed Setup Steps */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)' }}>
          Baseline Setup Step Blueprints (5 Confirmed Steps)
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {baseSteps.map((step, idx) => (
            <div
              key={step.key}
              className="ui-stat-card"
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '20px 24px',
                borderLeft: '4px solid #3b82f6',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#38bdf8',
                    }}
                  >
                    STEP {idx + 1}
                  </span>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                    {step.name}
                  </h3>
                </div>
                <span className={`ui-pill-status ${step.owner === 'WE HANDLE' ? 'ui-pill-status-active' : 'ui-pill-status-onboarding'}`}>
                  <span className="ui-pill-status-dot" />
                  {step.owner}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)', width: '100%' }}>
                <div style={{ padding: '12px', backgroundColor: '#0b121c', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    What it is
                  </span>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    {step.whatItIs}
                  </p>
                </div>

                <div style={{ padding: '12px', backgroundColor: '#0b121c', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Default Initial State
                  </span>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    {step.rightNow}
                  </p>
                </div>

                <div style={{ padding: '12px', backgroundColor: '#0b121c', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#10b981', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Unlocks
                  </span>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                    {step.unlocks}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 3 Base Script Blueprints */}
      <div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)' }}>
          Base Video Script Blueprints (3 Confirmed Scripts)
        </h2>
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {baseScripts.map((script) => (
            <div
              key={script.title}
              className="ui-stat-card"
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '20px',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 var(--space-3) 0' }}>
                  {script.title}
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', fontStyle: 'italic', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  &ldquo;{script.content}&rdquo;
                </p>
              </div>
              <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-2)', borderTop: '1px solid rgba(255, 255, 255, 0.06)', width: '100%' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  Variables: <code style={{ color: '#38bdf8' }}>&#123;&#123;client_name&#125;&#125;</code>, <code style={{ color: '#38bdf8' }}>&#123;&#123;company_name&#125;&#125;</code>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
