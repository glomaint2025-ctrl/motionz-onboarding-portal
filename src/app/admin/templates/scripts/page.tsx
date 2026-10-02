'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, Input } from '@/components/ui';
import { interpolateScript } from '@/lib/scripts/template-engine';

interface ScriptTemplate {
  id: string;
  title: string;
  script_content: string;
  sort_order: number;
}

const MAX_TITLE = 255;
const MAX_CONTENT = 5000;

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

export default function AdminScriptTemplatesPage() {
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/templates', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to load script templates (HTTP ${res.status}).`);
      }
      setTemplates(Array.isArray(data.scripts) ? data.scripts : []);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load script templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleStartEdit = (template: ScriptTemplate) => {
    setNotice(null);
    setEditingId(template.id);
    setEditTitle(template.title);
    setEditText(template.script_content);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditTitle('');
    setEditText('');
  };

  const handleSave = async (id: string) => {
    if (!editTitle.trim() || !editText.trim()) {
      setNotice({ kind: 'error', text: 'Title and script content are both required.' });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/templates/scripts/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, script_content: editText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Save failed (HTTP ${res.status}).`);
      }
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...data.script } : t)));
      setNotice({ kind: 'success', text: `Saved "${data.script?.title || editTitle}". Client portals now show this script.` });
      handleCancel();
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Failed to save script template.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="ui-breadcrumb">
        <Link href="/admin">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <Link href="/admin/templates">Master Templates</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Video Scripts</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Master Video Script Templates</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Configure baseline video scripts delivered to all client portals with variable interpolation.
        </p>
      </div>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {loading && (
        <Card>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Loading script templates...
          </p>
        </Card>
      )}

      {!loading && loadError && (
        <div>
          <Notice kind="error">{loadError}</Notice>
          <Button variant="outline" size="sm" onClick={loadTemplates}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !loadError && templates.length === 0 && (
        <Card>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            No script templates exist in the database yet.
          </p>
        </Card>
      )}

      {!loading && !loadError && templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {templates.map((tpl) => {
            const isEditing = editingId === tpl.id;
            const sampleInterpolated = interpolateScript(isEditing ? editText : tpl.script_content, {
              client_name: 'Jane Doe',
              company_name: 'Summit Roof Pros',
            });

            return (
              <Card key={tpl.id}>
                <CardHeader
                  title={isEditing ? 'Editing Script Template' : tpl.title}
                  subtitle="Variables supported: {{client_name}}, {{company_name}}"
                  action={
                    !isEditing ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleStartEdit(tpl)}
                        disabled={saving || editingId !== null}
                      >
                        Edit Template
                      </Button>
                    ) : null
                  }
                />

                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <Input
                      label="Template Title"
                      value={editTitle}
                      maxLength={MAX_TITLE}
                      disabled={saving}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />

                    <div>
                      <label
                        htmlFor={`script-content-${tpl.id}`}
                        style={{
                          display: 'block',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 'var(--font-weight-medium)',
                          marginBottom: 'var(--space-1)',
                        }}
                      >
                        Script Template Content
                      </label>
                      <textarea
                        id={`script-content-${tpl.id}`}
                        rows={5}
                        maxLength={MAX_CONTENT}
                        disabled={saving}
                        style={{
                          width: '100%',
                          padding: 'var(--space-2) var(--space-3)',
                          backgroundColor: 'var(--color-bg-surface)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--color-text-primary)',
                          fontSize: 'var(--font-size-sm)',
                          fontFamily: 'inherit',
                        }}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                      />
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                        {editText.length} / {MAX_CONTENT}
                      </div>
                    </div>

                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Live Sample Preview (Jane Doe / Summit Roof Pros):
                    </div>
                    <div
                      style={{
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--color-bg-card)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {sampleInterpolated}
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                      <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => handleSave(tpl.id)} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Template'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div
                      style={{
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--color-bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: 'var(--font-size-sm)',
                        fontFamily: 'monospace',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-3)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {tpl.script_content}
                    </div>

                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>
                      Live Sample Preview (Jane Doe / Summit Roof Pros):
                    </div>
                    <div
                      style={{
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--color-bg-card)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-primary)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {sampleInterpolated}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
