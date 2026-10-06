'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { GhlFormModal } from './GhlFormModal';

type LeadFormKey = 'lead_replacement_form_id' | 'unresponsive_lead_form_id';

const LEAD_FORMS: { key: LeadFormKey; button: string; title: string; intro: string }[] = [
  {
    key: 'lead_replacement_form_id',
    button: 'Request a lead replacement',
    title: 'Request a lead replacement',
    intro: 'Tell us which lead you would like replaced. Your request goes straight to your Motionz team.',
  },
  {
    key: 'unresponsive_lead_form_id',
    button: 'Report an unresponsive lead',
    title: 'Report an unresponsive lead',
    intro: 'Tell us which lead is not responding. Your report goes straight to your Motionz team.',
  },
];

/**
 * "Need help with a lead?" row on the Leads page. Each button opens a GoHighLevel form whose link
 * an admin saved on Settings & Integrations. Renders nothing until at least one form is set.
 */
export const LeadHelpForms: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [formIds, setFormIds] = useState<Partial<Record<LeadFormKey, string>>>({});
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>(undefined);
  const [openKey, setOpenKey] = useState<LeadFormKey | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/portal/${clientId}/forms`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!isMounted || !res.ok) return;
        setFormIds(body.forms || {});
        setPrefillEmail(body.prefillEmail || undefined);
      })
      // These buttons are an extra: if they cannot be loaded the Leads page simply shows without them.
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const available = LEAD_FORMS.filter((form) => Boolean(formIds[form.key]));
  if (available.length === 0) return null;

  const openForm = available.find((form) => form.key === openKey);

  return (
    <div
      role="group"
      aria-label="Need help with a lead?"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-2) var(--space-3)',
        marginBottom: 'var(--space-6)',
      }}
    >
      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>
        Need help with a lead?
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {available.map((form) => (
          <Button key={form.key} variant="secondary" size="sm" onClick={() => setOpenKey(form.key)}>
            {form.button}
          </Button>
        ))}
      </div>

      {openForm && (
        <GhlFormModal
          formId={formIds[openForm.key] || ''}
          title={openForm.title}
          isOpen={true}
          onClose={() => setOpenKey(null)}
          prefillEmail={prefillEmail}
          intro={openForm.intro}
        />
      )}
    </div>
  );
};
