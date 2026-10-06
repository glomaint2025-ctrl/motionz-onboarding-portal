'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, Input, Select, Skeleton } from '@/components/ui';
import { buttonClasses } from '@/components/ui/Button';
import {
  ONBOARDING_FORM_SECTIONS,
  ONBOARDING_FORM_FIELDS,
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_LABEL,
  MAX_FILES_PER_FIELD,
  checkUploadSelection,
  extensionOf,
  type OnboardingField,
  type OnboardingFileRef,
  type OnboardingFormValues,
} from '@/lib/onboarding/form-definition';
import { validateOnboardingValues } from '@/lib/onboarding/form-validation';
import { isFileList } from '@/lib/onboarding/answers';
import { formatDateTime } from '@/lib/utils/format';

type Values = Record<string, string | string[]>;
type FileMap = Record<string, File[]>;
type KeptMap = Record<string, OnboardingFileRef[]>;

const FILE_FIELDS = ONBOARDING_FORM_FIELDS.filter((f) => f.type === 'file');
const FILE_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(',');
const inputId = (key: string) => `onboarding-${key}`;
const draftKey = (clientId: string) => `motionz.onboarding-form.${clientId}`;

/** An empty form: every question blank, except the ones that start with a value (Country). */
function emptyValues(): Values {
  const values: Values = {};
  for (const field of ONBOARDING_FORM_FIELDS) {
    if (field.type === 'file') continue;
    values[field.key] = field.type === 'checkbox' ? [] : field.defaultValue || '';
  }
  return values;
}

/** Turns a stored answer (text) back into what the form control holds. Unknown choices are dropped. */
function toControlValue(field: OnboardingField, raw: unknown): string | string[] | undefined {
  if (field.type === 'checkbox') {
    const picked = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
    const clean = picked.map((v) => String(v).trim()).filter((v) => field.options!.includes(v));
    return Array.isArray(raw) || clean.length > 0 ? clean : undefined;
  }
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  if (field.type === 'select' || field.type === 'radio') return field.options!.includes(raw.trim()) ? raw.trim() : undefined;
  return raw;
}

function readDraft(clientId: string): Values | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(draftKey(clientId)) || 'null');
    if (!parsed || typeof parsed.values !== 'object' || parsed.values === null) return null;
    const values: Values = {};
    for (const field of ONBOARDING_FORM_FIELDS) {
      if (field.type === 'file') continue;
      const raw = parsed.values[field.key];
      // A blank answer in the draft is kept too: the client may have cleared a pre-filled box.
      if (raw === '' && field.type !== 'checkbox') values[field.key] = '';
      else {
        const value = toControlValue(field, raw);
        if (value !== undefined) values[field.key] = value;
      }
    }
    return values;
  } catch {
    return null;
  }
}

function writeDraft(clientId: string, values: Values): void {
  try {
    window.localStorage.setItem(draftKey(clientId), JSON.stringify({ values, savedAt: new Date().toISOString() }));
  } catch {
    // Private browsing or a full disk: the form still works, it just is not remembered.
  }
}

function clearDraft(clientId: string): void {
  try {
    window.localStorage.removeItem(draftKey(clientId));
  } catch {
    // Nothing to clear.
  }
}

function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const RequiredMark = () => (
  <span aria-hidden="true" style={{ color: 'var(--color-status-danger-text)' }}>
    {' '}
    *
  </span>
);

const groupStyle: React.CSSProperties = { border: 'none', padding: 0, margin: '0 0 var(--space-4) 0', minWidth: 0 };
const choiceStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--control-height-sm)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
};
const fileRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  padding: 'var(--space-1) var(--space-2)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
};

export default function OnboardingFormPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';
  const backHref = `/portal/${clientId}/onboarding`;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const [values, setValues] = useState<Values>(emptyValues);
  const [files, setFiles] = useState<FileMap>({});
  const [kept, setKept] = useState<KeptMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');
  const [previousSentAt, setPreviousSentAt] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  // What the form holds before the client types anything (portal details + their last answers).
  const baseline = useRef<{ values: Values; kept: KeptMap }>({ values: emptyValues(), kept: {} });
  // The draft is only written once the client has changed something.
  const isDirty = useRef(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setStatus('loading');
      setLoadError('');
      try {
        const [dataRes, answersRes] = await Promise.all([
          fetch(`/api/portal/${clientId}/data`),
          // Earlier answers only pre-fill the form, so a problem here does not block it.
          fetch(`/api/portal/${clientId}/onboarding-answers`).catch(() => null),
        ]);
        const data = await dataRes.json().catch(() => ({}));
        if (!isMounted) return;
        if (!dataRes.ok) {
          setLoadError(data.error || 'The form could not be loaded.');
          setStatus('error');
          return;
        }
        const answersData = answersRes && answersRes.ok ? await answersRes.json().catch(() => ({})) : {};
        if (!isMounted) return;

        const start = emptyValues();

        // 1. What the portal already knows.
        const tenant = data.tenant || {};
        const viewer = data.viewer || {};
        const isClient = viewer.role === 'client' || viewer.role === 'client_member';
        const known: Record<string, unknown> = {
          full_name: isClient ? viewer.full_name : tenant.primary_contact_name,
          dba_business_name: tenant.name,
          business_email: tenant.primary_email,
          business_phone: tenant.phone,
        };
        for (const field of ONBOARDING_FORM_FIELDS) {
          const value = field.type === 'file' ? undefined : toControlValue(field, known[field.key]);
          if (value !== undefined) start[field.key] = value;
        }

        // 2. Their newest earlier answers, so "Update your answers" starts from what they sent.
        const latest = (answersData.submissions || [])[0];
        const keptFiles: KeptMap = {};
        if (latest?.answers) {
          for (const field of ONBOARDING_FORM_FIELDS) {
            const names = [field.label, ...(field.aliases || [])];
            const raw = names.map((name) => latest.answers[name]).find((v) => v !== undefined && v !== null && v !== '');
            if (field.type === 'file') {
              if (isFileList(raw)) keptFiles[field.key] = raw.slice(0, MAX_FILES_PER_FIELD);
              continue;
            }
            const value = toControlValue(field, raw);
            if (value !== undefined) start[field.key] = value;
          }
          setPreviousSentAt(latest.submittedAt || null);
        } else {
          setPreviousSentAt(null);
        }
        baseline.current = { values: start, kept: keptFiles };

        // 3. Answers typed earlier on this device but not sent yet.
        const draft = readDraft(clientId);
        isDirty.current = Boolean(draft);
        setDraftRestored(Boolean(draft));
        setValues(draft ? { ...start, ...draft } : start);
        setKept(keptFiles);
        setFiles({});
        setErrors({});
        setStatus('ready');
      } catch {
        if (!isMounted) return;
        setLoadError('We could not reach the server. Check your connection and try again.');
        setStatus('error');
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [clientId, attempt]);

  // Save a draft shortly after each change, so a refresh or a closed tab does not lose a long form.
  useEffect(() => {
    if (status !== 'ready' || isDone || !isDirty.current) return;
    const timer = window.setTimeout(() => writeDraft(clientId, values), 400);
    return () => window.clearTimeout(timer);
  }, [values, status, isDone, clientId]);

  const setValue = useCallback((key: string, value: string | string[]) => {
    isDirty.current = true;
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
    setSubmitError('');
  }, []);

  const startAgain = () => {
    clearDraft(clientId);
    isDirty.current = false;
    setDraftRestored(false);
    setValues(baseline.current.values);
    setKept(baseline.current.kept);
    setFiles({});
    setErrors({});
    setSubmitError('');
  };

  const addFiles = (key: string, picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    // Copy now: the input is cleared right after this call, which empties the live FileList.
    const chosen = Array.from(picked);
    // Wrong file types are turned away straight away, not only when the form is sent.
    const allowed = chosen.filter((file) => ALLOWED_UPLOAD_EXTENSIONS.includes(extensionOf(file.name)));
    const refused = chosen.filter((file) => !allowed.includes(file));
    const next: FileMap = { ...files, [key]: [...(files[key] || []), ...allowed] };
    setFiles(next);
    // Count and size problems are shown as soon as they happen, on the question they belong to.
    const found = checkUploadSelection(
      next,
      Object.fromEntries(Object.entries(kept).map(([fieldKey, list]) => [fieldKey, list.length]))
    );
    setErrors((current) => {
      const updated = { ...current };
      for (const field of FILE_FIELDS) updated[field.key] = found[field.key] || '';
      if (refused.length > 0) {
        const names = refused.map((file) => `"${file.name}"`).join(', ');
        updated[key] = `${names} ${refused.length === 1 ? 'was' : 'were'} not added. Send ${ALLOWED_UPLOAD_LABEL} files; for videos, paste a link in the next question.`;
      }
      return updated;
    });
    setSubmitError('');
  };

  const removeFile = (key: string, index: number) => {
    setFiles((current) => ({ ...current, [key]: (current[key] || []).filter((_, i) => i !== index) }));
    setErrors((current) => {
      const next = { ...current };
      for (const field of FILE_FIELDS) next[field.key] = '';
      return next;
    });
  };

  const removeKept = (key: string, path: string) => {
    setKept((current) => ({ ...current, [key]: (current[key] || []).filter((f) => f.path !== path) }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  /** Moves to the first question that has a problem, in the order of the form. */
  const focusFirstError = (found: Record<string, string>) => {
    const first = ONBOARDING_FORM_FIELDS.find((f) => found[f.key]);
    if (!first) return;
    // After the messages are drawn.
    window.setTimeout(() => {
      const el = document.getElementById(inputId(first.key));
      if (!el) return;
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    }, 0);
  };

  const totalBytes = useMemo(
    () => Object.values(files).reduce((sum, list) => sum + list.reduce((s, f) => s + f.size, 0), 0),
    [files]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitError('');

    const found: Record<string, string> = {
      ...validateOnboardingValues(values as OnboardingFormValues).errors,
      ...checkUploadSelection(
        files,
        Object.fromEntries(Object.entries(kept).map(([key, list]) => [key, list.length]))
      ),
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      setSubmitError('Some answers need a second look. We have marked them for you.');
      focusFirstError(found);
      return;
    }

    const body = new FormData();
    for (const field of ONBOARDING_FORM_FIELDS) {
      if (field.type === 'file') {
        for (const file of files[field.key] || []) body.append(field.key, file, file.name);
        for (const file of kept[field.key] || []) body.append(`${field.key}__keep`, file.path);
        continue;
      }
      const value = values[field.key];
      for (const item of Array.isArray(value) ? value : [value || '']) {
        if (item.trim()) body.append(field.key, item.trim());
      }
    }

    setIsSubmitting(true);
    try {
      // No Content-Type header: the browser adds the multipart boundary itself.
      const res = await fetch(`/api/portal/${clientId}/onboarding-form`, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        clearDraft(clientId);
        isDirty.current = false;
        setDoneMessage(data.duplicate ? data.message : '');
        setIsDone(true);
        window.scrollTo({ top: 0 });
        return;
      }
      if (data.fields && typeof data.fields === 'object') {
        setErrors(data.fields);
        focusFirstError(data.fields);
        setSubmitError('Some answers need a second look. We have marked them for you.');
      } else if (res.status === 413) {
        setSubmitError('Your files are too large to send. Remove a file, or paste a link to large files in the links question.');
      } else {
        setSubmitError(data.error || 'Your answers could not be sent. Please try again.');
      }
    } catch {
      setSubmitError('We could not reach the server. Your answers are still here; check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const header = (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <Link href={backHref} style={{ fontSize: 'var(--font-size-sm)' }}>
        ← Back to Setup Progress
      </Link>
      <h1 style={{ margin: 'var(--space-2) 0 var(--space-1) 0' }}>Onboarding form</h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
        Tell us about your business. We use your answers to build your ads, website and follow-up messages. Your
        answers go straight to your Motionz team.
      </p>
    </div>
  );

  if (status === 'loading') {
    return (
      <div>
        {header}
        {[1, 2, 3].map((i) => (
          <Card key={i} style={{ marginBottom: 'var(--space-4)' }}>
            <Skeleton width="220px" height="22px" style={{ marginBottom: 'var(--space-4)' }} />
            <Skeleton width="100%" height="44px" borderRadius="var(--radius-md)" style={{ marginBottom: 'var(--space-3)' }} />
            <Skeleton width="100%" height="44px" borderRadius="var(--radius-md)" />
          </Card>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div>
        {header}
        <Card>
          <p role="alert" style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-status-danger-text)' }}>
            {loadError}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  if (isDone) {
    return (
      <div>
        {header}
        <Card>
          <div role="status">
            <h2 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-lg)' }}>
              Thanks — your answers were sent to your Motionz team.
            </h2>
            <p style={{ margin: '0 0 var(--space-4) 0', color: 'var(--color-text-secondary)' }}>
              {doneMessage || 'You can read them again, or update them, from Setup Progress at any time.'}
            </p>
          </div>
          <Link href={backHref} className={buttonClasses({ variant: 'primary' })} style={{ textDecoration: 'none' }}>
            Back to Setup Progress
          </Link>
        </Card>
      </div>
    );
  }

  const renderField = (field: OnboardingField) => {
    const id = inputId(field.key);
    const error = errors[field.key] || '';
    const messageId = `${id}-message`;
    const describedBy = error || field.help ? messageId : undefined;
    const message = error ? (
      <span className="ui-error-text" id={messageId} role="alert">
        {error}
      </span>
    ) : field.help ? (
      <span className="ui-helper-text" id={messageId}>
        {field.help}
      </span>
    ) : null;
    const label = (
      <>
        {field.label}
        {field.required && <RequiredMark />}
      </>
    );

    if (field.type === 'text') {
      return (
        <div key={field.key}>
          <label htmlFor={id} className="ui-label" style={{ display: 'block', marginBottom: '6px' }}>
            {label}
          </label>
          <Input
            id={id}
            name={field.key}
            type={field.format === 'email' ? 'email' : field.format === 'phone' ? 'tel' : 'text'}
            inputMode={field.format === 'email' ? 'email' : field.format === 'phone' ? 'tel' : undefined}
            autoComplete={field.autoComplete}
            value={(values[field.key] as string) || ''}
            onChange={(e) => setValue(field.key, e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            aria-required={field.required || undefined}
            error={error || undefined}
            helperText={field.help}
          />
        </div>
      );
    }

    if (field.type === 'textarea') {
      const value = (values[field.key] as string) || '';
      return (
        <div key={field.key} className="ui-form-group">
          <label htmlFor={id} className="ui-label">
            {label}
          </label>
          <textarea
            id={id}
            name={field.key}
            className={`ui-textarea ${error ? 'ui-input-error' : ''}`.trim()}
            rows={4}
            value={value}
            onChange={(e) => setValue(field.key, e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            aria-required={field.required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
          {message}
          {field.maxLength && value.length > field.maxLength * 0.9 && (
            <span className="ui-helper-text">
              {value.length.toLocaleString('en-US')} of {field.maxLength.toLocaleString('en-US')} characters
            </span>
          )}
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <Select
          key={field.key}
          id={id}
          label={field.label}
          name={field.key}
          value={(values[field.key] as string) || ''}
          onChange={(e) => setValue(field.key, e.target.value)}
          options={field.options!.map((option) => ({ value: option, label: option }))}
          error={error || undefined}
          helperText={field.help}
        />
      );
    }

    if (field.type === 'checkbox' || field.type === 'radio') {
      const picked = values[field.key];
      return (
        <fieldset key={field.key} style={groupStyle} aria-describedby={describedBy}>
          <legend className="ui-label" style={{ padding: 0, marginBottom: '6px' }}>
            {label}
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 var(--space-4)' }}>
            {field.options!.map((option, index) => {
              const checked = Array.isArray(picked) ? picked.includes(option) : picked === option;
              return (
                <label key={option} style={choiceStyle}>
                  <input
                    // The first choice carries the id, so a problem with this question can be focused.
                    id={index === 0 ? id : undefined}
                    type={field.type}
                    name={field.key}
                    value={option}
                    checked={checked}
                    onChange={(e) => {
                      if (field.type === 'radio') setValue(field.key, option);
                      else {
                        const list = Array.isArray(picked) ? picked : [];
                        setValue(field.key, e.target.checked ? [...list, option] : list.filter((v) => v !== option));
                      }
                    }}
                  />
                  {option}
                </label>
              );
            })}
          </div>
          {field.type === 'radio' && !field.required && picked ? (
            <button
              type="button"
              onClick={() => setValue(field.key, '')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                marginTop: 'var(--space-1)',
                color: 'var(--color-primary-text)',
                fontSize: 'var(--font-size-xs)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Clear my choice
            </button>
          ) : null}
          <div style={{ marginTop: '6px' }}>{message}</div>
        </fieldset>
      );
    }

    // Upload question
    const chosen = files[field.key] || [];
    const earlier = kept[field.key] || [];
    return (
      <div key={field.key} className="ui-form-group">
        <label htmlFor={id} className="ui-label">
          {label}
        </label>
        <input
          id={id}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            addFiles(field.key, e.target.files);
            // Lets the same file be picked again after it was removed.
            e.target.value = '';
          }}
          style={{ fontSize: 'var(--font-size-sm)', maxWidth: '100%' }}
        />
        {(earlier.length > 0 || chosen.length > 0) && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--space-1)' }}>
            {earlier.map((file) => (
              <li key={file.path} style={fileRowStyle}>
                <span style={{ wordBreak: 'break-word', minWidth: 0 }}>
                  {file.name} <span style={{ color: 'var(--color-text-muted)' }}>· sent before</span>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeKept(field.key, file.path)} aria-label={`Remove ${file.name}`}>
                  Remove
                </Button>
              </li>
            ))}
            {chosen.map((file, index) => (
              <li key={`${file.name}-${index}`} style={fileRowStyle}>
                <span style={{ wordBreak: 'break-word', minWidth: 0 }}>
                  {file.name} <span style={{ color: 'var(--color-text-muted)' }}>· {fileSize(file.size)}</span>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(field.key, index)} aria-label={`Remove ${file.name}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {message}
      </div>
    );
  };

  return (
    <div>
      {header}

      {(previousSentAt || draftRestored) && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span role="status">
              {draftRestored
                ? 'We brought back the answers you had started on this device but not sent yet.'
                : `We filled in the answers you sent on ${formatDateTime(previousSentAt)}. Change what is different and send the form again.`}
            </span>
            {draftRestored && (
              <Button type="button" variant="ghost" size="sm" onClick={startAgain}>
                {previousSentAt ? 'Go back to my last sent answers' : 'Start again'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Where you are in the form: stays in view while scrolling. */}
      <nav
        aria-label="Sections of this form"
        style={{
          position: 'sticky',
          top: 'var(--header-height)',
          zIndex: 5,
          display: 'flex',
          gap: 'var(--space-2)',
          overflowX: 'auto',
          padding: 'var(--space-2) 0',
          marginBottom: 'var(--space-4)',
          backgroundColor: 'var(--color-bg-base)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        {ONBOARDING_FORM_SECTIONS.map((section, index) => {
          const hasProblem = section.fields.some((f) => errors[f.key]);
          return (
            <button
              key={section.key}
              type="button"
              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              style={{ whiteSpace: 'nowrap', flexShrink: 0, ...(hasProblem ? { color: 'var(--color-status-danger-text)' } : {}) }}
              onClick={() => document.getElementById(`section-${section.key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
            >
              {index + 1}. {section.title}
              {hasProblem ? ' (check)' : ''}
            </button>
          );
        })}
      </nav>

      <form onSubmit={handleSubmit} noValidate>
        {ONBOARDING_FORM_SECTIONS.map((section, index) => (
          <Card
            key={section.key}
            id={`section-${section.key}`}
            style={{ marginBottom: 'var(--space-4)', scrollMarginTop: 'calc(var(--header-height) + 64px)' }}
          >
            <p
              style={{
                margin: '0 0 var(--space-1) 0',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text-muted)',
              }}
            >
              Section {index + 1} of {ONBOARDING_FORM_SECTIONS.length}
            </p>
            <CardHeader title={section.title} subtitle={section.description} />
            {section.fields.map(renderField)}
          </Card>
        ))}

        <Card>
          <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Questions marked with <span style={{ color: 'var(--color-status-danger-text)' }}>*</span> need an answer.
            {totalBytes > 0 ? ` Files chosen: ${fileSize(totalBytes)} of 4 MB.` : ''} What you type is kept on this device
            until you send it.
          </p>
          {submitError && (
            <p role="alert" style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-status-danger-text)', fontSize: 'var(--font-size-sm)' }}>
              {submitError}
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <Button type="submit" variant="primary" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
              {isSubmitting ? 'Sending...' : previousSentAt ? 'Send updated answers' : 'Send my answers'}
            </Button>
            <Link href={backHref} className={buttonClasses({ variant: 'outline' })} style={{ textDecoration: 'none' }}>
              Finish later
            </Link>
          </div>
        </Card>
      </form>
    </div>
  );
}
