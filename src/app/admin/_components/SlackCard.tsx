'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, StatusBadge, Skeleton } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';
import { checkSlackWebhookUrl, SLACK_URL_MAX } from '@/lib/lead-requests/slack';

type Message = { type: 'ok' | 'error'; text: string } | null;

/**
 * Admin → Settings & Integrations: the Slack channel that gets a message whenever a client sends a
 * Lead Replacement or Unresponsive Lead form. The saved link is never sent back to the browser:
 * once saved, the box shows a masked version of it.
 */
export function SlackCard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [configured, setConfigured] = useState(false);
  /** The masked link of what is saved ('' when nothing is). */
  const [masked, setMasked] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'remove'>('');
  const [message, setMessage] = useState<Message>(null);

  const apply = (slack: any) => {
    const link = typeof slack?.lead_request_slack_webhook_url === 'string' ? slack.lead_request_slack_webhook_url : '';
    setConfigured(Boolean(slack?.configured));
    setMasked(link);
    setText(link);
  };

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/settings/slack');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) apply(data.slack);
      else setLoadError(data.error || 'Could not load the Slack settings.');
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const put = async (value: string, action: 'save' | 'remove') => {
    setMessage(null);
    setBusy(action);
    try {
      const res = await fetch('/api/admin/settings/slack', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_request_slack_webhook_url: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        apply(data.slack);
        setError('');
        setMessage({
          type: 'ok',
          text: data.slack?.configured
            ? 'Saved. New lead forms are now posted to this Slack channel.'
            : 'Removed. Lead forms are no longer posted to Slack.',
        });
      } else if (data.field) {
        setError(data.error || 'That link was not accepted.');
      } else {
        setMessage({ type: 'error', text: data.error || 'The link was not saved. Please try again.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not reach the server. Nothing was saved.' });
    } finally {
      setBusy('');
    }
  };

  const save = () => {
    const check = checkSlackWebhookUrl(text);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    put(text.trim(), 'save');
  };

  const sendTest = async () => {
    setMessage(null);
    setBusy('test');
    try {
      const res = await fetch('/api/admin/settings/slack/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setMessage({ type: 'ok', text: 'Test message sent. Check the Slack channel.' });
      else setMessage({ type: 'error', text: data.error || 'The test message could not be sent. Please try again.' });
    } catch {
      setMessage({ type: 'error', text: 'Could not reach the server. No test message was sent.' });
    } finally {
      setBusy('');
    }
  };

  // Nothing new typed: the box still holds the masked link (or is empty with nothing saved).
  const unchanged = text.trim() === masked;

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader
        title="Slack messages"
        subtitle="When a client sends a Lead Replacement or Unresponsive Lead form, post a message to a Slack channel."
        action={!loading && !loadError ? <StatusBadge status={configured ? 'On' : 'Off'} variant={configured ? 'done' : 'pending'} /> : undefined}
      />
      {loading ? (
        <Skeleton height="90px" />
      ) : loadError ? (
        <Notice onRetry={load}>{loadError}</Notice>
      ) : (
        <>
          <Input
            id="slack-lead-request-webhook"
            label="Slack webhook link"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
              setMessage(null);
            }}
            onFocus={(e) => {
              // The masked link cannot be edited into a real one; select it so pasting replaces it.
              if (configured && unchanged) e.target.select();
            }}
            placeholder="https://hooks.slack.com/services/..."
            maxLength={SLACK_URL_MAX}
            autoComplete="off"
            spellCheck={false}
            error={error || undefined}
            helperText={
              configured
                ? 'A link is saved. For safety only part of it is shown. Paste a new link to replace it.'
                : 'Paste the Webhook URL from Slack. It starts with https://hooks.slack.com/services/.'
            }
          />
          <div className="ui-helper-text" style={{ display: 'block', margin: '0 0 var(--space-4) 0' }}>
            How to get the link:
            <ol style={{ margin: 'var(--space-1) 0 0 0', paddingLeft: 'var(--space-5)' }}>
              <li>In Slack, open Apps and search for &ldquo;Incoming Webhooks&rdquo;.</li>
              <li>Click &ldquo;Add to Slack&rdquo;.</li>
              <li>Choose the channel the messages should go to.</li>
              <li>Copy the Webhook URL and paste it here.</li>
            </ol>
            If Slack cannot be reached, the form is still saved and emailed; the problem shows in Audit Logs.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <Button variant="primary" onClick={save} disabled={busy !== '' || unchanged || !text.trim()}>
              {busy === 'save' ? 'Saving...' : 'Save'}
            </Button>
            {configured && (
              <Button variant="secondary" onClick={sendTest} disabled={busy !== '' || !unchanged}>
                {busy === 'test' ? 'Sending...' : 'Send a test message'}
              </Button>
            )}
            {configured && (
              <button
                type="button"
                onClick={() => put('', 'remove')}
                disabled={busy !== ''}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  color: 'var(--color-status-danger-text)',
                  font: 'inherit',
                  fontSize: 'var(--font-size-sm)',
                  textDecoration: 'underline',
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                {busy === 'remove' ? 'Removing...' : 'Remove'}
              </button>
            )}
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
