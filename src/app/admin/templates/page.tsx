'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Input, Select } from '@/components/ui';

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

interface ScriptTemplate {
  id: string;
  title: string;
  script_content: string;
  sort_order: number;
}

type StepDraft = Pick<TemplateStep, 'name' | 'owner' | 'what_it_is' | 'right_now' | 'unlocks'>;

const OWNER_LABELS: Record<StepOwner, string> = {
  we_handle: 'WE HANDLE',
  client_action: 'YOUR ACTION',
};

const OWNER_OPTIONS = [
  { value: 'we_handle', label: 'We handle' },
  { value: 'client_action', label: 'Client action' },
];

const panelStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: '#0b121c',
  borderRadius: 'var(--radius-md)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
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
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
      />
    </div>
  );
}

export default function TemplatesPage() {
  const [template, setTemplate] = useState<PortalTemplate | null>(null);
  const [steps, setSteps] = useState<TemplateStep[]>([]);
  const [scripts, setScripts] = useState<ScriptTemplate[]>([]);
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
        throw new Error(data.error || `Failed to load templates (HTTP ${res.status}).`);
      }
      setTemplate(data.template || null);
      setSteps(Array.isArray(data.steps) ? data.steps : []);
      setScripts(Array.isArray(data.scripts) ? data.scripts : []);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load templates.');
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
      setNotice({ kind: 'error', text: 'All step fields are required and cannot be empty.' });
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
        throw new Error(data.error || `Save failed (HTTP ${res.status}).`);
      }
      setSteps((prev) => prev.map((s) => (s.step_key === stepKey ? { ...s, ...data.step } : s)));
      setNotice({ kind: 'success', text: `Saved "${data.step?.name || stepKey}". New clients will receive this copy.` });
      cancelEdit();
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Failed to save step.' });
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
        <span className="ui-breadcrumb-current">Master Templates</span>
      </div>

      {/* 2. Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
            Master Portal Templates
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            Govern baseline onboarding milestones and script blueprints cloned into client portals.
          </p>
        </div>
        <Link href="/admin/clients/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#2563eb', padding: '9px 18px', fontWeight: 600, borderRadius: 'var(--radius-md)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Provision Client from Template
          </Button>
        </Link>
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
            Retry
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
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Slug: <code style={{ color: '#38bdf8' }}>{template.slug}</code>
                      {template.updated_at ? ` · Last updated ${new Date(template.updated_at).toLocaleDateString()}` : ''}
                    </span>
                  </div>
                </div>
                {template.is_default && (
                  <span className="ui-pill-status ui-pill-status-active">
                    <span className="ui-pill-status-dot" />
                    Canonical Default
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
            <Notice kind="error">No default portal template exists in the database.</Notice>
          )}

          {/* 4. Baseline Setup Steps */}
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)' }}>
              Baseline Setup Step Blueprints ({steps.length} {steps.length === 1 ? 'Step' : 'Steps'})
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--space-4) 0' }}>
              Edits apply to newly provisioned clients only. Existing clients keep their current setup steps.
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
                        borderLeft: '4px solid #3b82f6',
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
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              color: '#38bdf8',
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
                          <TextArea label="Default initial state" value={draft.right_now} disabled={saving} onChange={(v) => setDraft({ ...draft, right_now: v })} />
                          <TextArea label="Unlocks" value={draft.unlocks} disabled={saving} onChange={(v) => setDraft({ ...draft, unlocks: v })} />
                          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                              Cancel
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => saveStep(step.step_key)} disabled={saving}>
                              {saving ? 'Saving...' : 'Save Step'}
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
                            <span style={panelLabelStyle}>Default Initial State</span>
                            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                              {step.right_now}
                            </p>
                          </div>
                          <div style={panelStyle}>
                            <span style={{ ...panelLabelStyle, color: '#10b981' }}>Unlocks</span>
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

          {/* 5. Base Script Blueprints */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                Base Video Script Blueprints ({scripts.length} {scripts.length === 1 ? 'Script' : 'Scripts'})
              </h2>
              <Link href="/admin/templates/scripts" style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="sm">
                  Edit Scripts
                </Button>
              </Link>
            </div>
            {scripts.length === 0 ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                No script templates exist yet.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {scripts.map((script) => (
                  <div
                    key={script.id}
                    className="ui-stat-card"
                    style={{
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '20px',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 var(--space-3) 0' }}>
                        {script.title}
                      </h3>
                      <p style={{ fontSize: 'var(--font-size-xs)', fontStyle: 'italic', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                        &ldquo;{script.script_content}&rdquo;
                      </p>
                    </div>
                    <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-2)', borderTop: '1px solid rgba(255, 255, 255, 0.06)', width: '100%' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        Variables: <code style={{ color: '#38bdf8' }}>&#123;&#123;client_name&#125;&#125;</code>, <code style={{ color: '#38bdf8' }}>&#123;&#123;company_name&#125;&#125;</code>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
