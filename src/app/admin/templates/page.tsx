'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Input, Select, buttonClasses } from '@/components/ui';
import { formatDate } from '@/lib/utils/format';

type StepOwner = 'we_handle' | 'client_action';

interface PortalTemplate {
  id: string;
  title: string;
  slug: string;
  description?: string;
  is_default: boolean;
  updated_at?: string;
}

interface TemplateStep {
  id: string;
  step_key: string;
  name: string;
  owner: StepOwner;
  what_it_is: string;
  right_now: string;
  unlocks: string;
  sort_order: number;
}

type StepDraft = Pick<TemplateStep, 'name' | 'owner' | 'what_it_is' | 'right_now' | 'unlocks'>;

const OWNER_LABELS: Record<StepOwner, string> = {
  we_handle: 'Motionz handles',
  client_action: 'Client action',
};

const OWNER_OPTIONS = [
  { value: 'we_handle', label: 'Motionz handles' },
  { value: 'client_action', label: 'Client action' },
];

const panelStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: 'var(--color-bg-surface)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-subtle)',
};

const panelLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  marginBottom: '4px',
};

function Notice({ kind, children }: { kind: 'success' | 'error'; children: React.ReactNode }) {
  const isError = kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      style={{
        padding: 'var(--space-3)',
        backgroundColor: isError ? 'var(--color-status-danger-bg)' : 'var(--color-status-done-bg)',
        color: isError ? 'var(--color-status-danger-text)' : 'var(--color-status-done-text)',
        border: `1px solid ${isError ? 'var(--color-status-danger-border)' : 'var(--color-status-done-border)'}`,
        borderRadius: 'var(--radius-md)',
        marginBottom: 'var(--space-4)',
        fontSize: 'var(--font-size-sm)',
      }}
    >
      {children}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = `step-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="ui-form-group">
      <label htmlFor={id} className="ui-label">
        {label}
      </label>
      <textarea
        id={id}
        className="ui-textarea"
        rows={3}
        value={value}
        disabled={disabled}
        maxLength={2000}
        required
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
      />
    </div>
  );
}

export default function TemplatesPage() {
  const [template, setTemplate] = useState<PortalTemplate | null>(null);
  const [steps, setSteps] = useState<TemplateStep[]>([]);
  const [scriptCount, setScriptCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<StepDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/templates', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not load the portal templates.');
      }
      setTemplate(data.template || null);
      setSteps(Array.isArray(data.steps) ? data.steps : []);
      setScriptCount(Array.isArray(data.scripts) ? data.scripts.length : 0);
    } catch (err: any) {
      setLoadError(err.message || 'Could not load the portal templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const startEdit = (step: TemplateStep) => {
    setNotice(null);
    setEditingKey(step.step_key);
    setDraft({
      name: step.name,
      owner: step.owner,
      what_it_is: step.what_it_is,
      right_now: step.right_now,
      unlocks: step.unlocks,
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft(null);
  };

  const saveStep = async (stepKey: string) => {
    if (!draft) return;
    const missing = (['name', 'what_it_is', 'right_now', 'unlocks'] as const).filter((f) => !draft[f].trim());
    if (missing.length > 0) {
      setNotice({ kind: 'error', text: 'Fill in every field before saving. None of them can be empty.' });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/templates/steps/${encodeURIComponent(stepKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'The step was not saved. Please try again.');
      }
      setSteps((prev) => prev.map((s) => (s.step_key === stepKey ? { ...s, ...data.step } : s)));
      setNotice({ kind: 'success', text: `Saved "${data.step?.name || draft.name.trim()}". New clients will get this wording.` });
      cancelEdit();
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'The step was not saved. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* 1. Breadcrumb */}
      <div className="ui-breadcrumb">
        <Link href="/admin">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Portal Templates</span>
      </div>

      {/* 2. Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
            Portal Templates
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            The standard setup steps every new client starts with.
          </p>
        </div>
      </div>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {loading && (
        <div className="ui-stat-card" style={{ padding: '24px', marginBottom: 'var(--space-6)' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Loading templates...
          </p>
        </div>
      )}

      {!loading && loadError && (
        <div>
          <Notice kind="error">{loadError}</Notice>
          <Button variant="outline" size="sm" onClick={loadTemplates}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          {/* 3. Template Hero Card */}
          {template ? (
            <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px', marginBottom: 'var(--space-6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-2)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="ui-stat-icon-wrapper ui-stat-icon-blue" style={{ width: '40px', height: '40px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                      {template.title}
                    </h2>
                    {formatDate(template.updated_at) && (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        Last updated {formatDate(template.updated_at)}
                      </span>
                    )}
                  </div>
                </div>
                {template.is_default && (
                  <span className="ui-pill-status ui-pill-status-active">
                    <span className="ui-pill-status-dot" />
                    Used for new clients
                  </span>
                )}
              </div>
              {template.description && (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 'var(--space-2) 0 0 0', lineHeight: 1.5 }}>
                  {template.description}
                </p>
              )}
            </div>
          ) : (
            <Notice kind="error">No standard template has been set up yet, so new clients would start with no setup steps.</Notice>
          )}

          {/* 4. Baseline Setup Steps */}
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)' }}>
              Standard setup steps ({steps.length})
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--space-4) 0' }}>
              Changes here only affect clients added from now on. Existing clients keep the setup steps they already have.
            </p>

            {steps.length === 0 ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                This template has no setup steps.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {steps.map((step, idx) => {
                  const isEditing = editingKey === step.step_key && draft !== null;
                  return (
                    <div
                      key={step.step_key}
                      className="ui-stat-card"
                      style={{
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '20px 24px',
                        borderLeft: '4px solid var(--color-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              letterSpacing: '0.05em',
                              padding: '3px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--color-primary-soft)',
                              color: 'var(--color-primary-text)',
                            }}
                          >
                            STEP {idx + 1}
                          </span>
                          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                            {step.name}
                          </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className={`ui-pill-status ${step.owner === 'we_handle' ? 'ui-pill-status-active' : 'ui-pill-status-onboarding'}`}>
                            <span className="ui-pill-status-dot" />
                            {OWNER_LABELS[step.owner] || step.owner}
                          </span>
                          {!isEditing && (
                            <Button variant="secondary" size="sm" onClick={() => startEdit(step)} disabled={saving || editingKey !== null}>
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>

                      {isEditing && draft ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
                            <Input
                              label="Step name"
                              value={draft.name}
                              maxLength={255}
                              disabled={saving}
                              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            />
                            <Select
                              label="Owner"
                              value={draft.owner}
                              options={OWNER_OPTIONS}
                              disabled={saving}
                              onChange={(e) => setDraft({ ...draft, owner: e.target.value as StepOwner })}
                            />
                          </div>
                          <TextArea label="What it is" value={draft.what_it_is} disabled={saving} onChange={(v) => setDraft({ ...draft, what_it_is: v })} />
                          <TextArea label="Right now (starting text)" value={draft.right_now} disabled={saving} onChange={(v) => setDraft({ ...draft, right_now: v })} />
                          <TextArea label="Unlocks" value={draft.unlocks} disabled={saving} onChange={(v) => setDraft({ ...draft, unlocks: v })} />
                          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                              Cancel
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => saveStep(step.step_key)} disabled={saving}>
                              {saving ? 'Saving...' : 'Save step'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)', width: '100%' }}>
                          <div style={panelStyle}>
                            <span style={panelLabelStyle}>What it is</span>
                            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                              {step.what_it_is}
                            </p>
                          </div>
                          <div style={panelStyle}>
                            <span style={panelLabelStyle}>Right now (starting text)</span>
                            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                              {step.right_now}
                            </p>
                          </div>
                          <div style={panelStyle}>
                            <span style={{ ...panelLabelStyle, color: 'var(--color-status-done-text)' }}>Unlocks</span>
                            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                              {step.unlocks}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 5. Video scripts live on their own page; only the count is shown here. */}
          <div className="ui-stat-card" style={{ padding: '20px 24px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>Video scripts</h2>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0' }}>
                {scriptCount === 0
                  ? 'No video scripts have been added yet.'
                  : `${scriptCount} video script${scriptCount === 1 ? '' : 's'} in the library.`}
              </p>
            </div>
            <Link href="/admin/templates/scripts" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              Manage scripts
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
