'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardHeader, CardSkeleton, Input, Modal, StatusBadge, buttonClasses, type StatusVariant } from '@/components/ui';
import { Notice, useRevealOnMessage } from '@/components/admin/Notice';
import { describeVideoLink } from '@/components/training/LessonVideo';
import { formatDateTime } from '@/lib/utils/format';
import '@/styles/staff-tables.css';

interface Lesson {
  id: string;
  title: string;
  description: string;
  video_url: string;
  is_active: boolean;
}

type TrainingStatus = 'exempt' | 'not_started' | 'in_progress' | 'complete';

interface CsmProgress {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
  finished: number;
  total: number;
  lastActivity: string | null;
  status: TrainingStatus;
  exempt: boolean;
}

interface TrainingPage {
  available: boolean;
  message?: string;
  settings: { required_for_csms: boolean };
  lessons: Lesson[];
  activeLessons: number;
  progress: CsmProgress[];
}

const TITLE_MAX = 200;
const LINK_MAX = 500;
const DESCRIPTION_MAX = 2000;

const STATUS_LABELS: Record<TrainingStatus, { label: string; variant: StatusVariant }> = {
  exempt: { label: 'Exempt', variant: 'pending' },
  not_started: { label: 'Not started', variant: 'warning' },
  in_progress: { label: 'In progress', variant: 'progress' },
  complete: { label: 'Complete', variant: 'done' },
};

const footerStyle: React.CSSProperties = { display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' };
const mutedStyle: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' };

export default function AdminTrainingPage() {
  const [page, setPage] = useState<TrainingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const messageRef = useRevealOnMessage(message);

  // Add / edit lesson dialog. `editing` is null while adding.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);
  const [resetTarget, setResetTarget] = useState<CsmProgress | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await fetch('/api/admin/training');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setPage(data);
      else setLoadError(data.error || 'Could not load the training.');
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /** Sends one change. Every answer carries the whole page, so the screen is refreshed from it. */
  const send = async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<{ ok: boolean; error: string }> => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/training', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPage(data);
        return { ok: true, error: '' };
      }
      return { ok: false, error: data.error || 'That did not work. Please try again.' };
    } catch {
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    } finally {
      setBusy(false);
    }
  };

  /** For the buttons that have no dialog of their own: the result is shown at the top of the page. */
  const act = async (method: 'PATCH' | 'DELETE', body: Record<string, unknown>, done: string) => {
    setMessage(null);
    const result = await send(method, body);
    setMessage(result.ok ? { tone: 'success', text: done } : { tone: 'error', text: result.error });
    return result.ok;
  };

  const openAdd = () => {
    setEditing(null);
    setTitle('');
    setLink('');
    setDescription('');
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (lesson: Lesson) => {
    setEditing(lesson);
    setTitle(lesson.title);
    setLink(lesson.video_url);
    setDescription(lesson.description || '');
    setFormError('');
    setFormOpen(true);
  };

  const saveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setFormError('Give the lesson a title.');
    if (!/^https:\/\/\S+$/i.test(link.trim())) return setFormError('The video link must be a full link that starts with https://');
    setFormError('');
    const fields = { title: title.trim(), video_url: link.trim(), description: description.trim() };
    const result = editing
      ? await send('PATCH', { action: 'update_lesson', id: editing.id, ...fields })
      : await send('POST', fields);
    if (!result.ok) return setFormError(result.error);
    setFormOpen(false);
    setMessage({ tone: 'success', text: editing ? `"${fields.title}" was saved.` : `"${fields.title}" was added as the last lesson.` });
  };

  const move = (index: number, by: -1 | 1) => {
    if (!page) return;
    const ids = page.lessons.map((l) => l.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    act('PATCH', { action: 'reorder', ids }, 'The lesson order was saved.');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.title;
    const ok = await act('DELETE', { id: deleteTarget.id }, `"${name}" was deleted.`);
    if (ok) setDeleteTarget(null);
  };

  const confirmReset = async () => {
    if (!resetTarget) return;
    const who = resetTarget.name || resetTarget.email;
    const ok = await act('PATCH', { action: 'reset_progress', userId: resetTarget.id }, `${who}'s training progress was reset.`);
    if (ok) setResetTarget(null);
  };

  const linkHint = link.trim() ? describeVideoLink(link) : 'Paste a YouTube, Loom, Vimeo or Google Drive link. Other https links open in a new tab.';

  return (
    <div>
      <div className="ui-breadcrumb">
        <Link href="/admin">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">CSM Training</span>
      </div>

      <div style={{ marginBottom: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>CSM Training</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            The videos a CSM watches before they start working with clients. CSMs take the lessons in order and click Finish on each one.
          </p>
        </div>
        {page?.available && (
          <Link href="/csm/training" target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'outline' })}>
            Preview as a CSM
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <CardSkeleton height="110px" />
          <CardSkeleton height="260px" />
        </div>
      ) : loadError ? (
        <Notice onRetry={load}>{loadError}</Notice>
      ) : !page ? null : !page.available ? (
        <Notice tone="info">{page.message || 'Training is not switched on in the database yet.'}</Notice>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
          {message && (
            <Notice ref={messageRef} tone={message.tone}>
              {message.text}
            </Notice>
          )}

          {/* 1. The requirement */}
          <Card>
            <CardHeader title="Requirement" />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
              <input
                type="checkbox"
                style={{ marginTop: '3px' }}
                checked={page.settings.required_for_csms}
                disabled={busy}
                onChange={(e) =>
                  act(
                    'PATCH',
                    { action: 'update_settings', required_for_csms: e.target.checked },
                    e.target.checked
                      ? 'Saved. CSMs now have to finish the training before they can open their clients.'
                      : 'Saved. CSMs can open their clients without finishing the training.'
                  )
                }
              />
              CSMs must finish training before they can open their clients
            </label>
            <span className="ui-helper-text" style={{ display: 'block', marginTop: 'var(--space-2)' }}>
              While this is on, a CSM with unfinished lessons sees &ldquo;Finish your training to unlock your clients&rdquo; instead of their client
              list. This applies straight away to every CSM, so first mark the CSMs who already work with clients as exempt (in the table below) or
              let them finish. Hidden lessons do not count. CSM Managers and Tech are never locked out.
              {page.settings.required_for_csms && page.activeLessons === 0 ? ' There are no visible lessons yet, so nobody is locked out.' : ''}
            </span>
          </Card>

          {/* 2. Lessons */}
          <Card>
            <CardHeader
              title="Lessons"
              subtitle="CSMs see these in this order. Lesson 2 unlocks when lesson 1 is finished, and so on."
              action={
                <Button variant="primary" onClick={openAdd} disabled={busy}>
                  Add lesson
                </Button>
              }
            />
            {page.lessons.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                No lessons yet. Click &ldquo;Add lesson&rdquo; and paste the link to the first training video.
              </p>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
                {page.lessons.map((lesson, index) => (
                  <li
                    key={lesson.id}
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      padding: 'var(--space-3)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-bg-surface)',
                    }}
                  >
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>
                          {index + 1}. {lesson.title}
                        </span>
                        {!lesson.is_active && <StatusBadge status="Hidden" variant="pending" dot={false} />}
                      </div>
                      {lesson.description && (
                        <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          {lesson.description}
                        </p>
                      )}
                      <a
                        href={lesson.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}
                      >
                        {lesson.video_url}
                      </a>
                      <span style={{ ...mutedStyle, display: 'block', marginTop: 'var(--space-1)' }}>{describeVideoLink(lesson.video_url)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <Button variant="outline" size="sm" onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`Move "${lesson.title}" up`}>
                        Move up
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => move(index, 1)}
                        disabled={busy || index === page.lessons.length - 1}
                        aria-label={`Move "${lesson.title}" down`}
                      >
                        Move down
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(lesson)} disabled={busy}>
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          act(
                            'PATCH',
                            { action: 'update_lesson', id: lesson.id, is_active: !lesson.is_active },
                            lesson.is_active
                              ? `"${lesson.title}" is now hidden from CSMs and no longer counts towards their progress.`
                              : `"${lesson.title}" is shown to CSMs again.`
                          )
                        }
                      >
                        {lesson.is_active ? 'Hide' : 'Show'}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(lesson)} disabled={busy}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* 3. Progress */}
          <Card>
            <CardHeader title="CSM progress" subtitle="Who has finished the training. Hidden lessons are not counted." />
            {page.progress.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                There are no CSMs yet. Add them on the Staff page.
              </p>
            ) : (
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table className="ui-modern-table ui-staff-table">
                  <thead>
                    <tr>
                      <th>CSM</th>
                      <th>Lessons finished</th>
                      <th>Last activity</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.progress.map((csm) => (
                      <tr key={csm.id}>
                        <td className="ui-cell-title" data-label="CSM">
                          <div className="ui-staff-user">
                            <span className="ui-company-name">{csm.name || csm.email}</span>
                            <span className="ui-company-sub">{csm.email}</span>
                            {csm.disabled && <span className="ui-company-sub">Sign-in disabled</span>}
                          </div>
                        </td>
                        <td data-label="Lessons finished">
                          {csm.finished} / {csm.total}
                        </td>
                        <td data-label="Last activity">{csm.lastActivity ? formatDateTime(csm.lastActivity) : 'None yet'}</td>
                        <td data-label="Status">
                          <StatusBadge status={STATUS_LABELS[csm.status].label} variant={STATUS_LABELS[csm.status].variant} />
                        </td>
                        <td className="ui-cell-actions" data-label="Actions">
                          <div className="ui-actions-cell">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  'PATCH',
                                  { action: 'set_exempt', userId: csm.id, exempt: !csm.exempt },
                                  csm.exempt
                                    ? `${csm.name || csm.email} has to finish the training again like everyone else.`
                                    : `${csm.name || csm.email} can open their clients without finishing the training.`
                                )
                              }
                            >
                              {csm.exempt ? 'Remove exemption' : 'Mark exempt'}
                            </Button>
                            <Button variant="outline" size="sm" disabled={busy || !csm.lastActivity} onClick={() => setResetTarget(csm)}>
                              Reset progress
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal
        isOpen={formOpen}
        onClose={() => !busy && setFormOpen(false)}
        title={editing ? 'Edit lesson' : 'Add lesson'}
        dismissOnOverlay={false}
        maxWidth={560}
        footer={
          <div style={footerStyle}>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="training-lesson-form" variant="primary" disabled={busy}>
              {busy ? 'Saving...' : editing ? 'Save lesson' : 'Add lesson'}
            </Button>
          </div>
        }
      >
        <form id="training-lesson-form" onSubmit={saveLesson} noValidate>
          {formError && <Notice style={{ marginBottom: 'var(--space-4)' }}>{formError}</Notice>}
          <Input id="training-lesson-title" label="Title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} required />
          <Input
            id="training-lesson-link"
            label="Video link"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={link}
            maxLength={LINK_MAX}
            onChange={(e) => setLink(e.target.value)}
            helperText={linkHint}
            required
          />
          <div className="ui-form-group">
            <label htmlFor="training-lesson-description" className="ui-label">
              Description (optional)
            </label>
            <textarea
              id="training-lesson-description"
              className="ui-textarea"
              rows={4}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-describedby="training-lesson-description-note"
            />
            <span id="training-lesson-description-note" className="ui-helper-text">
              What the CSM should take away from this video. {description.length} / {DESCRIPTION_MAX}
            </span>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !busy && setDeleteTarget(null)}
        title="Delete lesson"
        dismissOnOverlay={!busy}
        footer={
          <div style={footerStyle}>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Deleting...' : 'Delete lesson'}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Delete &ldquo;{deleteTarget?.title}&rdquo;? This also removes everyone&rsquo;s progress for this lesson, and it cannot be undone. To take a
          lesson away for now and keep the progress, use Hide instead.
        </p>
        {message?.tone === 'error' && deleteTarget && <Notice style={{ marginTop: 'var(--space-3)' }}>{message.text}</Notice>}
      </Modal>

      <Modal
        isOpen={Boolean(resetTarget)}
        onClose={() => !busy && setResetTarget(null)}
        title="Reset training progress"
        dismissOnOverlay={!busy}
        footer={
          <div style={footerStyle}>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmReset} disabled={busy}>
              {busy ? 'Resetting...' : 'Reset progress'}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Reset the training progress of {resetTarget?.name || resetTarget?.email}? Every lesson they finished is cleared and they start again from
          lesson 1.{page?.settings.required_for_csms ? ' Their clients stay locked until they finish again.' : ''}
        </p>
        {message?.tone === 'error' && resetTarget && <Notice style={{ marginTop: 'var(--space-3)' }}>{message.text}</Notice>}
      </Modal>
    </div>
  );
}
