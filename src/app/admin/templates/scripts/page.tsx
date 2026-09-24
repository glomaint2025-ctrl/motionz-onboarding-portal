'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, Button, StatusBadge, Input } from '@/components/ui';
import { interpolateScript, DEFAULT_SCRIPT_TEMPLATES } from '@/lib/scripts/template-engine';

export default function AdminScriptTemplatesPage() {
  const [templates, setTemplates] = useState(DEFAULT_SCRIPT_TEMPLATES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  const handleStartEdit = (template: typeof DEFAULT_SCRIPT_TEMPLATES[0]) => {
    setEditingId(template.id);
    setEditTitle(template.title);
    setEditText(template.template);
  };

  const handleSave = (id: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: editTitle, template: editText } : t))
    );
    setEditingId(null);
    setSaveNotice('Master script template updated successfully.');
    setTimeout(() => setSaveNotice(''), 3000);
  };

  return (
    <AppShell role="admin" portalTitle="Admin Workspace">
      <div className="portal-container">
        {/* Header */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Master Video Script Templates</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Configure baseline video scripts delivered to all client portals with variable interpolation.
          </p>
        </div>

        {saveNotice && (
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-status-done-bg)',
              color: 'var(--color-status-done-text)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {saveNotice}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {templates.map((tpl) => {
            const isEditing = editingId === tpl.id;
            const sampleInterpolated = interpolateScript(isEditing ? editText : tpl.template, {
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
                      <Button variant="secondary" size="sm" onClick={() => handleStartEdit(tpl)}>
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
                      onChange={(e) => setEditTitle(e.target.value)}
                    />

                    <div>
                      <label
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
                        rows={4}
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
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => handleSave(tpl.id)}>
                        Save Template
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
                      }}
                    >
                      {tpl.template}
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
      </div>
    </AppShell>
  );
}
