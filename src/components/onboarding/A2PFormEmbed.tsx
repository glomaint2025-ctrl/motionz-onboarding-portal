'use client';

import React from 'react';
import { Card, CardHeader, Button } from '@/components/ui';
import { GhlFormFrame, GhlFormModal } from '@/components/portal/GhlFormModal';
import { ghlFormUrl } from '@/lib/portal-links';
import { FORM_SETTING_DEFAULTS } from '@/lib/ghl-forms';

export interface A2PFormEmbedProps {
  /** The form set by an admin on Settings & Integrations. Falls back to the built-in form. */
  formId?: string;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  /** Pre-fills the form's email so the submission is matched to this client's portal. */
  prefillEmail?: string;
}

const TITLE = 'Texting registration form';

export const A2PFormEmbed: React.FC<A2PFormEmbedProps> = ({
  formId: formIdProp,
  isModal = false,
  isOpen = false,
  onClose = () => {},
  prefillEmail,
}) => {
  const formId = formIdProp || FORM_SETTING_DEFAULTS.a2p_form_id;
  const notice = (
    <div
      style={{
        padding: 'var(--space-3)',
        backgroundColor: 'var(--color-status-progress-bg)',
        color: 'var(--color-status-progress-text)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-status-progress-border)',
        fontSize: 'var(--font-size-xs)',
      }}
    >
      <strong>Before you start:</strong> US phone carriers check these details before they let a business text
      its leads. Enter your EIN and your legal business name exactly as they appear on your tax records.
    </div>
  );

  if (isModal) {
    return (
      <GhlFormModal
        formId={formId}
        title={TITLE}
        isOpen={isOpen}
        onClose={onClose}
        prefillEmail={prefillEmail}
        intro={notice}
      />
    );
  }

  return (
    <Card>
      <CardHeader
        title={TITLE}
        subtitle="Needed before we can text your leads"
        action={
          <a href={ghlFormUrl(formId, prefillEmail)} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              Open in new tab
            </Button>
          </a>
        }
      />
      <div style={{ marginBottom: 'var(--space-4)' }}>{notice}</div>
      <GhlFormFrame formId={formId} title={TITLE} prefillEmail={prefillEmail} />
    </Card>
  );
};
