'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, StatusBadge, Skeleton } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';
import { ghlFormUrl } from '@/lib/portal-links';
import { FORM_SETTING_FIELDS, parseGhlFormId, type FormSettings, type FormSettingKey } from '@/lib/ghl-forms';

type FieldText = Record<FormSettingKey, string>;
type FieldErrors = Partial<Record<FormSettingKey, string>>;

const EMPTY: FieldText = {
  a2p_form_id: '',
};

const helperLineStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
};

/**
 * Admin → Settings & Integrations: the GoHighLevel form shown in the client portal (the Texting
 * registration form). An admin pastes a form link (or its ID); the portal keeps only the ID and
 * shows the form on Setup Progress straight away. Every other form is built into the portal.
 */
export function GhlFormsCard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState<FieldText>(EMPTY);
  const [text, setText] = useState<FieldText>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const apply = (forms: FormSettings) => {
    const next: FieldText = { a2p_form_id: forms?.a2p_form_id || '' };
    setSaved(next);
    setText(next);
  };

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/settings/forms');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) apply(data.forms);
      else setLoadError(data.error || 'Could not load the form links.');
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const isDirty = FORM_SETTING_FIELDS.some(({ key }) => text[key].trim() !== saved[key]);

  const save = async () => {
    setMessage(null);

    const found: FieldErrors = {};
    for (const { key, required } of FORM_SETTING_FIELDS) {
      const value = text[key].trim();
      if (!value) {
        if (required) found[key] = 'This form is always shown to clients, so it cannot be left empty.';
      } else if (!parseGhlFormId(value)) {
        found[key] = 'That does not look like a GoHighLevel form link or ID. Copy the link from GoHighLevel and paste it again.';
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/forms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a2p_form_id: text.a2p_form_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        apply(data.forms);
        setMessage({ type: 'ok', text: 'Form links saved. Clients see the change straight away.' });
      } else if (data.fields && Object.keys(data.fields).length > 0) {
        setErrors(data.fields);
      } else {
        setMessage({ type: 'error', text: data.error || 'The form links were not saved. Please try again.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not reach the server. Nothing was saved.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <Card style={{ marginBottom: 'var(--space-3)' }}>
        <CardHeader
          title="GoHighLevel forms"
          subtitle="The GoHighLevel form clients fill in inside their portal. Build or change it in GoHighLevel, then paste its link here."
        />
        <p style={{ ...helperLineStyle, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          The onboarding form (client → Setup Progress) and the two lead forms, Lead Replacement and Unresponsive Lead
          (client → Leads), are built into the portal. Their answers are saved here, not in GoHighLevel.
        </p>
        {loading ? (
          <Skeleton height="120px" />
        ) : loadError ? (
          <Notice onRetry={load}>{loadError}</Notice>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              {FORM_SETTING_FIELDS.map(({ key, label, shownOn }) => {
                const value = text[key].trim();
                const detectedId = value ? parseGhlFormId(value) : null;
                const isLive = Boolean(saved[key]);
                const unsaved = value !== saved[key] && detectedId !== saved[key];
                return (
                  <div
                    key={key}
                    style={{
                      padding: 'var(--space-3)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 'var(--space-2)',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      <label htmlFor={`form-link-${key}`} style={{ fontWeight: 'var(--font-weight-medium)' }}>
                        {label}
                      </label>
                      <StatusBadge
                        status={isLive ? `Showing on ${shownOn}` : 'Not set — hidden from clients'}
                        variant={isLive ? 'done' : 'pending'}
                      />
                    </div>
                    <Input
                      id={`form-link-${key}`}
                      value={text[key]}
                      onChange={(e) => {
                        const next = e.target.value;
                        setText((current) => ({ ...current, [key]: next }));
                        setErrors((current) => ({ ...current, [key]: undefined }));
                        setMessage(null);
                      }}
                      placeholder="Paste the form link or ID from GoHighLevel"
                      maxLength={4000}
                      autoComplete="off"
                      spellCheck={false}
                      error={errors[key]}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 'var(--space-2)',
                        // The input's own bottom margin is wider than this row needs.
                        marginTop: 'calc(var(--space-2) * -1)',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      <span style={{ wordBreak: 'break-all' }}>
                        {detectedId ? (
                          <>
                            Form ID: <strong style={{ color: 'var(--color-text-primary)' }}>{detectedId}</strong>
                            {unsaved ? ' (not saved yet)' : ''}
                          </>
                        ) : value ? (
                          'No form ID found in this text yet.'
                        ) : (
                          'No form set.'
                        )}
                      </span>
                      {detectedId && (
                        <a href={ghlFormUrl(detectedId)} target="_blank" rel="noopener noreferrer">
                          Preview
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <Button variant="primary" onClick={save} disabled={saving || !isDirty}>
                {saving ? 'Saving...' : 'Save form links'}
              </Button>
              {message && (
                <span
                  role={message.type === 'error' ? 'alert' : 'status'}
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: message.type === 'ok' ? 'var(--color-status-done-text)' : 'var(--color-status-danger-text)',
                  }}
                >
                  {message.text}
                </span>
              )}
            </div>
          </>
        )}
      </Card>
      <p style={helperLineStyle}>
        Where to find the link: in GoHighLevel go to Sites → Forms → open the form → Integrate (or Share) → copy the link.
      </p>
      <p style={helperLineStyle}>Clients see a form as soon as its link is saved here.</p>
    </div>
  );
}
