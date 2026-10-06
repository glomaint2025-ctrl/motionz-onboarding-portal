'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, StatusBadge, Skeleton } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';
import { checkWebhookUrl, WEBHOOK_URL_MAX } from '@/lib/lead-requests/automation';

/**
 * Admin → Settings & Integrations: the optional automation link. When set, the portal sends every
 * Lead Replacement and Unresponsive Lead submission to it (a GoHighLevel Inbound Webhook).
 */
export function AutomationCard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/settings/automation');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const url = data.automation?.lead_request_webhook_url || '';
        setSaved(url);
        setText(url);
      } else {
        setLoadError(data.error || 'Could not load the automation link.');
      }
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setMessage(null);
    const check = checkWebhookUrl(text);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/automation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_request_webhook_url: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const url = data.automation?.lead_request_webhook_url || '';
        setSaved(url);
        setText(url);
        setMessage({
          type: 'ok',
          text: url ? 'Saved. Every new lead form submission is now sent to this link.' : 'Saved. Lead form submissions are no longer sent anywhere.',
        });
      } else if (data.field) {
        setError(data.error || 'That link was not accepted.');
      } else {
        setMessage({ type: 'error', text: data.error || 'The link was not saved. Please try again.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not reach the server. Nothing was saved.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader
        title="Automations (optional)"
        subtitle="Paste a GoHighLevel Inbound Webhook link. The portal sends every lead form submission to it so you can build your own automation."
        action={!loading && !loadError ? <StatusBadge status={saved ? 'On' : 'Off'} variant={saved ? 'done' : 'pending'} /> : undefined}
      />
      {loading ? (
        <Skeleton height="90px" />
      ) : loadError ? (
        <Notice onRetry={load}>{loadError}</Notice>
      ) : (
        <>
          <Input
            id="automation-lead-request-webhook"
            label="Lead forms: Inbound Webhook link"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
              setMessage(null);
            }}
            placeholder="https://services.leadconnectorhq.com/hooks/..."
            maxLength={WEBHOOK_URL_MAX}
            autoComplete="off"
            spellCheck={false}
            error={error || undefined}
            helperText="Used by the Lead Replacement and Unresponsive Lead forms. Leave it empty to switch this off. The link must start with https://."
          />
          <p className="ui-helper-text" style={{ display: 'block', margin: '0 0 var(--space-4) 0' }}>
            Where to find the link: in GoHighLevel go to Automation → Workflows → create a workflow → add the trigger
            &ldquo;Inbound Webhook&rdquo; → copy its URL. Each submission arrives with the form type, the outcome and its
            reason, the lead&rsquo;s name and phone, the answers and the client. If the link stops working, the submission is
            still saved and emailed; the problem shows in Audit Logs.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <Button variant="primary" onClick={save} disabled={saving || text.trim() === saved}>
              {saving ? 'Saving...' : 'Save automation link'}
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
  );
}
