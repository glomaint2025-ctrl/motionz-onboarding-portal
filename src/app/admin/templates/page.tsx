'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Master Portal Templates</h1>
          <p>Govern baseline onboarding milestones and script blueprints cloned into client portals.</p>
        </div>
        <Link href="/admin/clients/new">
          <Button variant="primary">
            Provision Client from Template
          </Button>
        </Link>
      </div>

      {/* Template Header Card */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title={template.title}
          subtitle={`Slug: ${template.slug} · Version: ${template.version}`}
          action={<StatusBadge status="Canonical Default" variant="done" />}
        />
        <p>{template.description}</p>
      </Card>

      {/* The 5 Baseline Confirmed Setup Steps */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>
          Baseline Setup Step Blueprints (5 Confirmed Steps)
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {baseSteps.map((step, idx) => (
            <Card key={step.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                    STEP {idx + 1}
                  </span>
                  <h3 style={{ fontSize: 'var(--font-size-base)', margin: 'var(--space-1) 0' }}>
                    {step.name}
                  </h3>
                </div>
                <StatusBadge status={`Owner: ${step.owner}`} variant="progress" />
              </div>
              <p style={{ marginBottom: 'var(--space-2)' }}>
                <strong>What it is:</strong> {step.whatItIs}
              </p>
              <p style={{ marginBottom: 'var(--space-2)' }}>
                <strong>Default Initial State:</strong> {step.rightNow}
              </p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                <strong>Unlocks:</strong> {step.unlocks}
              </p>
            </Card>
          ))}
        </div>
      </div>

      {/* 3 Base Script Blueprints */}
      <div>
        <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>
          Base Video Script Blueprints (3 Confirmed Scripts)
        </h2>
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {baseScripts.map((script) => (
            <Card key={script.title}>
              <CardHeader title={script.title} />
              <p style={{ fontSize: 'var(--font-size-sm)', fontStyle: 'italic', color: 'var(--color-text-secondary)', lineHeight: 'var(--line-height-relaxed)' }}>
                &ldquo;{script.content}&rdquo;
              </p>
              <span style={{ display: 'block', marginTop: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Variables: &#123;&#123;client_name&#125;&#125;, &#123;&#123;company_name&#125;&#125;
              </span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
