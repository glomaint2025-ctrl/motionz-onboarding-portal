'use client';

import React from 'react';
import Link from 'next/link';
import { PORTAL_LINKS } from '@/lib/portal-links';
import { Icon } from '@/components/brand/Icon';
import { SlackLogo } from '@/components/brand/SlackLogo';
import { SkoolLogo } from '@/components/brand/SkoolLogo';

export interface QuickLinksBarProps {
  clientId: string;
  onOpenGHLForm: () => void;
  onOpenA2PForm: () => void;
}

export const QuickLinksBar: React.FC<QuickLinksBarProps> = ({
  clientId,
  onOpenGHLForm,
  onOpenA2PForm,
}) => {
  return (
    <section className="quick-links" aria-labelledby="quick-links-title">
      <div className="quick-links-head">
        <div>
          <h2 className="quick-links-title" id="quick-links-title">Quick links</h2>
          <p className="quick-links-sub">Your forms, community and a direct line to your CSM.</p>
        </div>
      </div>

      <div className="quick-links-grid">
        <a href={PORTAL_LINKS.slackInvite} target="_blank" rel="noopener noreferrer" className="quick-link">
          <span className="logo-tile logo-tile-sm" aria-hidden="true">
            <SlackLogo size={16} title="" />
          </span>
          <span className="quick-link-text">
            Join Slack
            <span className="quick-link-hint">Chat with the Motionz team</span>
          </span>
          <Icon name="external" size={16} className="quick-link-arrow" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>

        <a href={PORTAL_LINKS.skoolCommunity} target="_blank" rel="noopener noreferrer" className="quick-link">
          <span className="logo-tile logo-tile-sm" aria-hidden="true">
            <SkoolLogo size={20} variant="mark" title="" />
          </span>
          <span className="quick-link-text">
            Join Skool
            <span className="quick-link-hint">Training and community</span>
          </span>
          <Icon name="external" size={16} className="quick-link-arrow" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>

        <button type="button" className="quick-link" onClick={onOpenGHLForm}>
          <span className="logo-tile logo-tile-sm logo-tile-icon" aria-hidden="true">
            <Icon name="form" size={16} />
          </span>
          <span className="quick-link-text">
            Onboarding form
            <span className="quick-link-hint">About your business</span>
          </span>
          <Icon name="chevron-right" size={16} className="quick-link-arrow" />
        </button>

        <button type="button" className="quick-link" onClick={onOpenA2PForm}>
          <span className="logo-tile logo-tile-sm logo-tile-icon" aria-hidden="true">
            <Icon name="message" size={16} />
          </span>
          <span className="quick-link-text">
            A2P texting form
            <span className="quick-link-hint">Carrier registration</span>
          </span>
          <Icon name="chevron-right" size={16} className="quick-link-arrow" />
        </button>

        <Link href={`/portal/${clientId}/book-call`} className="quick-link quick-link-primary">
          <span className="logo-tile logo-tile-sm logo-tile-warm" aria-hidden="true">
            <Icon name="calendar" size={16} />
          </span>
          <span className="quick-link-text">
            Book a CSM call
            <span className="quick-link-hint">Pick a time that suits you</span>
          </span>
          <Icon name="arrow-right" size={16} className="quick-link-arrow" />
        </Link>
      </div>
    </section>
  );
};
