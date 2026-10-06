'use client';

import React from 'react';
import { Card, CardHeader, Button } from '@/components/ui';
import { GhlFormFrame, GhlFormModal } from '@/components/portal/GhlFormModal';
import { ghlFormUrl } from '@/lib/portal-links';
import { FORM_SETTING_DEFAULTS } from '@/lib/ghl-forms';

export interface GHLOnboardingFormEmbedProps {
  /** The form set by an admin on Settings & Integrations. Falls back to the built-in form. */
  formId?: string;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  /** Pre-fills the form's email so the submission is matched to this client's portal. */
  prefillEmail?: string;
}

const TITLE = 'Onboarding form';

export const GHLOnboardingFormEmbed: React.FC<GHLOnboardingFormEmbedProps> = ({
  formId: formIdProp,
  isModal = false,
  isOpen = false,
  onClose = () => {},
  prefillEmail,
}) => {
  const formId = formIdProp || FORM_SETTING_DEFAULTS.onboarding_form_id;
  const intro = (
    <>
      Tell us about your business, the areas you serve and how you want your website to look. Your answers go
      straight to your CSM.
    </>
  );

  if (isModal) {
    return (
      <GhlFormModal
        formId={formId}
        title={TITLE}
        isOpen={isOpen}
        onClose={onClose}
        prefillEmail={prefillEmail}
        intro={intro}
      />
    );
  }

  return (
    <Card>
      <CardHeader
        title={TITLE}
        subtitle="About your business"
        action={
          <a href={ghlFormUrl(formId, prefillEmail)} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              Open in new tab
            </Button>
          </a>
        }
      />
      <div style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
        {intro}
      </div>
      <GhlFormFrame formId={formId} title={TITLE} prefillEmail={prefillEmail} />
    </Card>
  );
};
