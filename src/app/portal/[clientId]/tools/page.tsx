'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';
import { PORTAL_LINKS } from '@/lib/portal-links';

interface ToolItem {
  title: string;
  category: string;
  description: string;
  actionText: string;
  href: string;
  isExternal: boolean;
  badge?: string;
}

export default function ToolsAndResourcesPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const tools: ToolItem[] = [
    {
      title: 'Motionz Slack',
      category: 'Communication',
      description: 'Join the Motionz Slack workspace to talk with your CSM and the Motionz team.',
      actionText: 'Join Slack',
      href: PORTAL_LINKS.slackInvite,
      isExternal: true,
    },
    {
      title: 'Skool Community',
      category: 'Training',
      description: 'Motionz training, recordings and peer discussion. Request to join and Motionz will approve you.',
      actionText: 'Join Skool',
      href: PORTAL_LINKS.skoolCommunity,
      isExternal: true,
    },
    {
      title: 'Client Onboarding Intake Form',
      category: 'Business Setup',
      description: 'Tell us about your business so we can set up your ads, website and campaigns.',
      actionText: 'Open Onboarding Form',
      href: `/portal/${clientId}/onboarding`,
      isExternal: false,
    },
    {
      title: 'Carrier A2P 10DLC Verification Form',
      category: 'Carrier Compliance',
      description: 'Business details we need to register your phone number for texting with US carriers (A2P 10DLC), so your texts are not blocked.',
      actionText: 'Open A2P Form',
      href: `/portal/${clientId}/onboarding`,
      isExternal: false,
    },
    {
      title: 'Roof Measurement Tool',
      category: 'Estimating & Sales',
      description: 'Calculate residential and commercial roof surface areas, pitch multipliers, and squares.',
      actionText: 'Launch Roof Tool',
      href: `/portal/${clientId}/roof-measurement`,
      isExternal: false,
      badge: 'Built-in',
    },
    {
      title: 'Template-Based Video Scripts',
      category: 'Marketing & Brand',
      description: 'Personalized script generator interpolating your company name and owner name for high-converting ads.',
      actionText: 'View Video Scripts',
      href: `/portal/${clientId}/video-scripts`,
      isExternal: false,
    },
    {
      title: 'Campaign Tracking Sheet',
      category: 'Performance Analytics',
      description: 'Your Google Sheet for logging calls and outcomes and tracking leads, appointments, jobs won and revenue.',
      actionText: 'View Tracking Tab',
      href: `/portal/${clientId}/tracking`,
      isExternal: false,
    },
    {
      title: 'Book CSM Strategy Call',
      category: 'Account Management',
      description: 'Schedule a 1-on-1 strategy and onboarding review session with your assigned Motionz CSM.',
      actionText: 'Schedule Call',
      href: `/portal/${clientId}/book-call`,
      isExternal: false,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Tools & Resources</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Curated directory of contractor operational tools, external communities, and business platforms.
        </p>
      </div>

      {/* Grid of Tools */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        }}
      >
        {tools.map((tool) => (
          <Card key={tool.title} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {tool.category}
                </span>
                {tool.badge && (
                  <StatusBadge status={tool.badge} variant={tool.badge === 'Live' ? 'done' : 'progress'} />
                )}
              </div>
              <h2 style={{ fontSize: 'var(--font-size-md)', marginBottom: 'var(--space-2)' }}>
                {tool.title}
              </h2>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                {tool.description}
              </p>
            </div>

            <div>
              {tool.isExternal ? (
                <a href={tool.href} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" fullWidth size="sm">
                    {tool.actionText}
                  </Button>
                </a>
              ) : (
                <Link href={tool.href}>
                  <Button variant="primary" fullWidth size="sm">
                    {tool.actionText}
                  </Button>
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
