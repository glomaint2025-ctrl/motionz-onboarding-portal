'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, StatusBadge, Skeleton, Select } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';
import { formatDateTime } from '@/lib/utils/format';

interface Submission {
  id: string;
  submitter_email?: string;
  answers: Record<string, string>;
  submitted_at: string;
}

interface ClientOption {
  id: string;
  name: string;
}

type LoginCodeMode = 'off' | 'csm' | 'all_staff';

const LOGIN_CODE_OPTIONS: { value: LoginCodeMode; label: string; detail: string }[] = [
  { value: 'off', label: 'Off', detail: 'Staff sign in with their password only.' },
  { value: 'csm', label: 'CSMs only', detail: 'CSMs enter an emailed code every time they log in. Admins sign in with their password only.' },
  { value: 'all_staff', label: 'All staff', detail: 'CSMs and admins, including you, enter an emailed code every time they log in.' },
];

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState('');
  const [notifyCsm, setNotifyCsm] = useState(true);
  const [status, setStatus] = useState<Record<string, any>>({});
  const [unmatched, setUnmatched] = useState<Submission[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [clientsError, setClientsError] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const [loginCodeMode, setLoginCodeMode] = useState<LoginCodeMode>('off');
  const [savedLoginCodeMode, setSavedLoginCodeMode] = useState<LoginCodeMode>('off');
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    setClientsError('');
    try {
      const [settingsRes, clientsRes, securityRes] = await Promise.all([
        fetch('/api/admin/settings/notifications'),
        fetch('/api/admin/clients'),
        fetch('/api/admin/settings/security'),
      ]);
      const settings = await settingsRes.json().catch(() => ({}));
      const clientData = await clientsRes.json().catch(() => ({}));
      const security = await securityRes.json().catch(() => null);
      if (security?.success) {
        setLoginCodeMode(security.security.staff_login_code);
        setSavedLoginCodeMode(security.security.staff_login_code);
      } else {
        setSecurityMessage({ type: 'error', text: security?.error || 'Could not load sign-in security settings.' });
      }
      if (settings.success) {
        setRecipients((settings.notifications.onboarding_form_recipients || []).join(', '));
        setNotifyCsm(settings.notifications.notify_assigned_csm !== false);
        setStatus(settings.status || {});
        setUnmatched(settings.unmatchedSubmissions || []);
      } else {
        setLoadError(settings.error || 'Could not load the settings.');
      }
      if (clientData.success) {
        // Archived clients cannot receive a submission, so they are left out of "Choose client".
        setClients(
          (clientData.tenants || [])
            .filter((t: any) => !t.is_archived && !t.deleted_at && t.status !== 'cancelled')
            .map((t: any) => ({ id: t.id, name: t.name }))
        );
      } else {
        setClientsError(clientData.error || 'Could not load the client list.');
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
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_form_recipients: recipients, notify_assigned_csm: notifyCsm }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setRecipients((data.notifications?.onboarding_form_recipients || []).join(', '));
        setMessage({ type: 'ok', text: 'Notification settings saved.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'The settings were not saved. Please try again.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not reach the server. Nothing was saved.' });
    } finally {
      setSaving(false);
    }
  };

  const saveSecurity = async () => {
    setSavingSecurity(true);
    setSecurityMessage(null);
    try {
      const res = await fetch('/api/admin/settings/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_login_code: loginCodeMode }),
      });
      const data = await res.json();
      if (data.success) {
        setLoginCodeMode(data.security.staff_login_code);
        setSavedLoginCodeMode(data.security.staff_login_code);
        setSecurityMessage({ type: 'ok', text: 'Sign-in security saved. It applies from the next staff login.' });
      } else {
        setSecurityMessage({ type: 'error', text: data.error || 'Could not save sign-in security.' });
      }
    } catch {
      setSecurityMessage({ type: 'error', text: 'Network error while saving.' });
    } finally {
      setSavingSecurity(false);
    }
  };

  const linkSubmission = async (submissionId: string) => {
    const tenantId = linkChoice[submissionId];
    if (!tenantId || linkingId) return;
    setLinkingId(submissionId);
    setLinkError('');
    setLinkSuccess('');
    try {
      const res = await fetch('/api/admin/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link_submission', submissionId, tenantId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setUnmatched((list) => list.filter((s) => s.id !== submissionId));
        const clientName = clients.find((c) => c.id === tenantId)?.name;
        setLinkSuccess(clientName ? `Linked to ${clientName}.` : 'Linked to the client.');
      } else setLinkError(data.error || 'Could not link that form to the client. Please try again.');
    } catch {
      setLinkError('Could not reach the server. The form was not linked.');
    } finally {
      setLinkingId(null);
    }
  };

  // Resolved after mount so server and client render the same markup.
  const [webhookUrl, setWebhookUrl] = useState('/api/webhooks/ghl');
  useEffect(() => setWebhookUrl(`${window.location.origin}/api/webhooks/ghl`), []);

  const statusRows = [
    {
      label: 'Email delivery',
      ok: status.email,
      detail: loading ? 'Sends invitations, sign-in codes and notifications' : status.emailSender ? `Sending as ${status.emailSender}` : 'Email sending is not set up yet',
    },
    { label: 'Client tracking sheets', ok: status.trackingSheets, detail: 'Creates a Google Sheet for each new client' },
    { label: 'GoHighLevel webhooks', ok: status.ghlWebhook, detail: webhookUrl },
  ];

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Settings & Integrations</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Notifications and connected services.</p>
      </div>

      {message && (
        <Notice tone={message.type === 'ok' ? 'success' : 'error'} style={{ marginBottom: 'var(--space-4)' }}>
          {message.text}
        </Notice>
      )}
      {loadError && (
        <Notice onRetry={load} style={{ marginBottom: 'var(--space-4)' }}>
          {loadError}
        </Notice>
      )}

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Onboarding form notifications"
          subtitle="Who gets an email with the answers when a client submits the onboarding form (for example, the media buyer). They do not need a portal account."
        />
        {loading ? (
          <Skeleton height="90px" />
        ) : loadError ? (
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>These settings could not be loaded.</p>
        ) : (
          <>
            <label htmlFor="onboarding-recipients" style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-1)' }}>
              Email addresses (separate with commas)
            </label>
            <textarea
              id="onboarding-recipients"
              maxLength={2000}
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              rows={2}
              placeholder="mediabuyer@motionz.ai, ops@motionz.ai"
              style={{
                width: '100%',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                marginBottom: 'var(--space-3)',
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
              <input type="checkbox" checked={notifyCsm} onChange={(e) => setNotifyCsm(e.target.checked)} />
              Also email the CSM assigned to that client
            </label>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save notification settings'}
            </Button>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Staff sign-in security"
          subtitle="Add a second step to staff logins: after the password, a 6-digit code is emailed and must be entered to finish signing in. Client logins are not affected."
        />
        {loading ? (
          <Skeleton height="120px" />
        ) : (
          <>
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 var(--space-3)' }}>
              <legend style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-2)', padding: 0 }}>
                Email a sign-in code when staff log in
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {LOGIN_CODE_OPTIONS.map((option) => {
                  const blocked = option.value === 'all_staff' && !status.email;
                  return (
                    <label
                      key={option.value}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--font-size-sm)',
                        color: blocked ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                      }}
                    >
                      <input
                        type="radio"
                        name="staff-login-code"
                        value={option.value}
                        checked={loginCodeMode === option.value}
                        disabled={blocked}
                        onChange={() => setLoginCodeMode(option.value)}
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{option.label}</span>
                        <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          {blocked ? 'Needs email delivery to be connected first (see Connected services below).' : option.detail}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <p
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                margin: '0 0 var(--space-4)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'var(--color-status-warning-bg)',
                color: 'var(--color-status-warning-text)',
              }}
            >
              Each staff member must be able to receive email at their @motionz.ai address.
              {!status.email && loginCodeMode === 'csm' ? ' Email delivery is not connected yet, so CSMs would not be able to sign in.' : ''}
            </p>
            {securityMessage && (
              <p
                role={securityMessage.type === 'error' ? 'alert' : 'status'}
                style={{
                  margin: '0 0 var(--space-3)',
                  fontSize: 'var(--font-size-sm)',
                  color: securityMessage.type === 'ok' ? 'var(--color-status-done-text)' : 'var(--color-status-danger-text)',
                }}
              >
                {securityMessage.text}
              </p>
            )}
            <Button variant="primary" onClick={saveSecurity} disabled={savingSecurity || loginCodeMode === savedLoginCodeMode}>
              {savingSecurity ? 'Saving...' : 'Save sign-in security'}
            </Button>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Onboarding forms without a client"
          subtitle="Forms sent in with an email address that does not match any client yet. Link each one to the right client."
        />
        {linkError && <Notice style={{ marginBottom: 'var(--space-3)' }}>{linkError}</Notice>}
        {linkSuccess && (
          <Notice tone="success" style={{ marginBottom: 'var(--space-3)' }}>
            {linkSuccess}
          </Notice>
        )}
        {!loading && !loadError && clientsError && unmatched.length > 0 && (
          <Notice onRetry={load} style={{ marginBottom: 'var(--space-3)' }}>
            {clientsError}
          </Notice>
        )}
        {loading ? (
          <Skeleton height="60px" />
        ) : loadError ? (
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>This list could not be loaded.</p>
        ) : unmatched.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Nothing to review.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {unmatched.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                    {s.answers['DBA Business Name'] || s.answers['full_name'] || s.submitter_email || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    {s.submitter_email || 'No email'} · {formatDateTime(s.submitted_at) || 'Date unknown'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <Select
                    value={linkChoice[s.id] || ''}
                    onChange={(e) => setLinkChoice((c) => ({ ...c, [s.id]: e.target.value }))}
                  >
                    <option value="">Choose client...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="button" variant="secondary" size="sm" onClick={() => linkSubmission(s.id)} disabled={!linkChoice[s.id] || linkingId !== null}>
                    {linkingId === s.id ? 'Linking...' : 'Link'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Connected services" subtitle="These are set up by the Motionz technical team. Ask them if one shows as not set up." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {statusRows.map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{row.label}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', wordBreak: 'break-all' }}>{row.detail}</div>
              </div>
              {!loading && <StatusBadge status={row.ok ? 'Connected' : 'Not set up'} variant={row.ok ? 'done' : 'warning'} />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
