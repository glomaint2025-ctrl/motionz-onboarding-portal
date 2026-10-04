'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, Input, Select } from '@/components/ui';
import { interpolateScript } from '@/lib/scripts/template-engine';
import {
  ScriptCategory,
  SCRIPT_CATEGORIES,
  SCRIPT_CATEGORY_LABELS,
  normalizeScriptCategory,
} from '@/lib/scripts/ad-script-library';

interface ScriptTemplate {
  id: string;
  title: string;
  script_content: string;
  category?: string | null;
  sort_order: number;
}

const MAX_TITLE = 255;
const MAX_CONTENT = 5000;
const VARIABLES_HINT = 'Variables: {{client_name}}, {{company_name}}, {{testimonial_name}}';
const SAMPLE_CONTEXT = { client_name: 'Jane Doe', company_name: 'Summit Roof Pros' };

const CATEGORY_OPTIONS = SCRIPT_CATEGORIES.map((value) => ({ value, label: SCRIPT_CATEGORY_LABELS[value] }));

const CATEGORY_HELP: Record<ScriptCategory, string> = {
  ai_video: 'Educational scripts Motionz produces as AI videos. Shown to clients who choose AI Video.',
  pain_point: 'Self-filmed ad scripts. Clients pick one.',
  testimonials: 'Self-filmed ad scripts. Clients pick one.',
  trustworthy: 'Self-filmed ad scripts. Clients pick one.',
  bonus: 'Optional extra self-filmed ad scripts.',
};

const textAreaStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-medium)',
  marginBottom: 'var(--space-1)',
};

const previewLabelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
  marginBottom: 'var(--space-1)',
};

const previewBoxStyle: React.CSSProperties = {
  padding: 'var(--space-3)',
  backgroundColor: 'var(--color-bg-card)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-subtle)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-primary)',
  whiteSpace: 'pre-wrap',
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

/** Title, category and content fields shared by "Add script" and "Edit script". */
function ScriptFields({
  idPrefix,
  title,
  category,
  content,
  disabled,
  onTitle,
  onCategory,
  onContent,
}: {
  idPrefix: string;
  title: string;
  category: ScriptCategory;
  content: string;
  disabled: boolean;
  onTitle: (value: string) => void;
  onCategory: (value: ScriptCategory) => void;
  onContent: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Input
          label="Title"
          value={title}
          maxLength={MAX_TITLE}
          disabled={disabled}
          placeholder="e.g. Pain Point #6"
          onChange={(e) => onTitle(e.target.value)}
        />
        <Select
          label="Category"
          value={category}
          disabled={disabled}
          options={CATEGORY_OPTIONS}
          helperText={CATEGORY_HELP[category]}
          onChange={(e) => onCategory(normalizeScriptCategory(e.target.value))}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-content`} style={labelStyle}>
          Script
        </label>
        <textarea
          id={`${idPrefix}-content`}
          rows={10}
          maxLength={MAX_CONTENT}
          disabled={disabled}
          style={textAreaStyle}
          value={content}
          onChange={(e) => onContent(e.target.value)}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>{VARIABLES_HINT}</span>
          <span>
            {content.length} / {MAX_CONTENT}
          </span>
        </div>
      </div>

      {content.trim() && (
        <div>
          <div style={previewLabelStyle}>Sample preview (Jane Doe / Summit Roof Pros):</div>
          <div style={previewBoxStyle}>{interpolateScript(content, SAMPLE_CONTEXT)}</div>
        </div>
      )}
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
  const [editCategory, setEditCategory] = useState<ScriptCategory>('bonus');

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<ScriptCategory>('pain_point');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/templates', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to load scripts (HTTP ${res.status}).`);
      }
      setTemplates(Array.isArray(data.scripts) ? data.scripts : []);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load scripts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const busy = saving || editingId !== null || adding;

  const handleStartEdit = (template: ScriptTemplate) => {
    setNotice(null);
    setConfirmDeleteId(null);
    setEditingId(template.id);
    setEditTitle(template.title);
    setEditText(template.script_content);
    setEditCategory(normalizeScriptCategory(template.category));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditText('');
  };

  const handleStartAdd = (category?: ScriptCategory) => {
    setNotice(null);
    setConfirmDeleteId(null);
    setNewTitle('');
    setNewText('');
    if (category) setNewCategory(category);
    setAdding(true);
  };

  const handleSave = async (id: string) => {
    if (!editTitle.trim() || !editText.trim()) {
      setNotice({ kind: 'error', text: 'Title and script are both required.' });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/templates/scripts/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, script_content: editText, category: editCategory }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Save failed (HTTP ${res.status}).`);
      }
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...data.script } : t)));
      setNotice({ kind: 'success', text: `Saved "${data.script?.title || editTitle}". Client portals now show this script.` });
      handleCancelEdit();
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Failed to save the script.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newText.trim()) {
      setNotice({ kind: 'error', text: 'Title and script are both required.' });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/templates/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, script_content: newText, category: newCategory }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.script) {
        throw new Error(data.error || `Could not add the script (HTTP ${res.status}).`);
      }
      setTemplates((prev) => [...prev, data.script].sort((a, b) => a.sort_order - b.sort_order));
      setNotice({
        kind: 'success',
        text: `Added "${data.script.title}" to ${SCRIPT_CATEGORY_LABELS[normalizeScriptCategory(data.script.category)]}. Clients can see it now.`,
      });
      setAdding(false);
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Failed to add the script.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: ScriptTemplate) => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/templates/scripts/${encodeURIComponent(template.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Delete failed (HTTP ${res.status}).`);
      }
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      setNotice({ kind: 'success', text: `Deleted "${template.title}". Clients who had picked it will need to pick another.` });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Failed to delete the script.' });
    } finally {
      setConfirmDeleteId(null);
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

      <div
        style={{
          marginBottom: 'var(--space-6)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Video Script Library</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Scripts every client sees on their Video Scripts page, grouped by type. Names are filled in automatically.
          </p>
        </div>
        <Button variant="primary" onClick={() => handleStartAdd()} disabled={busy || loading || Boolean(loadError)}>
          Add script
        </Button>
      </div>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {adding && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <CardHeader title="Add script" subtitle="It appears in client portals as soon as you save." />
          <ScriptFields
            idPrefix="new-script"
            title={newTitle}
            category={newCategory}
            content={newText}
            disabled={saving}
            onTitle={setNewTitle}
            onCategory={setNewCategory}
            onContent={setNewText}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
            <Button variant="outline" size="sm" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? 'Adding...' : 'Add script'}
            </Button>
          </div>
        </Card>
      )}

      {loading && (
        <Card>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Loading scripts...
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
            No scripts exist in the database yet. Use &quot;Add script&quot; to create the first one.
          </p>
        </Card>
      )}

      {!loading &&
        !loadError &&
        templates.length > 0 &&
        SCRIPT_CATEGORIES.map((category) => {
          const inCategory = templates.filter((t) => normalizeScriptCategory(t.category) === category);
          return (
            <section key={category} style={{ marginBottom: 'var(--space-8)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>
                    {SCRIPT_CATEGORY_LABELS[category]} ({inCategory.length})
                  </h2>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    {CATEGORY_HELP[category]}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleStartAdd(category)} disabled={busy}>
                  Add to {SCRIPT_CATEGORY_LABELS[category]}
                </Button>
              </div>

              {inCategory.length === 0 && (
                <Card>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    No scripts in this category yet.
                  </p>
                </Card>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {inCategory.map((tpl) => {
                  const isEditing = editingId === tpl.id;
                  const isConfirmingDelete = confirmDeleteId === tpl.id;

                  return (
                    <Card key={tpl.id}>
                      <CardHeader
                        title={isEditing ? 'Editing script' : tpl.title}
                        subtitle={isEditing ? undefined : VARIABLES_HINT}
                        action={
                          !isEditing ? (
                            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                              <Button variant="secondary" size="sm" onClick={() => handleStartEdit(tpl)} disabled={busy}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setNotice(null);
                                  setConfirmDeleteId(tpl.id);
                                }}
                                disabled={busy || isConfirmingDelete}
                              >
                                Delete script
                              </Button>
                            </div>
                          ) : null
                        }
                      />

                      {isConfirmingDelete && (
                        <div
                          role="alert"
                          style={{
                            padding: 'var(--space-3)',
                            marginBottom: 'var(--space-3)',
                            backgroundColor: 'var(--color-status-danger-bg)',
                            color: 'var(--color-status-danger-text)',
                            border: '1px solid var(--color-status-danger-border)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--font-size-sm)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 'var(--space-3)',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>
                            Delete &quot;{tpl.title}&quot;? It disappears from every client portal. This cannot be undone here.
                          </span>
                          <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={saving}>
                              Keep it
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => handleDelete(tpl)} disabled={saving}>
                              {saving ? 'Deleting...' : 'Yes, delete'}
                            </Button>
                          </span>
                        </div>
                      )}

                      {isEditing ? (
                        <div>
                          <ScriptFields
                            idPrefix={`script-${tpl.id}`}
                            title={editTitle}
                            category={editCategory}
                            content={editText}
                            disabled={saving}
                            onTitle={setEditTitle}
                            onCategory={setEditCategory}
                            onContent={setEditText}
                          />
                          <div
                            style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}
                          >
                            <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
                              Cancel
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => handleSave(tpl.id)} disabled={saving}>
                              {saving ? 'Saving...' : 'Save script'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={previewLabelStyle}>Sample preview (Jane Doe / Summit Roof Pros):</div>
                          <div style={previewBoxStyle}>{interpolateScript(tpl.script_content, SAMPLE_CONTEXT)}</div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
    </div>
  );
}
