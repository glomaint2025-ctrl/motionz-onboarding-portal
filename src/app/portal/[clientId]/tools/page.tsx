'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { buttonClasses } from '@/components/ui';
import { Icon, type IconName } from '@/components/brand/Icon';
import { SlackLogo } from '@/components/brand/SlackLogo';
import { SkoolLogo } from '@/components/brand/SkoolLogo';
import { GoogleSheetsLogo } from '@/components/brand/GoogleSheetsLogo';
import { PORTAL_LINKS } from '@/lib/portal-links';

interface ToolItem {
  title: string;
  category: string;
  description: string;
  actionText: string;
  href: string;
  isExternal: boolean;
  visual: React.ReactNode;
  featured?: boolean;
}

interface ToolSection {
  id: string;
  title: string;
  subtitle: string;
  items: ToolItem[];
}

function IconTile({ name, tone = 'icon' }: { name: IconName; tone?: 'icon' | 'warm' | 'green' }) {
  return (
    <span className={`logo-tile logo-tile-${tone}`} aria-hidden="true">
      <Icon name={name} size={24} />
    </span>
  );
}

function LogoTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="logo-tile" aria-hidden="true">
      {children}
    </span>
  );
}

export default function ToolsAndResourcesPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const sections: ToolSection[] = [
    {
      id: 'connect',
      title: 'Stay connected',
      subtitle: 'Where you talk to the Motionz team and learn from other owners.',
      items: [
        {
          title: 'Motionz Slack',
          category: 'Chat with your team',
          description: 'Message your CSM and the Motionz team directly. The fastest way to get a quick answer.',
          actionText: 'Join Slack',
          href: PORTAL_LINKS.slackInvite,
          isExternal: true,
          featured: true,
          visual: (
            <LogoTile>
              <SlackLogo size={26} title="" />
            </LogoTile>
          ),
        },
        {
          title: 'Skool Community',
          category: 'Training and community',
          description: 'Training videos, call recordings and discussion with other roofing owners. Request to join and we will approve you.',
          actionText: 'Join Skool',
          href: PORTAL_LINKS.skoolCommunity,
          isExternal: true,
          featured: true,
          visual: (
            <LogoTile>
              <SkoolLogo size={17} title="" />
            </LogoTile>
          ),
        },
      ],
    },
    {
      id: 'setup',
      title: 'Get set up',
      subtitle: 'A couple of forms we need before your campaigns go live.',
      items: [
        {
          title: 'Onboarding Form',
          category: 'Business details',
          description: 'Tell us about your business so we can build your ads, website and follow-up campaigns.',
          actionText: 'Open onboarding form',
          href: `/portal/${clientId}/onboarding`,
          isExternal: false,
          visual: <IconTile name="form" />,
        },
        {
          title: 'Texting Registration (A2P 10DLC)',
          category: 'Carrier compliance',
          description: 'US carriers require this before we can text your leads. It keeps your messages from being blocked.',
          actionText: 'Open A2P form',
          href: `/portal/${clientId}/onboarding`,
          isExternal: false,
          visual: <IconTile name="message" />,
        },
        {
          title: 'Book a Call with Your CSM',
          category: 'One-on-one help',
          description: 'Pick a time to walk through your setup, campaigns or results with your Motionz CSM.',
          actionText: 'Pick a time',
          href: `/portal/${clientId}/book-call`,
          isExternal: false,
          visual: <IconTile name="calendar" tone="warm" />,
        },
      ],
    },
    {
      id: 'grow',
      title: 'Win more jobs',
      subtitle: 'Everyday tools for quoting, filming and tracking results.',
      items: [
        {
          title: 'Results Tracking Sheet',
          category: 'Google Sheets',
          description: 'Log calls and outcomes, and track leads, appointments, jobs won and revenue in your own Google Sheet.',
          actionText: 'Open tracking',
          href: `/portal/${clientId}/tracking`,
          isExternal: false,
          visual: (
            <LogoTile>
              <GoogleSheetsLogo size={28} title="" />
            </LogoTile>
          ),
        },
        {
          title: 'Roof Measurement',
          category: 'Estimating',
          description: 'Measure a roof from its address and get the area, pitch and squares for your quote.',
          actionText: 'Measure a roof',
          href: `/portal/${clientId}/roof-measurement`,
          isExternal: false,
          visual: <IconTile name="roof" tone="green" />,
        },
        {
          title: 'Video Scripts',
          category: 'Ads and content',
          description: 'Ready-to-film ad scripts personalized with your company and owner name.',
          actionText: 'View scripts',
          href: `/portal/${clientId}/video-scripts`,
          isExternal: false,
          visual: <IconTile name="video" />,
        },
      ],
    },
  ];

  return (
    <div>
      <header className="ui-page-header">
        <div>
          <span className="ui-page-eyebrow">Resources</span>
          <h1 className="ui-page-title">Tools &amp; Resources</h1>
          <p className="ui-page-subtitle">
            Everything you need to work with Motionz, in one place.
          </p>
        </div>
      </header>

      {sections.map((section) => (
        <section className="ui-section" key={section.title} aria-labelledby={`tools-${section.id}`}>
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title" id={`tools-${section.id}`}>{section.title}</h2>
              <p className="ui-section-subtitle">{section.subtitle}</p>
            </div>
          </div>

          <div className="resource-grid">
            {section.items.map((tool) => (
              <article
                key={tool.title}
                className={`resource-card ${tool.featured ? 'resource-card-featured' : ''}`.trim()}
              >
                <div className="resource-card-head">
                  {tool.visual}
                  <div style={{ minWidth: 0 }}>
                    <div className="resource-card-category">{tool.category}</div>
                    <h3 className="resource-card-title">{tool.title}</h3>
                  </div>
                </div>

                <p className="resource-card-desc">{tool.description}</p>

                <div className="resource-card-action">
                  {tool.isExternal ? (
                    <a
                      href={tool.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses({ variant: 'primary', fullWidth: true })}
                    >
                      {tool.actionText}
                      <Icon name="external" size={16} />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <Link href={tool.href} className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
                      {tool.actionText}
                      <Icon name="arrow-right" size={16} />
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
