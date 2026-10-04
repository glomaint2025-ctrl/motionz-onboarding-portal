'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { buttonClasses } from '@/components/ui';
import { Icon, type IconName } from '@/components/brand/Icon';
import { SlackLogo } from '@/components/brand/SlackLogo';
import { SkoolLogo } from '@/components/brand/SkoolLogo';
import { PORTAL_LINKS } from '@/lib/portal-links';

interface ToolItem {
  title: string;
  category: string;
  description: string;
  actionText: string;
  href: string;
  isExternal: boolean;
  /** Module that must be switched on for this card to show. */
  featureKey?: string;
  visual: React.ReactNode;
  featured?: boolean;
}

interface ToolSection {
  id: string;
  title: string;
  subtitle: string;
  items: ToolItem[];
}

function IconTile({ name, tone = 'icon' }: { name: IconName; tone?: 'icon' | 'green' }) {
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

  // Cards for sections that are switched off are hidden. Until the settings load, only the
  // always-available cards (Slack, Skool) are shown.
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/portal/${clientId}/data`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) setFeatureToggles(data.featureToggles || {});
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const isOn = (item: ToolItem) =>
    !item.featureKey || (featureToggles !== null && featureToggles[item.featureKey] !== false);

  const allSections: ToolSection[] = [
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
      id: 'grow',
      title: 'Win more jobs',
      subtitle: 'Everyday tools for quoting and filming.',
      items: [
        {
          title: 'Roof Measurement',
          category: 'Estimating',
          description: "Measure a roof's area, squares and pitch from an address.",
          actionText: 'Measure a roof',
          href: `/portal/${clientId}/roof-measurement`,
          isExternal: false,
          featureKey: 'roof_measurement',
          visual: <IconTile name="roof" tone="green" />,
        },
        {
          title: 'Video Scripts',
          category: 'Ads and content',
          description: 'Ready-to-film ad scripts personalized with your company and owner name.',
          actionText: 'View scripts',
          href: `/portal/${clientId}/video-scripts`,
          isExternal: false,
          featureKey: 'video_scripts',
          visual: <IconTile name="video" />,
        },
      ],
    },
  ];

  const sections = allSections
    .map((section) => ({ ...section, items: section.items.filter(isOn) }))
    .filter((section) => section.items.length > 0);

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
