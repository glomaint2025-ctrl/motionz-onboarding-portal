'use client';

import React, { useState } from 'react';
import { Card, CardHeader, Button, Modal } from '@/components/ui';

export interface GHLOnboardingFormEmbedProps {
  formId?: string;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export const GHLOnboardingFormEmbed: React.FC<GHLOnboardingFormEmbedProps> = ({
  formId = 'wyM27h1ZCiwGoyXE03oC',
  isModal = false,
  isOpen = false,
  onClose = () => {},
}) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const formUrl = `https://api.leadconnectorhq.com/widget/form/${formId}`;

  const renderContent = () => (
    <div>
      <div style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
        Complete this official GoHighLevel onboarding form to submit your business details, target territory zip codes, and website branding preferences directly to your CSM.
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '620px',
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border-subtle)',
          overflow: 'hidden',
        }}
      >
        {!iframeLoaded && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--color-bg-card)',
              zIndex: 1,
              padding: 'var(--space-6)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-2)' }}>
              Loading GoHighLevel Onboarding Form...
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Connecting to secure form instance ({formId})
            </span>
            <a href={formUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Open in Dedicated Tab
              </Button>
            </a>
          </div>
        )}

        <iframe
          src={formUrl}
          style={{
            width: '100%',
            height: '650px',
            border: 'none',
            display: 'block',
          }}
          scrolling="yes"
          id={`msgsndr-form-${formId}`}
          onLoad={() => setIframeLoaded(true)}
          title="GoHighLevel Client Onboarding Intake Form"
        />
      </div>
    </div>
  );

  if (isModal) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="GoHighLevel Client Onboarding Form">
        {renderContent()}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" onClick={onClose}>
            Close Form
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Client Onboarding Intake Form"
        subtitle="GoHighLevel Form #wyM27h1ZCiwGoyXE03oC"
        action={
          <a href={formUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              Open Fullscreen Tab
            </Button>
          </a>
        }
      />
      {renderContent()}
    </Card>
  );
};
