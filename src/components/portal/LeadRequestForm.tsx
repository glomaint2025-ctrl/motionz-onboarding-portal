'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button, Input, Select, Skeleton, StatusBadge } from '@/components/ui';
import { buttonClasses } from '@/components/ui/Button';
import {
  APPOINTMENT_OUTCOMES,
  FORM_UNAVAILABLE,
  LEAD_NAME_MAX,
  LONG_TEXT_MAX,
  REPLACEMENT_REASONS,
  daysSince,
  decisionBadge,
  decisionLabel,
  type LeadRequestType,
} from '@/lib/lead-requests/definition';
import { validateLeadRequest } from '@/lib/lead-requests/validation';
import { formatDate } from '@/lib/utils/format';

interface PickedLead {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

interface SavedRequest {
  id: string;
  type: LeadRequestType;
  lead_name: string;
  decision: string;
  decision_reason: string | null;
}

interface Values {
  leadName: string;
  leadPhone: string;
  reason: string;
  appointment: string;
  whatHappened: string;
  daysSinceSent: string;
  contactAttempts: string;
}

const EMPTY: Values = {
  leadName: '',
  leadPhone: '',
  reason: '',
  appointment: '',
  whatHappened: '',
  daysSinceSent: '',
  contactAttempts: '',
};

const SEARCH_DELAY_MS = 300;
const FIELD_ORDER: (keyof Values | 'leadId')[] = [
  'leadId', 'leadName', 'leadPhone', 'reason', 'appointment', 'daysSinceSent', 'whatHappened', 'contactAttempts',
];
const fieldId = (key: string) => `lead-request-${key}`;

const COPY: Record<LeadRequestType, { title: string; intro: string; submit: string; otherPath: string }> = {
  replacement: {
    title: 'Lead replacement',
    intro:
      'Submit a lead you think should be replaced. It is checked against the replacement rules straight away and approved requests go to our marketing team.',
    submit: 'Submit request',
    otherPath: 'unresponsive',
  },
  unresponsive: {
    title: 'Unresponsive lead',
    intro:
      'Lead gone quiet? Submit them here and our internal marketing team — who already spoke with this lead — will run their own follow-ups to reactivate them.',
    submit: 'Submit lead',
    otherPath: 'replacement',
  },
};

const rulesStyle: React.CSSProperties = {
  marginBottom: 'var(--space-4)',
  backgroundColor: 'var(--color-bg-subtle, var(--color-bg-surface))',
  fontSize: 'var(--font-size-sm)',
  lineHeight: 1.6,
};
const ruleListStyle: React.CSSProperties = { margin: '0 0 var(--space-3) 0', paddingLeft: 'var(--space-5)' };
const pickRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 'var(--space-1) var(--space-3)',
  width: '100%',
  minHeight: 'var(--control-height-sm, 36px)',
  padding: 'var(--space-2) var(--space-3)',
  border: 'none',
  borderBottom: '1px solid var(--color-border-subtle)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  fontFamily: 'inherit',
  fontSize: 'var(--font-size-sm)',
  textAlign: 'left',
  cursor: 'pointer',
};

/** The id in ?lead=<id>, read after the page is in the browser. */
function leadIdFromAddress(): string {
  try {
    return (new URLSearchParams(window.location.search).get('lead') || '').trim().slice(0, 100);
  } catch {
    return '';
  }
}

/**
 * The Lead Replacement and Unresponsive Lead forms (client portal → Leads). One component for both:
 * the questions, the rules and the checks come from src/lib/lead-requests.
 */
export function LeadRequestForm({ clientId, type }: { clientId: string; type: LeadRequestType }) {
  const copy = COPY[type];
  const leadsHref = `/portal/${clientId}/leads`;

  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [submittingAs, setSubmittingAs] = useState<{ name: string; company: string } | null>(null);

  const [values, setValues] = useState<Values>(EMPTY);
  const [picked, setPicked] = useState<PickedLead | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ request: SavedRequest; duplicate: boolean } | null>(null);

  // "Pick from your leads"
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<PickedLead[] | null>(null);
  const [searchError, setSearchError] = useState('');

  const applyLead = (lead: PickedLead) => {
    setPicked(lead);
    setValues((current) => {
      const days = daysSince(lead.created_at);
      return {
        ...current,
        leadName: lead.name || current.leadName,
        leadPhone: lead.phone || current.leadPhone,
        daysSinceSent: type === 'unresponsive' && days !== null ? String(days) : current.daysSinceSent,
      };
    });
    setErrors((current) => ({ ...current, leadId: '', leadName: '', leadPhone: '', daysSinceSent: '' }));
    setPickerOpen(false);
  };

  // Who is submitting, whether the form is set up, and the lead named in the address (?lead=<id>).
  useEffect(() => {
    let isMounted = true;
    const leadId = leadIdFromAddress();
    setStatus('loading');
    fetch(`/api/portal/${clientId}/lead-requests?limit=1${leadId ? `&lead=${encodeURIComponent(leadId)}` : ''}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!isMounted) return;
        if (!res.ok) {
          setLoadError(res.status === 403 ? 'You do not have access to leads.' : 'This form could not be loaded.');
          setStatus('error');
          return;
        }
        setSubmittingAs(body.submittingAs || null);
        if (body.available === false) {
          setStatus('unavailable');
          return;
        }
        if (body.lead) applyLead(body.lead as PickedLead);
        setStatus('ready');
      })
      .catch(() => {
        if (!isMounted) return;
        setLoadError('We could not reach the server. Check your connection and try again.');
        setStatus('error');
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, attempt]);

  // Wait until typing pauses before searching.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!pickerOpen) return;
    let isMounted = true;
    const query = new URLSearchParams({ page: '1', pageSize: '8' });
    if (search) query.set('search', search);
    setSearchError('');
    fetch(`/api/portal/${clientId}/leads?${query.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!isMounted) return;
        if (!res.ok) {
          setSearchError('Your leads could not be loaded. You can still type the name and phone number below.');
          return;
        }
        setMatches(
          (body.leads || []).map((l: any) => ({
            id: l.id,
            name: `${l.first_name || ''} ${l.last_name || ''}`.trim(),
            phone: l.phone || '',
            created_at: l.created_at,
          }))
        );
      })
      .catch(() => {
        if (isMounted) setSearchError('Your leads could not be loaded. You can still type the name and phone number below.');
      });
    return () => {
      isMounted = false;
    };
  }, [clientId, pickerOpen, search]);

  const setValue = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
    setSubmitError('');
    // Typing a different person means this is no longer the lead that was picked.
    if ((key === 'leadName' || key === 'leadPhone') && picked) {
      setPicked(null);
      setErrors((current) => ({ ...current, leadId: '' }));
    }
  };

  const focusFirstError = (found: Record<string, string>) => {
    const first = FIELD_ORDER.find((key) => found[key]);
    if (!first) return;
    window.setTimeout(() => {
      const el = document.getElementById(fieldId(first === 'leadId' ? 'leadName' : first));
      if (!el) return;
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    }, 0);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitError('');

    const payload = { type, leadId: picked?.id, ...values };
    const found = validateLeadRequest(type, payload).errors;
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      setSubmitError('Some answers need a second look. We have marked them for you.');
      focusFirstError(found);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/portal/${clientId}/lead-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.request) {
        setResult({ request: data.request, duplicate: Boolean(data.duplicate) });
        window.scrollTo({ top: 0 });
        return;
      }
      if (data.code === 'FORM_UNAVAILABLE') {
        setStatus('unavailable');
      } else if (data.fields && typeof data.fields === 'object') {
        setErrors(data.fields);
        focusFirstError(data.fields);
        setSubmitError('Some answers need a second look. We have marked them for you.');
      } else {
        setSubmitError(data.error || 'Your request could not be sent. Please try again.');
      }
    } catch {
      setSubmitError('We could not reach the server. Your answers are still here; check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAgain = () => {
    setResult(null);
    setValues(EMPTY);
    setPicked(null);
    setErrors({});
    setSubmitError('');
    setSearchInput('');
    window.scrollTo({ top: 0 });
  };

  const otherHref = `/portal/${clientId}/leads/${copy.otherPath}${picked ? `?lead=${encodeURIComponent(picked.id)}` : ''}`;

  const header = (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <Link href={leadsHref} style={{ fontSize: 'var(--font-size-sm)' }}>
        ← Back to Leads
      </Link>
      <h1 style={{ margin: 'var(--space-2) 0 var(--space-1) 0' }}>{copy.title}</h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{copy.intro}</p>
    </div>
  );

  if (status === 'loading') {
    return (
      <div style={{ maxWidth: '760px' }}>
        {header}
        <Card>
          <Skeleton width="220px" height="22px" style={{ marginBottom: 'var(--space-4)' }} />
          <Skeleton width="100%" height="44px" borderRadius="var(--radius-md)" style={{ marginBottom: 'var(--space-3)' }} />
          <Skeleton width="100%" height="44px" borderRadius="var(--radius-md)" />
        </Card>
      </div>
    );
  }

  if (status === 'error' || status === 'unavailable') {
    return (
      <div style={{ maxWidth: '760px' }}>
        {header}
        <Card>
          <p
            role="alert"
            style={{
              margin: '0 0 var(--space-3) 0',
              color: status === 'error' ? 'var(--color-status-danger-text)' : 'var(--color-text-primary)',
            }}
          >
            {status === 'unavailable' ? FORM_UNAVAILABLE : loadError}
          </p>
          {status === 'error' ? (
            <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          ) : (
            <Link href={leadsHref} className={buttonClasses({ variant: 'secondary', size: 'sm' })} style={{ textDecoration: 'none' }}>
              Back to Leads
            </Link>
          )}
        </Card>
      </div>
    );
  }

  if (result) {
    const { request, duplicate } = result;
    const isReplacement = request.type === 'replacement';
    return (
      <div style={{ maxWidth: '760px' }}>
        {header}
        <Card>
          <div role="status">
            <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              {isReplacement ? 'Replacement request for' : 'Unresponsive lead:'} <strong style={{ color: 'var(--color-text-primary)' }}>{request.lead_name}</strong>
            </p>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <StatusBadge status={decisionLabel(request.decision)} variant={decisionBadge(request.decision)} />
            </div>
            <p style={{ margin: '0 0 var(--space-2) 0' }}>{request.decision_reason}</p>
            <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              {duplicate
                ? 'We already had this request, so nothing was sent twice.'
                : 'Your request was saved. You can see it under "Your requests" on the Leads page.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <Button variant="primary" onClick={startAgain}>
              Submit another
            </Button>
            <Link href={leadsHref} className={buttonClasses({ variant: 'secondary' })} style={{ textDecoration: 'none' }}>
              Back to Leads
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const textarea = (key: 'whatHappened' | 'contactAttempts', label: string, placeholder: string, help?: string) => {
    const id = fieldId(key);
    const error = errors[key] || '';
    const value = values[key];
    return (
      <div className="ui-form-group">
        <label htmlFor={id} className="ui-label">
          {label}
        </label>
        <textarea
          id={id}
          name={key}
          className={`ui-textarea ${error ? 'ui-input-error' : ''}`.trim()}
          rows={5}
          value={value}
          onChange={(e) => setValue(key, e.target.value)}
          placeholder={placeholder}
          maxLength={LONG_TEXT_MAX}
          aria-required
          aria-invalid={error ? true : undefined}
          aria-describedby={error || help ? `${id}-message` : undefined}
        />
        {error ? (
          <span className="ui-error-text" id={`${id}-message`} role="alert">
            {error}
          </span>
        ) : help ? (
          <span className="ui-helper-text" id={`${id}-message`}>
            {help}
          </span>
        ) : null}
        {value.length > LONG_TEXT_MAX * 0.9 && (
          <span className="ui-helper-text">
            {value.length.toLocaleString('en-US')} of {LONG_TEXT_MAX.toLocaleString('en-US')} characters
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '760px' }}>
      {header}

      <Card style={rulesStyle}>
        {type === 'replacement' ? (
          <>
            <ul style={ruleListStyle}>
              <li style={{ marginBottom: 'var(--space-2)' }}>
                <strong>Replaceable:</strong> the homeowner cancelled before the inspection and can&apos;t be rebooked, wrong
                contact info, not the homeowner, outside your area, a roof that doesn&apos;t qualify (not asphalt shingle, or
                under 4 years old), or the homeowner refused the inspection when you arrived.
              </li>
              <li>
                <strong>Not replaceable:</strong> you inspected a qualified roof and they didn&apos;t buy (roof &quot;didn&apos;t
                need anything&quot;, price, thinking about it, too far gone). That counts as a qualified appointment.
              </li>
            </ul>
            <p style={{ margin: 0 }}>
              Every request is checked against these rules straight away, and you&apos;ll see the result and the reason.{' '}
              <strong>Lead just not answering?</strong> Use the <Link href={otherHref}>Unresponsive Lead form</Link> instead.
            </p>
          </>
        ) : (
          <p style={{ margin: 0 }}>
            <strong>Before you submit:</strong> you should have called <strong>twice a day</strong> while the automated 7-day
            text sequence ran. Submit the lead from <strong>day 4</strong> with no response (not earlier), so the marketing
            team can follow up alongside you. If we can&apos;t reach them either, the lead is escalated for replacement.{' '}
            <strong>Different issue (wrong info, cancelled, doesn&apos;t qualify)?</strong> Use the{' '}
            <Link href={otherHref}>Lead Replacement form</Link>.
          </p>
        )}
      </Card>

      <form onSubmit={handleSubmit} noValidate>
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          {submittingAs && (
            <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Submitting as{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>
                {[submittingAs.name, submittingAs.company].filter(Boolean).join(' · ')}
              </strong>
            </p>
          )}

          {/* Pick from your leads */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2) var(--space-3)' }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-expanded={pickerOpen}
                aria-controls="lead-request-picker"
                onClick={() => setPickerOpen((open) => !open)}
              >
                {pickerOpen ? 'Close the list' : picked ? 'Pick a different lead' : 'Pick from your leads'}
              </Button>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                {picked ? (
                  <>
                    Picked: <strong style={{ color: 'var(--color-text-primary)' }}>{picked.name || 'Unnamed lead'}</strong>{' '}
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      style={{
                        border: 'none',
                        background: 'none',
                        padding: 0,
                        color: 'var(--color-primary-text)',
                        font: 'inherit',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                      }}
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  'or type the name and phone number below.'
                )}
              </span>
            </div>
            {errors.leadId && (
              <span className="ui-error-text" role="alert">
                {errors.leadId}
              </span>
            )}

            {pickerOpen && (
              <div
                id="lead-request-picker"
                style={{
                  marginTop: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <Input
                  aria-label="Search your leads"
                  placeholder="Search name, email or phone"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
                {searchError ? (
                  <p role="alert" style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-status-danger-text)' }}>
                    {searchError}
                  </p>
                ) : matches === null ? (
                  <Skeleton height="80px" />
                ) : matches.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    {search ? 'No leads match your search.' : 'You have no leads yet. Type the name and phone number below.'}
                  </p>
                ) : (
                  <div role="list" aria-label="Your leads" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    {matches.map((lead) => (
                      <div role="listitem" key={lead.id}>
                        <button type="button" style={pickRowStyle} onClick={() => applyLead(lead)}>
                          <span style={{ fontWeight: 'var(--font-weight-medium)', overflowWrap: 'anywhere' }}>
                            {lead.name || 'Unnamed lead'}
                          </span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                            {[lead.phone, `added ${formatDate(lead.created_at)}`].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '0 var(--space-4)' }}>
            <Input
              id={fieldId('leadName')}
              label="Lead / homeowner name"
              name="leadName"
              value={values.leadName}
              onChange={(e) => setValue('leadName', e.target.value)}
              maxLength={LEAD_NAME_MAX}
              autoComplete="off"
              aria-required
              error={errors.leadName || undefined}
            />
            <Input
              id={fieldId('leadPhone')}
              label="Lead phone number"
              name="leadPhone"
              type="tel"
              inputMode="tel"
              value={values.leadPhone}
              onChange={(e) => setValue('leadPhone', e.target.value)}
              maxLength={30}
              autoComplete="off"
              aria-required
              error={errors.leadPhone || undefined}
            />
          </div>

          {type === 'replacement' ? (
            <>
              <Select
                id={fieldId('reason')}
                label="Reason for replacement"
                name="reason"
                placeholder="Choose a reason..."
                value={values.reason}
                onChange={(e) => setValue('reason', e.target.value)}
                options={REPLACEMENT_REASONS.map((r) => ({ value: r.key, label: r.label }))}
                error={errors.reason || undefined}
              />
              <Select
                id={fieldId('appointment')}
                label="Did you get to an appointment with this homeowner?"
                name="appointment"
                placeholder="Choose an answer..."
                value={values.appointment}
                onChange={(e) => setValue('appointment', e.target.value)}
                options={APPOINTMENT_OUTCOMES.map((a) => ({ value: a.key, label: a.label }))}
                error={errors.appointment || undefined}
              />
              {textarea(
                'whatHappened',
                'What happened? (be specific)',
                "Say exactly what happened, e.g. called the day before to confirm, homeowner said they're selling the house and cancelled; or arrived and it's a metal roof.",
                'Vague reasons like "didn\'t qualify" with no detail are not approved. Say which part didn\'t qualify and how you know.'
              )}
            </>
          ) : (
            <>
              <div style={{ maxWidth: '260px' }}>
                <Input
                  id={fieldId('daysSinceSent')}
                  label="Days since lead was sent"
                  name="daysSinceSent"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  step={1}
                  value={values.daysSinceSent}
                  onChange={(e) => setValue('daysSinceSent', e.target.value)}
                  aria-required
                  error={errors.daysSinceSent || undefined}
                  helperText={picked ? 'Counted from the day this lead was added. Change it if that is wrong.' : undefined}
                />
              </div>
              {textarea(
                'contactAttempts',
                'How have you tried to reach them?',
                'e.g. rang twice a day since the 24th, texts delivered but no replies.'
              )}
            </>
          )}
        </Card>

        {submitError && (
          <p role="alert" style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-status-danger-text)', fontSize: 'var(--font-size-sm)' }}>
            {submitError}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : copy.submit}
          </Button>
          <Link href={leadsHref} style={{ fontSize: 'var(--font-size-sm)' }}>
            Cancel
          </Link>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Every question needs an answer.</span>
        </div>
      </form>
    </div>
  );
}
