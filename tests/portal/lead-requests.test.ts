/**
 * The two lead forms built into the portal (Leads page): Lead Replacement and Unresponsive Lead.
 *  - the client's own dropdown options; options offered before are refused but still display
 *  - the instant decision on a replacement request, for every reason and appointment answer
 *  - validation: missing answers, short text, bad phone, days before day 4 (refused, not saved)
 *  - what is saved, who is emailed (lead team list, CSM tick box, fallbacks), duplicates
 *  - sign-in, the Leads section, tenant isolation and the rate limit
 *  - staff handling: list, Mark done / Reopen, Change outcome, CSMs only for their assigned clients
 *  - Slack messages: the link checks, the masked link, the message text, failures, the test message
 *  - the optional automation link: payload, off when empty, failures never fail the request,
 *    private addresses refused by the settings API
 *  - soft failure while the lead_requests table does not exist yet
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById, createTenant } from '../../src/lib/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';
import { appSettingsRepository, leadRequestRepository } from '../../src/lib/db/repositories';
import { globalRateLimiter } from '../../src/lib/security/rate-limiter';
import { GET as portalGet, POST as portalPost } from '../../src/app/api/portal/[clientId]/lead-requests/route';
import { GET as staffGet, PATCH as staffPatch } from '../../src/app/api/csm/clients/[id]/lead-requests/route';
import { GET as automationGet, PUT as automationPut } from '../../src/app/api/admin/settings/automation/route';
import { GET as slackGet, PUT as slackPut } from '../../src/app/api/admin/settings/slack/route';
import { POST as slackTest } from '../../src/app/api/admin/settings/slack/test/route';
import { GET as dashboardGet } from '../../src/app/api/admin/dashboard/route';
import {
  APPOINTMENT_OUTCOMES,
  FORM_UNAVAILABLE,
  REPLACEMENT_REASONS,
  UNRESPONSIVE_TOO_EARLY,
  appointmentLabel,
  daysSince,
  detailLines,
  reasonLabel,
  type AppointmentOutcome,
  type ReplacementReason,
} from '../../src/lib/lead-requests/definition';
import { decideReplacement, APPROVED_TEXT, NEEDS_REVIEW_TEXT, NOT_REPLACEABLE_TEXT } from '../../src/lib/lead-requests/decision';
import { validateLeadRequest } from '../../src/lib/lead-requests/validation';
import { checkWebhookUrl } from '../../src/lib/lead-requests/automation';
import { checkSlackWebhookUrl, escapeSlack, leadRequestSlackText, maskSlackWebhookUrl } from '../../src/lib/lead-requests/slack';
import { leadRequestEmail } from '../../src/lib/email';
import { auditActionLabel } from '../../src/lib/utils/log-labels';

// Tests must never send real email, call a real webhook or touch a real database.
for (const key of [
  'RESEND_API_KEY', 'BREVO_API_KEY', 'MEDIA_BUYER_EMAIL', 'EMAIL_TEST_REDIRECT_TO',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
]) {
  delete process.env[key];
}

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const clientId = 'abc-roofing';
const HOOK = 'https://services.leadconnectorhq.com/hooks/abc123/webhook-trigger/xyz';
// Made up: the shape of a Slack Incoming Webhook link, not a real one.
// Built from parts so secret scanners do not mistake this made-up link for a real one.
const SLACK = ['https://hooks.slack.com', 'services', 'T0TESTTEAM', 'B0TESTCHAN', 'notARealSlackSecretValue'].join('/');
const SLACK_MASK = 'https://hooks.slack.com/services/T…/B…/••••';

function request(path: string, method: string, session?: string, body?: unknown): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (session) headers.set('cookie', `${SESSION_COOKIE_NAME}=${session}`);
  return new NextRequest(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function post(body: unknown, session?: string, options: { target?: string; keepRateLimit?: boolean } = {}) {
  // The limit of 30 an hour has its own test; everywhere else each request starts fresh.
  if (!options.keepRateLimit) globalRateLimiter.reset();
  const target = options.target || clientId;
  const res = await portalPost(request(`/api/portal/${target}/lead-requests`, 'POST', session, body), { params: { clientId: target } });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function list(session?: string, target: string = clientId, query = '') {
  const res = await portalGet(request(`/api/portal/${target}/lead-requests${query}`, 'GET', session), { params: { clientId: target } });
  return { status: res.status, body: await res.json() };
}

interface Captured {
  emails: { to: string; subject: string; text: string; html: string }[];
  hooks: { url: string; body: any; init: any }[];
}

/**
 * Pretends a Resend key is set and stubs fetch: email provider calls and automation webhook calls
 * are captured separately. `hook` decides how the webhook answers.
 */
async function captured<T>(fn: () => Promise<T>, hook: (url: string) => Promise<Response> | Response = () => new Response('{}', { status: 200 })): Promise<{ result: T } & Captured> {
  const emails: Captured['emails'] = [];
  const hooks: Captured['hooks'] = [];
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key-not-real';
  globalThis.fetch = (async (url: any, init?: any) => {
    const target = String(url);
    const body = JSON.parse(init?.body || '{}');
    if (target.includes('api.resend.com')) {
      emails.push({ to: body.to[0], subject: body.subject, text: body.text || '', html: body.html || '' });
      return new Response(JSON.stringify({ id: `msg-${emails.length}` }), { status: 200 });
    }
    hooks.push({ url: target, body, init });
    return hook(target);
  }) as typeof fetch;
  try {
    return { result: await fn(), emails, hooks };
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
}

const WHAT_HAPPENED = 'Called the day before to confirm; the homeowner said they are selling the house and cancelled.';
const ATTEMPTS = 'Rang twice a day since the 24th, texts delivered but no replies.';

const replacement = (overrides: Record<string, unknown> = {}) => ({
  type: 'replacement',
  leadName: 'Mary Major',
  leadPhone: '+1 555 010 2030',
  reason: 'no_longer_wants_inspection',
  appointment: 'never_booked',
  whatHappened: WHAT_HAPPENED,
  ...overrides,
});

const unresponsive = (overrides: Record<string, unknown> = {}) => ({
  type: 'unresponsive',
  leadName: 'Quiet Quentin',
  leadPhone: '(555) 303-4040',
  daysSinceSent: 5,
  contactAttempts: ATTEMPTS,
  ...overrides,
});

async function run() {
  console.log('--- Lead Replacement and Unresponsive Lead form tests ---');
  resetStore();
  globalRateLimiter.reset();

  const tenant = (await getTenantById(clientId))!;
  assert(tenant, 'demo tenant must exist');
  const store = getStore();
  const rows = () => store.leadRequests.filter((r) => r.tenant_id === tenant.id);
  const audits = (action: string) => store.auditLogs.filter((l) => l.action === action);
  const owner = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant.id);
  const member = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenant.id);
  const admin = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const assignedCsm = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const otherCsm = createSessionToken('user-csm-2', 'csm.agent@motionz.ai', 'csm');
  const otherTenant = await createTenant({ name: 'Beta Roofing', slug: 'beta-roofing', primary_email: 'owner@betaroofing.com' });
  const outsider = createSessionToken('user-outsider', 'owner@betaroofing.com', 'client', otherTenant.id);
  const robert = store.leads.find((l) => l.id === 'lead-1')!;
  assert(robert && robert.tenant_id === tenant.id, 'the demo client has a lead to pick');

  // ---- 1. The definition: the client's own wording, in the client's order -------------------
  assert.deepStrictEqual(
    APPOINTMENT_OUTCOMES.map((a) => a.label),
    [
      'No, an appointment was never booked',
      'No, it was booked but cancelled / no-show before the inspection',
      'Yes, I was at the appointment',
    ]
  );
  assert.deepStrictEqual(
    REPLACEMENT_REASONS.map((r) => r.label),
    [
      'No longer wants the inspection',
      'Wrong contact information',
      "Wrong roof material / doesn't qualify",
      'Not the homeowner',
      'Outside service area',
      "Appointment didn't match qualification parameters",
      'Other',
    ]
  );
  assert.deepStrictEqual(APPOINTMENT_OUTCOMES.map((a) => a.key), ['never_booked', 'cancelled_no_show', 'attended']);
  assert.deepStrictEqual(
    REPLACEMENT_REASONS.map((r) => r.key),
    ['no_longer_wants_inspection', 'wrong_contact_info', 'wrong_roof_material', 'not_homeowner', 'outside_service_area', 'qualification_mismatch', 'other']
  );

  // Requests saved with the options offered before still read properly: the label stored with the
  // request is shown, and without one the old wording is used. Those options cannot be chosen any more.
  assert.deepStrictEqual(
    detailLines('replacement', {
      reason: 'inspected_no_sale', reason_label: "I inspected the roof and they didn't buy",
      appointment: 'inspected', appointment_label: 'Yes, and I inspected the roof', what_happened: 'Old row.',
    }),
    [['Reason for replacement', "I inspected the roof and they didn't buy"], ['Got to an appointment?', 'Yes, and I inspected the roof'], ['What happened', 'Old row.']]
  );
  // A key that is still offered keeps the wording it was saved with.
  assert.strictEqual(detailLines('replacement', { reason: 'wrong_contact_info', reason_label: 'Wrong contact info' })[0][1], 'Wrong contact info');
  assert.strictEqual(detailLines('replacement', { reason: 'cancelled_before_inspection', appointment: 'not_inspected' })[0][1], "Cancelled before the inspection and can't be rebooked");
  assert.strictEqual(detailLines('replacement', { reason: 'cancelled_before_inspection', appointment: 'not_inspected' })[1][1], 'Yes, but I could not inspect the roof');
  assert.strictEqual(reasonLabel('roof_not_qualified'), "Roof doesn't qualify (not asphalt shingle, or under 4 years old)");
  assert.strictEqual(reasonLabel('refused_inspection'), 'Homeowner refused the inspection when I arrived');
  assert.strictEqual(appointmentLabel('none'), 'No, there was no appointment');
  assert.strictEqual(reasonLabel('wrong_contact_info'), 'Wrong contact information');
  for (const retired of ['cancelled_before_inspection', 'roof_not_qualified', 'refused_inspection', 'inspected_no_sale']) {
    assert.ok(validateLeadRequest('replacement', replacement({ reason: retired })).errors.reason, `${retired} can no longer be chosen`);
  }
  for (const retired of ['none', 'not_inspected', 'inspected']) {
    assert.ok(validateLeadRequest('replacement', replacement({ appointment: retired })).errors.appointment, `${retired} can no longer be chosen`);
  }
  console.log(' PASS: the dropdowns offer the client\'s options in order; the earlier options still display but cannot be chosen.');

  // ---- 2. The decision table -----------------------------------------------------------------
  const A = 'approved';
  const R = 'needs_review';
  // Columns: never booked · booked but cancelled / no-show · I was at the appointment.
  const table: Record<ReplacementReason, [string, string, string]> = {
    no_longer_wants_inspection: [A, A, A],
    wrong_contact_info: [A, A, R],
    wrong_roof_material: [A, A, A],
    not_homeowner: [A, A, A],
    outside_service_area: [A, A, A],
    qualification_mismatch: [A, A, A],
    other: [R, R, R],
  };
  const columns: AppointmentOutcome[] = ['never_booked', 'cancelled_no_show', 'attended'];
  const texts: Record<string, string> = { [A]: APPROVED_TEXT, [R]: NEEDS_REVIEW_TEXT };
  assert.deepStrictEqual(Object.keys(table), REPLACEMENT_REASONS.map((r) => r.key), 'the table covers every reason');
  assert.deepStrictEqual(columns, APPOINTMENT_OUTCOMES.map((a) => a.key), 'and every appointment answer');
  let combinations = 0;
  for (const reason of Object.keys(table) as ReplacementReason[]) {
    columns.forEach((appointment, i) => {
      const result = decideReplacement(reason, appointment);
      assert.strictEqual(result.decision, table[reason][i], `${reason} + ${appointment}`);
      assert.strictEqual(result.reason, texts[table[reason][i]], `${reason} + ${appointment}: the explanation`);
      assert.notStrictEqual(result.decision, 'not_replaceable', '"Not replaceable" is never worked out automatically');
      combinations++;
    });
  }
  assert.strictEqual(combinations, 21);
  assert.strictEqual(NEEDS_REVIEW_TEXT, 'Our team will look at this one and get back to you.');
  assert.strictEqual(APPROVED_TEXT, 'This matches the replacement rules. It has been sent to our marketing team.');
  console.log(' PASS: the decision is right for all 21 reason and appointment combinations.');

  // ---- 3. Validation (shared by the page and the API) ----------------------------------------
  assert.deepStrictEqual(Object.keys(validateLeadRequest('replacement', {}).errors).sort(), ['appointment', 'leadName', 'leadPhone', 'reason', 'whatHappened']);
  assert.deepStrictEqual(Object.keys(validateLeadRequest('unresponsive', {}).errors).sort(), ['contactAttempts', 'daysSinceSent', 'leadName', 'leadPhone']);
  assert.deepStrictEqual(validateLeadRequest('replacement', replacement()).errors, {});
  assert.deepStrictEqual(validateLeadRequest('unresponsive', unresponsive({ daysSinceSent: '4' })).details, { days_since_sent: 4, contact_attempts: ATTEMPTS });
  assert.strictEqual(daysSince(new Date(Date.now() - 5.5 * 24 * 60 * 60 * 1000).toISOString()), 5, 'days are pre-filled from the day the lead was added');
  assert.strictEqual(daysSince('not a date'), null);

  const before = rows().length;
  const refusals: [Record<string, unknown>, string, RegExp][] = [
    [replacement({ leadName: '   ' }), 'leadName', /name/i],
    [replacement({ leadName: 'x'.repeat(121) }), 'leadName', /too long/],
    [replacement({ leadPhone: '' }), 'leadPhone', /phone number/],
    [replacement({ leadPhone: 'call me maybe' }), 'leadPhone', /valid phone number/],
    [replacement({ leadPhone: '12345' }), 'leadPhone', /valid phone number/],
    [replacement({ reason: '' }), 'reason', /Choose a reason/],
    [replacement({ reason: 'because' }), 'reason', /Choose a reason/],
    [replacement({ reason: 'Wrong contact information' }), 'reason', /Choose a reason/],
    [replacement({ reason: 'inspected_no_sale' }), 'reason', /Choose a reason/],
    [replacement({ appointment: 'inspected' }), 'appointment', /Choose an answer/],
    [replacement({ appointment: undefined }), 'appointment', /Choose an answer/],
    [replacement({ appointment: 'maybe' }), 'appointment', /Choose an answer/],
    [replacement({ whatHappened: '' }), 'whatHappened', /answer this question/],
    [replacement({ whatHappened: "didn't qualify" }), 'whatHappened', /at least 30 characters/],
    [replacement({ whatHappened: 'x'.repeat(29) }), 'whatHappened', /at least 30 characters/],
    [replacement({ whatHappened: 'x'.repeat(2001) }), 'whatHappened', /2,000 characters/],
    [replacement({ whatHappened: { text: WHAT_HAPPENED } }), 'whatHappened', /answer this question/],
    [unresponsive({ daysSinceSent: '' }), 'daysSinceSent', /whole number/],
    [unresponsive({ daysSinceSent: undefined }), 'daysSinceSent', /whole number/],
    [unresponsive({ daysSinceSent: 4.5 }), 'daysSinceSent', /whole number/],
    [unresponsive({ daysSinceSent: '4.5' }), 'daysSinceSent', /whole number/],
    [unresponsive({ daysSinceSent: 'five' }), 'daysSinceSent', /whole number/],
    [unresponsive({ daysSinceSent: -1 }), 'daysSinceSent', /whole number/],
    [unresponsive({ daysSinceSent: 366 }), 'daysSinceSent', /whole number/],
    [unresponsive({ contactAttempts: 'called twice' }), 'contactAttempts', /at least 20 characters/],
    [unresponsive({ contactAttempts: 'x'.repeat(2001) }), 'contactAttempts', /2,000 characters/],
    [unresponsive({ leadPhone: 'n/a' }), 'leadPhone', /valid phone number/],
  ];
  for (const [body, field, message] of refusals) {
    const res = await post(body, owner);
    assert.strictEqual(res.status, 400, `${field}=${JSON.stringify(body[field])} is refused`);
    assert.deepStrictEqual(Object.keys(res.body.fields), [field], `only ${field} is marked`);
    assert.match(res.body.fields[field], message);
    assert.strictEqual(res.body.error, res.body.fields[field], 'the summary is the same message');
  }
  for (const body of ['{not json', [], 'null', { ...replacement(), type: 'refund' }, { ...replacement(), type: undefined }]) {
    assert.strictEqual((await post(body, owner)).status, 400, 'a malformed body or unknown form is refused');
  }
  // 2,000 characters and 30 characters exactly are fine (checked without saving).
  assert.deepStrictEqual(validateLeadRequest('replacement', replacement({ whatHappened: 'x'.repeat(2000) })).errors, {});
  assert.deepStrictEqual(validateLeadRequest('replacement', replacement({ whatHappened: 'x'.repeat(30) })).errors, {});
  assert.deepStrictEqual(validateLeadRequest('unresponsive', unresponsive({ contactAttempts: 'x'.repeat(20), daysSinceSent: 365 })).errors, {});
  assert.strictEqual(rows().length, before, 'a refused form saves nothing');
  console.log(' PASS: missing, short, too long and malformed answers are refused with 400 and nothing is saved.');

  // ---- 4. Unresponsive lead before day 4: refused with the inline message, not saved -----------
  for (const days of [0, 1, 2, 3, '3', '0']) {
    const res = await captured(() => post(unresponsive({ daysSinceSent: days }), owner));
    assert.strictEqual(res.result.status, 400, `day ${days} is too early`);
    assert.strictEqual(res.result.body.code, 'TOO_EARLY');
    assert.strictEqual(res.result.body.error, 'Submit this lead from day 4. Keep calling twice a day until then.');
    assert.strictEqual(res.result.body.fields.daysSinceSent, UNRESPONSIVE_TOO_EARLY);
    assert.strictEqual(res.emails.length, 0, 'nobody is emailed about a refused lead');
  }
  assert.strictEqual(rows().length, before, 'a lead submitted before day 4 is not saved');
  assert.strictEqual(audits('lead_request.submitted').length, 0);
  console.log(' PASS: an unresponsive lead before day 4 is refused with the inline message and not saved.');

  // ---- 5. A saved replacement request --------------------------------------------------------
  await appSettingsRepository.set(
    'notifications',
    { onboarding_form_recipients: ['buyer@motionz.ai'], notify_assigned_csm: true, lead_form_recipients: ['Leads@Motionz.ai', 'review@motionz.ai'] },
    'admin@motionz.ai'
  );
  let sent = await captured(() => post(replacement({ leadId: robert.id, leadName: 'Robert Johnson', leadPhone: robert.phone }), owner));
  assert.strictEqual(sent.result.status, 200);
  assert.strictEqual(sent.result.body.success, true);
  assert.strictEqual(sent.result.body.request.decision, 'approved');
  assert.strictEqual(sent.result.body.request.decision_reason, APPROVED_TEXT);
  assert.ok(!('submitted_by' in sent.result.body.request), 'internal user ids are not sent to the client');
  assert.strictEqual(rows().length, before + 1);
  const saved = rows()[0];
  assert.strictEqual(saved.id, sent.result.body.request.id);
  assert.deepStrictEqual(
    { ...saved, id: 'x', created_at: 'x' },
    {
      id: 'x',
      tenant_id: tenant.id,
      lead_id: robert.id,
      type: 'replacement',
      lead_name: 'Robert Johnson',
      lead_phone: robert.phone,
      details: {
        reason: 'no_longer_wants_inspection',
        reason_label: 'No longer wants the inspection',
        appointment: 'never_booked',
        appointment_label: 'No, an appointment was never booked',
        what_happened: WHAT_HAPPENED,
      },
      decision: 'approved',
      decision_reason: APPROVED_TEXT,
      status: 'open',
      submitted_by: 'user-client-1',
      submitter_email: 'john@abcroofing.com',
      created_at: 'x',
      resolved_at: null,
      resolved_by: null,
    }
  );
  assert.ok(Date.now() - new Date(saved.created_at).getTime() < 5000);

  // Emailed to the lead team list (each address once, lower-cased) plus the assigned CSM.
  assert.deepStrictEqual(sent.emails.map((e) => e.to).sort(), ['csm@motionz.ai', 'leads@motionz.ai', 'review@motionz.ai']);
  assert.ok(!sent.emails.some((e) => e.to === 'buyer@motionz.ai'), 'the onboarding list is a different list');
  const mail = sent.emails.find((e) => e.to === 'leads@motionz.ai')!;
  assert.strictEqual(mail.subject, `Lead replacement request (Approved): Robert Johnson — ${tenant.name}`);
  for (const part of [
    'Robert Johnson', robert.phone!, 'No longer wants the inspection', 'No, an appointment was never booked',
    WHAT_HAPPENED, 'Outcome: Approved', APPROVED_TEXT, 'john@abcroofing.com', `${BASE_URL}/admin/clients/${tenant.id}`,
  ]) {
    assert.ok(mail.text.includes(part), `the email says "${part}"`);
  }
  assert.ok(mail.html.includes(`${BASE_URL}/admin/clients/${tenant.id}`), 'the button opens the admin client page');
  assert.ok(sent.emails.find((e) => e.to === 'csm@motionz.ai')!.text.includes(`${BASE_URL}/csm/clients/${tenant.id}/setup`), 'the CSM gets a link they can open');
  assert.strictEqual(sent.hooks.length, 0, 'no Slack link and no automation link are set, so nothing else is called');
  assert.strictEqual(sent.result.body.notified, 3);

  let audit = audits('lead_request.submitted')[0];
  assert.strictEqual(audit.tenant_id, tenant.id);
  assert.strictEqual(audit.actor_email, 'john@abcroofing.com');
  assert.strictEqual(audit.resource_id, saved.id);
  assert.deepStrictEqual(audit.details, { type: 'replacement', leadName: 'Robert Johnson', decision: 'approved', notified: 3, webhook: 'off' });
  console.log(' PASS: an approved replacement request is saved, audit-logged and emailed to the lead team and the CSM.');

  // ---- 6. Needs review is saved and emailed too, and the subject says which ------------------
  sent = await captured(() => post(replacement({ reason: 'other', appointment: 'never_booked', leadName: 'Odd Olga' }), owner));
  assert.strictEqual(sent.result.status, 200);
  assert.strictEqual(sent.result.body.request.decision, 'needs_review');
  assert.strictEqual(sent.result.body.request.decision_reason, NEEDS_REVIEW_TEXT);
  assert.strictEqual(sent.emails[0].subject, `Lead replacement request (Needs review): Odd Olga — ${tenant.name}`);
  assert.strictEqual(sent.emails.length, 3);
  assert.strictEqual(rows()[0].lead_id, null, 'a typed-in lead has no lead id');
  assert.strictEqual(rows()[0].details.reason_label, 'Other');

  sent = await captured(() => post(replacement({ reason: 'wrong_contact_info', appointment: 'attended', leadName: 'Ian Met-Them' }), owner));
  assert.strictEqual(sent.result.body.request.decision, 'needs_review', 'being at the appointment does not fit "wrong contact information"');
  assert.strictEqual(sent.result.body.request.decision_reason, NEEDS_REVIEW_TEXT);
  assert.strictEqual(rows()[0].details.appointment_label, 'Yes, I was at the appointment');

  sent = await captured(() => post(replacement({ reason: 'wrong_roof_material', appointment: 'attended', leadName: 'Metal Mike' }), owner));
  assert.strictEqual(sent.result.body.request.decision, 'approved', 'the visit showed the roof does not qualify');
  assert.strictEqual(sent.emails[0].subject, `Lead replacement request (Approved): Metal Mike — ${tenant.name}`);

  sent = await captured(() => post(replacement({ reason: 'qualification_mismatch', appointment: 'cancelled_no_show', leadName: 'Paula Params' }), owner));
  assert.strictEqual(sent.result.body.request.decision, 'approved');
  assert.strictEqual(rows().length, before + 5, 'every outcome is saved');
  assert.ok(!rows().some((r) => r.decision === 'not_replaceable'), 'nothing is marked "Not replaceable" automatically');
  console.log(' PASS: Needs review and Approved are saved and emailed, and the subject says which.');

  // ---- 7. A saved unresponsive lead ----------------------------------------------------------
  sent = await captured(() => post(unresponsive({ daysSinceSent: '4' }), member));
  assert.strictEqual(sent.result.status, 200);
  assert.strictEqual(sent.result.body.request.decision, 'sent');
  const quiet = rows()[0];
  assert.strictEqual(quiet.type, 'unresponsive');
  assert.deepStrictEqual(quiet.details, { days_since_sent: 4, contact_attempts: ATTEMPTS });
  assert.strictEqual(quiet.submitted_by, 'user-member-1');
  assert.strictEqual(quiet.submitter_email, 'sarah@abcroofing.com');
  assert.ok(quiet.decision_reason && quiet.decision_reason.includes('marketing team'));
  assert.strictEqual(sent.emails[0].subject, `Unresponsive lead: Quiet Quentin — ${tenant.name}`);
  assert.ok(sent.emails[0].text.includes('Days since lead was sent: 4') && sent.emails[0].text.includes(ATTEMPTS));
  assert.ok(sent.emails[0].text.includes('Outcome: Sent to the marketing team'));
  console.log(' PASS: an unresponsive lead from day 4 is saved as "Sent to the marketing team" and emailed.');

  // ---- 8. Recipients: the CSM tick box and the fallbacks -------------------------------------
  const sendOne = async (name: string) => (await captured(() => post(replacement({ leadName: name }), owner))).emails.map((e) => e.to).sort();
  await appSettingsRepository.set('notifications', { onboarding_form_recipients: [], notify_assigned_csm: false, lead_form_recipients: ['leads@motionz.ai'] }, 'admin@motionz.ai');
  assert.deepStrictEqual(await sendOne('Box Unticked'), ['leads@motionz.ai'], 'CSM box unticked: the lead team only');

  await appSettingsRepository.set('notifications', { onboarding_form_recipients: [], notify_assigned_csm: true, lead_form_recipients: ['csm@motionz.ai', 'CSM@motionz.ai'] }, 'admin@motionz.ai');
  assert.deepStrictEqual(await sendOne('Listed Twice'), ['csm@motionz.ai'], 'an address on the list and as CSM is emailed once');

  await appSettingsRepository.set('notifications', { onboarding_form_recipients: ['buyer@motionz.ai'], notify_assigned_csm: false, lead_form_recipients: [] }, 'admin@motionz.ai');
  assert.deepStrictEqual(await sendOne('Nobody Listed'), ['csm@motionz.ai'], 'nobody on the list and the box unticked: the assigned CSM still gets it');

  const assignmentIndex = store.csmAssignments.findIndex((a) => a.tenant_id === tenant.id);
  const [assignment] = store.csmAssignments.splice(assignmentIndex, 1);
  const admins = store.users.filter((u) => u.role === 'admin').map((u) => u.email.toLowerCase()).sort();
  assert.ok(admins.length > 0);
  assert.deepStrictEqual(await sendOne('No Csm'), admins, 'no list and no CSM: every admin');
  store.csmAssignments.push(assignment);

  // Without an email provider the request is still saved; the reply says nobody was emailed.
  const quietSend = await post(replacement({ leadName: 'No Provider' }), owner);
  assert.strictEqual(quietSend.status, 200);
  assert.strictEqual(quietSend.body.notified, 0);
  assert.strictEqual(rows()[0].lead_name, 'No Provider');
  await appSettingsRepository.set('notifications', { onboarding_form_recipients: [], notify_assigned_csm: true, lead_form_recipients: ['leads@motionz.ai'] }, 'admin@motionz.ai');
  console.log(' PASS: recipients follow the lead team list, the CSM tick box and the CSM / admin fallbacks.');

  // ---- 9. The same request twice within 10 minutes -------------------------------------------
  const countBefore = rows().length;
  const first = await captured(() => post(replacement({ leadName: 'Dana Double', reason: 'not_homeowner' }), owner));
  // Same lead typed with different capitals and phone punctuation, by a colleague: still the same request.
  const again = await captured(() => post(replacement({ leadName: ' dana double ', leadPhone: '+1 (555) 010-2030', reason: 'not_homeowner' }), member));
  assert.strictEqual(again.result.status, 200);
  assert.strictEqual(again.result.body.duplicate, true);
  assert.strictEqual(again.result.body.request.id, first.result.body.request.id, 'the earlier result is returned');
  assert.strictEqual(again.result.body.request.decision, 'approved');
  assert.strictEqual(again.emails.length, 0, 'nobody is emailed twice');
  assert.strictEqual(rows().length, countBefore + 1, 'it is saved once');
  assert.strictEqual(audits('lead_request.submitted').filter((l) => l.details?.leadName === 'Dana Double').length, 1);

  // A different answer, the other form, or the same request after 10 minutes is a new request.
  assert.strictEqual((await post(replacement({ leadName: 'Dana Double', reason: 'wrong_contact_info' }), owner)).body.duplicate, undefined);
  assert.strictEqual((await post(unresponsive({ leadName: 'Dana Double', leadPhone: '+1 555 010 2030' }), owner)).body.duplicate, undefined);
  rows().find((r) => r.id === first.result.body.request.id)!.created_at = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  assert.strictEqual((await post(replacement({ leadName: 'Dana Double', reason: 'not_homeowner' }), owner)).body.duplicate, undefined);
  assert.strictEqual(rows().length, countBefore + 4);

  // A picked lead is matched by its id.
  const pickedOnce = await post(unresponsive({ leadId: robert.id, leadName: 'Robert Johnson', leadPhone: robert.phone }), owner);
  const pickedTwice = await post(unresponsive({ leadId: robert.id, leadName: 'Robert J.', leadPhone: robert.phone }), owner);
  assert.strictEqual(pickedTwice.body.duplicate, true);
  assert.strictEqual(pickedTwice.body.request.id, pickedOnce.body.request.id);
  console.log(' PASS: the same request within 10 minutes is ignored and the earlier result is returned.');

  // ---- 10. Sign-in, the Leads section and tenant isolation ------------------------------------
  let res = await post(replacement({ leadName: 'Signed Out' }));
  assert.strictEqual(res.status, 401, 'a signed-out caller cannot submit');
  assert.strictEqual((await list()).status, 401, 'a signed-out caller cannot read the list');

  res = await post(replacement({ leadName: 'Wrong Client' }), outsider);
  assert.strictEqual(res.status, 403, "a client cannot submit to another client's portal");
  assert.strictEqual((await list(outsider)).status, 403);
  assert.strictEqual((await post(replacement(), admin, { target: '00000000-0000-4000-8000-00000000dead' })).status, 404);

  // A lead of another client cannot be attached, even by guessing its id.
  store.leads.push({ ...robert, id: 'lead-of-beta', tenant_id: otherTenant.id, ghl_contact_id: 'cnt_beta' });
  res = await post(replacement({ leadId: 'lead-of-beta', leadName: 'Borrowed Lead' }), owner);
  assert.strictEqual(res.status, 400);
  assert.match(res.body.fields.leadId, /could not be found in your leads/);
  assert.ok(!rows().some((r) => r.lead_name === 'Borrowed Lead'));

  const memberUser = store.users.find((u) => u.id === 'user-member-1')!;
  const originalModules = memberUser.allowed_modules;
  memberUser.allowed_modules = ['onboarding', 'tracking'];
  res = await post(replacement({ leadName: 'No Leads Access' }), member);
  assert.strictEqual(res.status, 403, 'a team member without Leads cannot submit');
  assert.strictEqual((await list(member)).status, 403, 'or read the list');
  memberUser.allowed_modules = originalModules;

  const toggle = store.featureToggles.find((t) => t.tenant_id === tenant.id && t.feature_key === 'leads')!;
  toggle.is_enabled = false;
  assert.strictEqual((await post(replacement({ leadName: 'Leads Off' }), owner)).status, 403, 'nobody at the client can submit when Leads is switched off');
  assert.strictEqual((await post(replacement({ leadName: 'Staff While Off' }), admin)).status, 200, 'staff are not blocked by the client’s sections');
  toggle.is_enabled = true;
  assert.ok(!rows().some((r) => ['Signed Out', 'Wrong Client', 'No Leads Access', 'Leads Off'].includes(r.lead_name)));

  // The other client submits one of their own; each client only ever sees their own.
  assert.strictEqual((await post(unresponsive({ leadName: 'Beta Lead' }), outsider, { target: otherTenant.id })).status, 200);
  let mine = await list(owner);
  assert.strictEqual(mine.status, 200);
  assert.strictEqual(mine.body.available, true);
  assert.strictEqual(mine.body.total, rows().length);
  assert.ok(mine.body.requests.length > 0 && mine.body.requests.length <= 20, 'capped at 20 per page');
  assert.ok(mine.body.requests.every((r: any) => r.lead_name !== 'Beta Lead'), "another client's request is never listed");
  assert.deepStrictEqual(
    mine.body.requests.map((r: any) => r.created_at),
    [...mine.body.requests.map((r: any) => r.created_at)].sort().reverse(),
    'newest first'
  );
  assert.deepStrictEqual(mine.body.submittingAs, { name: 'John Smith', company: tenant.name });
  const theirs = await list(outsider, otherTenant.id);
  assert.deepStrictEqual(theirs.body.requests.map((r: any) => r.lead_name), ['Beta Lead']);

  // Paging ("Show more") and the lead to pre-pick.
  const paged = await list(owner, clientId, '?limit=2&offset=2');
  assert.deepStrictEqual(paged.body.requests.map((r: any) => r.id), rows().slice(2, 4).map((r) => r.id));
  assert.strictEqual(paged.body.total, rows().length);
  const withLead = await list(owner, clientId, `?limit=1&lead=${robert.id}`);
  assert.deepStrictEqual(withLead.body.lead, { id: robert.id, name: 'Robert Johnson', phone: robert.phone, created_at: robert.created_at });
  assert.strictEqual((await list(owner, clientId, '?lead=lead-of-beta')).body.lead, null, "another client's lead is never returned");
  console.log(' PASS: sign-in, the Leads section and tenant isolation are enforced; a client only sees their own requests.');

  // ---- 11. Staff may submit on a client's behalf ----------------------------------------------
  res = await post(unresponsive({ leadName: 'Staff Sent' }), assignedCsm);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(rows()[0].submitter_email, 'csm@motionz.ai', 'the member of staff is recorded as the submitter');
  assert.strictEqual(rows()[0].submitted_by, 'user-csm-1');
  assert.strictEqual((await post(unresponsive({ leadName: 'Other Csm' }), otherCsm)).status, 403, 'a CSM cannot submit for a client that is not theirs');
  console.log(' PASS: staff can submit for a client they look after, and are recorded as the submitter.');

  // ---- 12. Staff handling: list, Mark done, Reopen -------------------------------------------
  const staffList = async (session?: string, id: string = tenant.id) => {
    const r = await staffGet(request(`/api/csm/clients/${id}/lead-requests`, 'GET', session), { params: { id } });
    return { status: r.status, body: await r.json() };
  };
  const mark = async (body: unknown, session?: string, id: string = tenant.id) => {
    const r = await staffPatch(request(`/api/csm/clients/${id}/lead-requests`, 'PATCH', session, body), { params: { id } });
    return { status: r.status, body: await r.json() };
  };

  assert.strictEqual((await staffList()).status, 401);
  assert.strictEqual((await staffList(owner)).status, 403, 'a client cannot use the staff list');
  assert.strictEqual((await staffList(otherCsm)).status, 403, 'a CSM cannot read a client that is not theirs');
  for (const session of [admin, assignedCsm]) {
    const listed = await staffList(session);
    assert.strictEqual(listed.status, 200);
    assert.strictEqual(listed.body.total, rows().length);
    assert.strictEqual(listed.body.requests[0].lead_name, 'Staff Sent');
    assert.ok(listed.body.requests.every((r: any) => r.tenant_id === tenant.id));
    assert.ok(listed.body.requests[0].details.contact_attempts, "the client's own words are included");
  }

  const target = rows()[0];
  assert.strictEqual((await mark({ requestId: target.id, status: 'done' })).status, 401);
  assert.strictEqual((await mark({ requestId: target.id, status: 'done' }, owner)).status, 403, 'a client cannot mark a request done');
  assert.strictEqual((await mark({ requestId: target.id, status: 'done' }, otherCsm)).status, 403, 'a CSM can only handle their assigned clients');
  assert.strictEqual(target.status, 'open');
  assert.strictEqual((await mark({ requestId: target.id, status: 'closed' }, admin)).status, 400);
  assert.strictEqual((await mark({ status: 'done' }, admin)).status, 400);
  assert.strictEqual((await mark({ requestId: 'no-such-request', status: 'done' }, admin)).status, 404);
  // A request of another client cannot be changed through this client's address.
  const betaRequest = store.leadRequests.find((r) => r.tenant_id === otherTenant.id)!;
  assert.strictEqual((await mark({ requestId: betaRequest.id, status: 'done' }, assignedCsm)).status, 404);
  assert.strictEqual(betaRequest.status, 'open');

  let marked = await mark({ requestId: target.id, status: 'done' }, assignedCsm);
  assert.strictEqual(marked.status, 200);
  assert.strictEqual(marked.body.changed, true);
  assert.strictEqual(target.status, 'done');
  assert.strictEqual(target.resolved_by, 'user-csm-1');
  assert.ok(target.resolved_at && Date.now() - new Date(target.resolved_at).getTime() < 5000);
  audit = audits('lead_request.status_changed')[0];
  assert.strictEqual(audit.actor_email, 'csm@motionz.ai');
  assert.strictEqual(audit.resource_id, target.id);
  assert.strictEqual(audit.details?.status, 'done');
  assert.strictEqual(audit.details?.previous, 'open');
  assert.strictEqual((await staffList(admin)).body.requests[0].resolved_by_name, 'Motionz CSM', 'the list says who marked it done');

  marked = await mark({ requestId: target.id, status: 'done' }, admin);
  assert.strictEqual(marked.body.changed, false, 'marking a done request done again changes nothing');
  assert.strictEqual(audits('lead_request.status_changed').length, 1);

  marked = await mark({ requestId: target.id, status: 'open' }, admin);
  assert.strictEqual(marked.status, 200);
  assert.strictEqual(target.status, 'open');
  assert.strictEqual(target.resolved_at, null);
  assert.strictEqual(target.resolved_by, null);
  assert.strictEqual(audits('lead_request.status_changed').length, 2);
  // The client still sees the same outcome whatever staff do with it.
  assert.strictEqual((await list(owner)).body.requests[0].decision, 'sent');
  console.log(' PASS: admins and the assigned CSM can list, mark done and reopen; everyone else is refused.');

  // ---- 12b. Staff handling: Change outcome (Lead Replacement requests only) --------------------
  const reviewed = rows().find((r) => r.lead_name === 'Odd Olga')!;
  assert.strictEqual(reviewed.decision, 'needs_review');
  assert.strictEqual((await mark({ requestId: reviewed.id, decision: 'not_replaceable' })).status, 401);
  assert.strictEqual((await mark({ requestId: reviewed.id, decision: 'not_replaceable' }, owner)).status, 403, 'a client cannot change an outcome');
  assert.strictEqual((await mark({ requestId: reviewed.id, decision: 'not_replaceable' }, otherCsm)).status, 403);
  for (const bad of ['sent', 'rejected', '', null, 7]) {
    assert.strictEqual((await mark({ requestId: reviewed.id, decision: bad }, admin)).status, 400, `${JSON.stringify(bad)} is not an outcome staff can set`);
  }
  assert.strictEqual((await mark({ requestId: reviewed.id, decision: 'approved', note: 'x'.repeat(301) }, admin)).status, 400, 'the note is short');
  assert.strictEqual((await mark({ requestId: reviewed.id, decision: 'approved', note: { text: 'no' } }, admin)).status, 400);
  assert.strictEqual((await mark({ requestId: betaRequest.id, decision: 'approved' }, assignedCsm)).status, 404);
  const unresponsiveRow = rows().find((r) => r.type === 'unresponsive')!;
  const notReplacement = await mark({ requestId: unresponsiveRow.id, decision: 'approved' }, admin);
  assert.strictEqual(notReplacement.status, 400, 'an unresponsive lead has no outcome to change');
  assert.match(notReplacement.body.error, /Only a Lead Replacement request/);
  assert.strictEqual(unresponsiveRow.decision, 'sent');
  assert.strictEqual(reviewed.decision, 'needs_review', 'a refused change changes nothing');
  assert.strictEqual(audits('lead_request.outcome_changed').length, 0);

  // Not replaceable with a note: the note becomes the reason the client reads.
  const NOTE = 'We called the homeowner: they met you and the roof qualified.';
  let outcome = await mark({ requestId: reviewed.id, decision: 'not_replaceable', note: `  ${NOTE}  ` }, assignedCsm);
  assert.strictEqual(outcome.status, 200);
  assert.strictEqual(outcome.body.changed, true);
  assert.strictEqual(reviewed.decision, 'not_replaceable');
  assert.strictEqual(reviewed.decision_reason, NOTE);
  assert.strictEqual(reviewed.status, 'open', 'changing the outcome does not mark the request done');
  audit = audits('lead_request.outcome_changed')[0];
  assert.strictEqual(audit.actor_email, 'csm@motionz.ai');
  assert.strictEqual(audit.tenant_id, tenant.id);
  assert.strictEqual(audit.resource_id, reviewed.id);
  assert.deepStrictEqual(audit.details, { decision: 'not_replaceable', previous: 'needs_review', note: NOTE, type: 'replacement', leadName: 'Odd Olga' });
  // The client sees the new outcome and reason under "Your requests".
  const seen = (await list(owner, clientId, '?limit=50')).body.requests.find((r: any) => r.id === reviewed.id);
  assert.strictEqual(seen.decision, 'not_replaceable');
  assert.strictEqual(seen.decision_reason, NOTE);
  assert.strictEqual((await staffList(admin)).body.requests.find((r: any) => r.id === reviewed.id).decision, 'not_replaceable');

  // The same outcome and note again changes nothing and is not logged twice.
  outcome = await mark({ requestId: reviewed.id, decision: 'not_replaceable', note: NOTE }, admin);
  assert.strictEqual(outcome.body.changed, false);
  assert.strictEqual(audits('lead_request.outcome_changed').length, 1);

  // Without a note the standard sentence for that outcome is used.
  outcome = await mark({ requestId: reviewed.id, decision: 'not_replaceable' }, admin);
  assert.strictEqual(reviewed.decision_reason, NOT_REPLACEABLE_TEXT);
  assert.strictEqual(NOT_REPLACEABLE_TEXT, 'Our team looked at this request. It does not match the replacement rules.');
  outcome = await mark({ requestId: reviewed.id, decision: 'approved', note: '   ' }, admin);
  assert.strictEqual(reviewed.decision, 'approved');
  assert.strictEqual(reviewed.decision_reason, APPROVED_TEXT);
  outcome = await mark({ requestId: reviewed.id, decision: 'needs_review' }, admin);
  assert.strictEqual(reviewed.decision, 'needs_review');
  assert.strictEqual(reviewed.decision_reason, NEEDS_REVIEW_TEXT);
  assert.strictEqual(audits('lead_request.outcome_changed').length, 4);
  assert.strictEqual(audits('lead_request.outcome_changed')[0].details?.note, undefined, 'no note, nothing recorded as one');
  console.log(' PASS: staff can change the outcome of a replacement request with an optional note; the client sees it; it is audited.');

  // ---- 13. Admin dashboard: lead requests to handle ------------------------------------------
  const dash = await (await dashboardGet(request('/api/admin/dashboard', 'GET', admin))).json();
  const openNow = store.leadRequests.filter((r) => r.status === 'open');
  assert.strictEqual(dash.leadRequests.open, openNow.length);
  assert.deepStrictEqual(
    dash.leadRequests.clients.map((c: any) => [c.id, c.open]).sort(),
    [[tenant.id, rows().filter((r) => r.status === 'open').length], [otherTenant.id, 1]].sort()
  );
  assert.strictEqual(dash.leadRequests.clients.find((c: any) => c.id === tenant.id).name, tenant.name);
  for (const r of rows()) r.status = 'done';
  const dashAfter = await (await dashboardGet(request('/api/admin/dashboard', 'GET', admin))).json();
  assert.deepStrictEqual(dashAfter.leadRequests.clients.map((c: any) => c.id), [otherTenant.id], 'a client with nothing open drops off the card');
  console.log(' PASS: the admin dashboard counts open lead requests per client.');

  // ---- 14. The automation link: settings API -------------------------------------------------
  const getAutomation = async (session?: string) => {
    const r = await automationGet(request('/api/admin/settings/automation', 'GET', session));
    return { status: r.status, body: await r.json() };
  };
  const putAutomation = async (url: unknown, session: string | null = admin) => {
    const r = await automationPut(request('/api/admin/settings/automation', 'PUT', session ?? undefined, { lead_request_webhook_url: url }));
    return { status: r.status, body: await r.json() };
  };
  const savedAutomation = () => store.appSettings.find((s) => s.key === 'automation');

  assert.deepStrictEqual((await getAutomation(admin)).body.automation, { lead_request_webhook_url: '' }, 'off by default');
  assert.strictEqual((await getAutomation()).status, 401);
  for (const session of [assignedCsm, owner, member]) {
    assert.strictEqual((await getAutomation(session)).status, 403);
    assert.strictEqual((await putAutomation(HOOK, session)).status, 403);
  }
  assert.strictEqual((await putAutomation(HOOK, null)).status, 401);

  const refusedLinks: unknown[] = [
    'http://services.leadconnectorhq.com/hooks/abc', // not https
    'https://localhost/hook',
    'https://localhost:8443/hook',
    'https://LOCALHOST/hook',
    'https://app.localhost/hook',
    'https://127.0.0.1/hook',
    'https://10.0.0.5/hook',
    'https://192.168.1.10:8080/hook',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/hook',
    'https://[fd00::1]/hook',
    'https://2130706433/hook', // 127.0.0.1 written as one number
    'https://0x7f.0.0.1/hook',
    'https://intranet/hook',
    'https://printer.local/hook',
    'https://db.internal/hook',
    'https://user:secret@hooks.example.org/x',
    'ftp://hooks.example.org/x',
    'javascript:alert(1)',
    'not a link',
    `https://hooks.example.org/${'x'.repeat(500)}`,
    12345,
    { url: HOOK },
  ];
  for (const link of refusedLinks) {
    const refused = await putAutomation(link);
    assert.strictEqual(refused.status, 400, `${JSON.stringify(link)} is refused`);
    assert.strictEqual(refused.body.field, 'lead_request_webhook_url');
    assert.ok(typeof link !== 'string' || !checkWebhookUrl(link).ok);
  }
  assert.strictEqual(savedAutomation(), undefined, 'a refused link is never saved');
  assert.strictEqual(audits('settings.automation_updated').length, 0);

  let put = await putAutomation(`  ${HOOK}  `);
  assert.strictEqual(put.status, 200);
  assert.strictEqual(put.body.automation.lead_request_webhook_url, HOOK);
  assert.strictEqual(put.body.changed, true);
  assert.deepStrictEqual(savedAutomation()!.value, { lead_request_webhook_url: HOOK });
  assert.strictEqual(savedAutomation()!.updated_by, 'admin@motionz.ai');
  assert.deepStrictEqual((await getAutomation(admin)).body.automation, { lead_request_webhook_url: HOOK });
  audit = audits('settings.automation_updated')[0];
  assert.strictEqual(audit.actor_email, 'admin@motionz.ai');
  assert.ok(!JSON.stringify(audit.details).includes('webhook-trigger'), 'the audit entry names the host, not the secret link');
  assert.ok(JSON.stringify(audit.details).includes('services.leadconnectorhq.com'));
  put = await putAutomation(HOOK);
  assert.strictEqual(put.body.changed, false);
  assert.strictEqual(audits('settings.automation_updated').length, 1, 'saving the same link again is not logged twice');
  console.log(' PASS: only admins can set the automation link; http, localhost, IP and private addresses are refused.');

  // ---- 15. The automation link: called with the payload --------------------------------------
  sent = await captured(() => post(replacement({ leadId: robert.id, leadName: 'Robert Johnson', leadPhone: robert.phone, reason: 'outside_service_area' }), owner));
  assert.strictEqual(sent.result.status, 200);
  assert.strictEqual(sent.hooks.length, 1, 'the link is called once');
  assert.strictEqual(sent.hooks[0].url, HOOK);
  assert.strictEqual(sent.hooks[0].init.method, 'POST');
  assert.strictEqual(sent.hooks[0].init.redirect, 'error', 'redirects are never followed');
  assert.ok(sent.hooks[0].init.signal, 'the call has a time limit');
  const hookRow = rows()[0];
  assert.deepStrictEqual(sent.hooks[0].body, {
    type: 'replacement',
    decision: 'approved',
    decision_reason: APPROVED_TEXT,
    lead: { name: 'Robert Johnson', phone: robert.phone, ghl_contact_id: 'cnt_101' },
    details: hookRow.details,
    client: { id: tenant.id, name: tenant.name, ghl_location_id: tenant.ghl_location_id || null },
    submitted_by_email: 'john@abcroofing.com',
    submitted_at: hookRow.created_at,
  });
  assert.strictEqual(audits('lead_request.submitted')[0].details?.webhook, 'sent');
  assert.strictEqual(audits('lead_request.webhook_failed').length, 0);

  // A typed-in lead has no GoHighLevel contact id; an unresponsive lead is sent too.
  sent = await captured(() => post(unresponsive({ leadName: 'Typed Tina' }), owner));
  assert.deepStrictEqual(sent.hooks[0].body.lead, { name: 'Typed Tina', phone: '(555) 303-4040' });
  assert.strictEqual(sent.hooks[0].body.type, 'unresponsive');
  assert.strictEqual(sent.hooks[0].body.decision, 'sent');

  // Refused and duplicate submissions are not sent.
  sent = await captured(() => post(unresponsive({ leadName: 'Too Early', daysSinceSent: 2 }), owner));
  assert.strictEqual(sent.hooks.length, 0);
  sent = await captured(() => post(unresponsive({ leadName: 'Typed Tina' }), owner));
  assert.strictEqual(sent.result.body.duplicate, true);
  assert.strictEqual(sent.hooks.length, 0);
  console.log(' PASS: with a link set, every saved submission is posted to it with the agreed payload.');

  // ---- 16. The automation link: failures never fail the request ------------------------------
  const failures: [string, () => Promise<Response> | Response, RegExp][] = [
    ['an error status', () => new Response('nope', { status: 500 }), /status 500/],
    ['a network error', () => { throw new TypeError('fetch failed'); }, /could not be reached/],
    ['a timeout', () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }, /within 5 seconds/],
  ];
  for (const [what, hook, reason] of failures) {
    const name = `Hook ${what}`;
    const failedBefore = audits('lead_request.webhook_failed').length;
    sent = await captured(() => post(replacement({ leadName: name }), owner), hook);
    assert.strictEqual(sent.result.status, 200, `${what} does not fail the client's request`);
    assert.strictEqual(sent.result.body.success, true);
    assert.strictEqual(rows()[0].lead_name, name, 'the request is saved');
    assert.ok(sent.emails.length > 0, 'and still emailed');
    assert.strictEqual(audits('lead_request.webhook_failed').length, failedBefore + 1);
    const failed = audits('lead_request.webhook_failed')[0];
    assert.strictEqual(failed.resource_id, rows()[0].id);
    assert.strictEqual(failed.tenant_id, tenant.id);
    assert.match(failed.details?.reason, reason);
    assert.ok(!JSON.stringify(failed.details).includes('webhook-trigger'), 'the link itself is not written to the log');
    assert.strictEqual(audits('lead_request.submitted')[0].details?.webhook, 'failed');
  }

  // A link that got into the setting some other way is checked again before anything is sent.
  savedAutomation()!.value = { lead_request_webhook_url: 'https://169.254.169.254/latest/meta-data/' };
  sent = await captured(() => post(replacement({ leadName: 'Bad Stored Link' }), owner));
  assert.strictEqual(sent.result.status, 200);
  assert.strictEqual(sent.hooks.length, 0, 'a private address is never called');
  assert.match(audits('lead_request.webhook_failed')[0].details?.reason, /not a public https link/);

  // Emptying the link switches the automation off.
  put = await putAutomation('');
  assert.strictEqual(put.status, 200);
  assert.strictEqual(put.body.automation.lead_request_webhook_url, '');
  const failedCount = audits('lead_request.webhook_failed').length;
  sent = await captured(() => post(replacement({ leadName: 'Link Off' }), owner));
  assert.strictEqual(sent.hooks.length, 0, 'nothing is called when the link is empty');
  assert.strictEqual(audits('lead_request.webhook_failed').length, failedCount);
  assert.strictEqual(audits('lead_request.submitted')[0].details?.webhook, 'off');
  console.log(' PASS: a failing, slow or unsafe automation link is logged and never fails the request; empty means off.');

  // ---- 16b. Slack: the link checks and the masked link ----------------------------------------
  const refusedSlack: unknown[] = [
    'http://hooks.slack.com/services/T0/B0/x', // not https
    'https://example.com/services/T0/B0/x', // not Slack
    'https://hooks.slack.com.evil.example/services/T0/B0/x',
    'https://evil.example/hooks.slack.com/services/T0/B0/x',
    'https://slack.com/services/T0/B0/x',
    'https://api.slack.com/services/T0/B0/x',
    'https://user:pw@hooks.slack.com/services/T0/B0/x',
    'https://hooks.slack.com:8443/services/T0/B0/x',
    'https://hooks.slack.com/', // no /services/ path
    'https://hooks.slack.com/services/',
    'https://hooks.slack.com/workflows/T0/B0/x',
    'https://localhost/services/T0/B0/x',
    'https://127.0.0.1/services/T0/B0/x',
    `https://hooks.slack.com/services/${'x'.repeat(300)}`, // over 300 characters
    'not a link',
    12345,
    { url: SLACK },
  ];
  for (const link of refusedSlack) assert.strictEqual(checkSlackWebhookUrl(link).ok, false, `${JSON.stringify(link)} is not a Slack link`);
  assert.deepStrictEqual(checkSlackWebhookUrl(`  ${SLACK}  `), { ok: true, url: SLACK });
  assert.deepStrictEqual(checkSlackWebhookUrl('https://HOOKS.SLACK.COM/services/T0/B0/x'), { ok: true, url: 'https://hooks.slack.com/services/T0/B0/x' });
  assert.deepStrictEqual(checkSlackWebhookUrl(''), { ok: true, url: '' }, 'empty means off');
  assert.deepStrictEqual(checkSlackWebhookUrl(undefined), { ok: true, url: '' });
  assert.strictEqual(checkSlackWebhookUrl(SLACK_MASK).ok, false, 'the masked link is never accepted as a link');

  assert.strictEqual(maskSlackWebhookUrl(SLACK), SLACK_MASK);
  assert.strictEqual(maskSlackWebhookUrl(''), '');
  assert.strictEqual(maskSlackWebhookUrl(undefined), '');
  assert.ok(!maskSlackWebhookUrl(SLACK).includes('notARealSlackSecretValue') && !maskSlackWebhookUrl(SLACK).includes('0TESTTEAM'));
  assert.strictEqual(maskSlackWebhookUrl('garbage'), SLACK_MASK, 'whatever is stored, nothing of it leaks through the mask');

  const getSlack = async (session?: string) => {
    const r = await slackGet(request('/api/admin/settings/slack', 'GET', session));
    return { status: r.status, body: await r.json() };
  };
  const putSlack = async (url: unknown, session: string | null = admin) => {
    const r = await slackPut(request('/api/admin/settings/slack', 'PUT', session ?? undefined, { lead_request_slack_webhook_url: url }));
    return { status: r.status, body: await r.json() };
  };
  const testSlack = async (session?: string) => {
    const r = await slackTest(request('/api/admin/settings/slack/test', 'POST', session));
    return { status: r.status, body: await r.json() };
  };
  const savedSlack = () => store.appSettings.find((s) => s.key === 'slack');

  assert.deepStrictEqual((await getSlack(admin)).body.slack, { configured: false, lead_request_slack_webhook_url: '' }, 'off by default');
  assert.strictEqual((await getSlack()).status, 401);
  assert.strictEqual((await putSlack(SLACK, null)).status, 401);
  assert.strictEqual((await testSlack()).status, 401);
  for (const session of [assignedCsm, owner, member]) {
    assert.strictEqual((await getSlack(session)).status, 403);
    assert.strictEqual((await putSlack(SLACK, session)).status, 403);
    assert.strictEqual((await testSlack(session)).status, 403);
  }
  for (const link of refusedSlack) {
    const refused = await putSlack(link);
    assert.strictEqual(refused.status, 400, `${JSON.stringify(link)} is refused`);
    assert.strictEqual(refused.body.field, 'lead_request_slack_webhook_url');
  }
  assert.match((await putSlack('http://hooks.slack.com/services/T0/B0/x')).body.error, /https/);
  assert.match((await putSlack('https://example.com/services/T0/B0/x')).body.error, /not a Slack webhook link/);
  assert.strictEqual(savedSlack(), undefined, 'a refused link is never saved');
  assert.strictEqual(audits('settings.slack_updated').length, 0);

  // With nothing saved there is nothing to test.
  let slackTestRun = await captured(() => testSlack(admin));
  assert.strictEqual(slackTestRun.result.status, 400);
  assert.match(slackTestRun.result.body.error, /Save a Slack webhook link first/);
  assert.strictEqual(slackTestRun.hooks.length, 0);

  let slackPutRes = await putSlack(`  ${SLACK}  `);
  assert.strictEqual(slackPutRes.status, 200);
  assert.strictEqual(slackPutRes.body.changed, true);
  assert.deepStrictEqual(slackPutRes.body.slack, { configured: true, lead_request_slack_webhook_url: SLACK_MASK });
  assert.ok(!JSON.stringify(slackPutRes.body).includes('notARealSlackSecretValue'), 'the saved link is never sent back to the browser');
  assert.deepStrictEqual(savedSlack()!.value, { lead_request_slack_webhook_url: SLACK });
  assert.strictEqual(savedSlack()!.updated_by, 'admin@motionz.ai');
  const slackRead = await getSlack(admin);
  assert.deepStrictEqual(slackRead.body.slack, { configured: true, lead_request_slack_webhook_url: SLACK_MASK });
  assert.ok(!JSON.stringify(slackRead.body).includes('notARealSlackSecretValue'));
  audit = audits('settings.slack_updated')[0];
  assert.strictEqual(audit.actor_email, 'admin@motionz.ai');
  assert.deepStrictEqual(audit.details, { lead_request_slack: 'Set', previous: 'Off' });
  assert.ok(!JSON.stringify(audit).includes('notARealSlackSecretValue'), 'the link is not written to the audit log');

  // Saving the page again with the masked link it was given keeps the stored link.
  slackPutRes = await putSlack(SLACK_MASK);
  assert.strictEqual(slackPutRes.status, 200);
  assert.strictEqual(slackPutRes.body.changed, false);
  assert.deepStrictEqual(slackPutRes.body.slack, { configured: true, lead_request_slack_webhook_url: SLACK_MASK });
  assert.deepStrictEqual(savedSlack()!.value, { lead_request_slack_webhook_url: SLACK }, 'the masked link never overwrites the real one');
  slackPutRes = await putSlack(SLACK);
  assert.strictEqual(slackPutRes.body.changed, false, 'the same link again is not a change');
  assert.strictEqual(audits('settings.slack_updated').length, 1);
  // The automation setting is a different setting and never carries the Slack link.
  assert.ok(!JSON.stringify((await getAutomation(admin)).body).includes('hooks.slack.com'));
  console.log(' PASS: only a https://hooks.slack.com/services/ link is accepted; the browser only ever gets the masked link.');

  // ---- 16c. Slack: the message for both forms ------------------------------------------------
  const TRICKY = 'Homeowner said <!channel> "not interested" & hung up -> see <https://evil.example|this>. It was cancelled twice.';
  sent = await captured(() =>
    post(replacement({ leadName: 'Jane <Doe> & Co', leadPhone: '+1 555 234 5678', reason: 'wrong_contact_info', whatHappened: TRICKY }), owner)
  );
  assert.strictEqual(sent.result.status, 200);
  assert.strictEqual(sent.hooks.length, 1, 'Slack is called once (the automation link is off)');
  assert.strictEqual(sent.hooks[0].url, SLACK);
  assert.strictEqual(sent.hooks[0].init.method, 'POST');
  assert.strictEqual(sent.hooks[0].init.redirect, 'error', 'redirects are never followed');
  assert.ok(sent.hooks[0].init.signal, 'the call has a time limit');
  assert.deepStrictEqual(Object.keys(sent.hooks[0].body), ['text']);
  assert.strictEqual(
    sent.hooks[0].body.text,
    [
      '*Lead replacement request — Approved*',
      `Client: ${tenant.name}`,
      'Lead: Jane &lt;Doe&gt; &amp; Co · +1 555 234 5678',
      'Reason: Wrong contact information',
      'Appointment: No, an appointment was never booked',
      'What happened: Homeowner said &lt;!channel&gt; "not interested" &amp; hung up -&gt; see &lt;https://evil.example|this&gt;. It was cancelled twice.',
      'Submitted by: john@abcroofing.com',
      `${BASE_URL}/admin/clients/${tenant.id}`,
    ].join('\n')
  );
  assert.ok(!/<[!@#h]/.test(sent.hooks[0].body.text), 'nothing a client typed can become a mention or a link');
  assert.strictEqual(audits('lead_request.slack_failed').length, 0, 'a message that went through writes nothing extra');
  assert.deepStrictEqual(Object.keys(audits('lead_request.submitted')[0].details || {}).sort(), ['decision', 'leadName', 'notified', 'type', 'webhook']);

  sent = await captured(() => post(replacement({ leadName: 'Review Rita', reason: 'other' }), owner));
  assert.ok(sent.hooks[0].body.text.startsWith('*Lead replacement request — Needs review*\n'), 'the heading says the outcome');
  assert.ok(sent.hooks[0].body.text.includes('Reason: Other'));

  sent = await captured(() => post(unresponsive({ leadName: 'Silent Sam', daysSinceSent: 6 }), member));
  assert.strictEqual(
    sent.hooks[0].body.text,
    [
      '*Unresponsive lead*',
      `Client: ${tenant.name}`,
      'Lead: Silent Sam · (555) 303-4040',
      'Days since the lead was sent: 6',
      `How they tried to reach them: ${ATTEMPTS}`,
      'Submitted by: sarah@abcroofing.com',
      `${BASE_URL}/admin/clients/${tenant.id}`,
    ].join('\n')
  );

  // Long answers are cut to 500 characters; the rest is in the portal and the email.
  sent = await captured(() => post(replacement({ leadName: 'Long Larry', whatHappened: 'y'.repeat(1200) }), owner));
  assert.ok(sent.hooks[0].body.text.includes(`What happened: ${'y'.repeat(500)}…\n`));
  assert.ok(!sent.hooks[0].body.text.includes('y'.repeat(501)));

  // The message builder on its own: a client name with control characters, a missing submitter, an old row.
  const builtText = leadRequestSlackText(
    {
      type: 'replacement', lead_name: 'Old Row', lead_phone: '555', decision: 'not_replaceable', submitter_email: null,
      details: { reason: 'inspected_no_sale', reason_label: "I inspected the roof and they didn't buy", appointment: 'inspected', what_happened: 'Before the new options.' },
    },
    'A & B <Roofing>',
    'https://portal.example/admin/clients/1'
  );
  assert.ok(builtText.startsWith('*Lead replacement request — Not replaceable*\nClient: A &amp; B &lt;Roofing&gt;\n'));
  assert.ok(builtText.includes("Reason: I inspected the roof and they didn't buy\nAppointment: Yes, and I inspected the roof\n"));
  assert.ok(builtText.endsWith('Submitted by: unknown\nhttps://portal.example/admin/clients/1'));
  assert.strictEqual(escapeSlack('a < b && c > d'), 'a &lt; b &amp;&amp; c &gt; d');

  // Refused and duplicate submissions are not posted.
  sent = await captured(() => post(unresponsive({ leadName: 'Too Early For Slack', daysSinceSent: 1 }), owner));
  assert.strictEqual(sent.hooks.length, 0, 'a refused form is not posted');
  sent = await captured(() => post(unresponsive({ leadName: 'Silent Sam', daysSinceSent: 6 }), member));
  assert.strictEqual(sent.result.body.duplicate, true);
  assert.strictEqual(sent.hooks.length, 0, 'a duplicate that was ignored is not posted');

  // With the automation link set as well, each gets its own call.
  await putAutomation(HOOK);
  sent = await captured(() => post(replacement({ leadName: 'Both Links' }), owner));
  assert.deepStrictEqual(sent.hooks.map((h) => h.url).sort(), [SLACK, HOOK].sort());
  await putAutomation('');
  console.log(' PASS: with a Slack link set, both forms post a complete, escaped message; duplicates and refusals do not.');

  // ---- 16d. Slack: failures never fail the request -------------------------------------------
  const slackFailures: [string, () => Promise<Response> | Response, RegExp][] = [
    ["Slack's own error", () => new Response('channel_not_found', { status: 404 }), /Slack answered with an error \(404: channel_not_found\)/],
    ['a server error', () => new Response('', { status: 500 }), /Slack answered with an error \(500\)/],
    ['a network error', () => { throw new TypeError('fetch failed'); }, /could not be reached/],
    ['a timeout', () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }, /within 5 seconds/],
  ];
  for (const [what, hook, reason] of slackFailures) {
    const name = `Slack ${what}`;
    const failedBefore = audits('lead_request.slack_failed').length;
    sent = await captured(() => post(replacement({ leadName: name }), owner), hook);
    assert.strictEqual(sent.result.status, 200, `${what} does not fail the client's request`);
    assert.strictEqual(sent.result.body.success, true);
    assert.strictEqual(rows()[0].lead_name, name, 'the request is saved');
    assert.ok(sent.emails.length > 0, 'and still emailed');
    assert.strictEqual(audits('lead_request.slack_failed').length, failedBefore + 1);
    const failed = audits('lead_request.slack_failed')[0];
    assert.strictEqual(failed.resource_id, rows()[0].id);
    assert.strictEqual(failed.tenant_id, tenant.id);
    assert.match(failed.details?.reason, reason);
    assert.ok(!JSON.stringify(failed.details).includes('notARealSlackSecretValue'), 'the link itself is not written to the log');
  }

  // A link that got into the setting some other way is checked again before anything is sent.
  savedSlack()!.value = { lead_request_slack_webhook_url: 'https://169.254.169.254/services/T0/B0/x' };
  sent = await captured(() => post(replacement({ leadName: 'Bad Stored Slack' }), owner));
  assert.strictEqual(sent.result.status, 200);
  assert.strictEqual(sent.hooks.length, 0, 'anything that is not Slack is never called');
  assert.match(audits('lead_request.slack_failed')[0].details?.reason, /not a Slack webhook link/);
  savedSlack()!.value = { lead_request_slack_webhook_url: SLACK };
  console.log(' PASS: a failing, slow or wrong Slack link is logged and never fails the request.');

  // ---- 16e. Slack: "Send a test message" and Remove ------------------------------------------
  slackTestRun = await captured(() => testSlack(admin));
  assert.strictEqual(slackTestRun.result.status, 200);
  assert.deepStrictEqual(slackTestRun.result.body, { success: true });
  assert.strictEqual(slackTestRun.hooks.length, 1);
  assert.strictEqual(slackTestRun.hooks[0].url, SLACK);
  assert.deepStrictEqual(slackTestRun.hooks[0].body, { text: 'Test message from the Motionz portal' });

  slackTestRun = await captured(() => testSlack(admin), () => new Response('no_service', { status: 404 }));
  assert.strictEqual(slackTestRun.result.status, 502);
  assert.match(slackTestRun.result.body.error, /Slack answered with an error \(404: no_service\)/, "Slack's own answer is shown");
  slackTestRun = await captured(() => testSlack(admin), () => { throw new TypeError('fetch failed'); });
  assert.strictEqual(slackTestRun.result.status, 502);
  assert.match(slackTestRun.result.body.error, /could not be reached/);
  assert.ok(!JSON.stringify(slackTestRun.result.body).includes('notARealSlackSecretValue'));

  // Remove: an empty value clears the link, and nothing is posted any more.
  slackPutRes = await putSlack('');
  assert.strictEqual(slackPutRes.status, 200);
  assert.strictEqual(slackPutRes.body.changed, true);
  assert.deepStrictEqual(slackPutRes.body.slack, { configured: false, lead_request_slack_webhook_url: '' });
  assert.deepStrictEqual(savedSlack()!.value, { lead_request_slack_webhook_url: '' });
  assert.deepStrictEqual(audits('settings.slack_updated')[0].details, { lead_request_slack: 'Off', previous: 'Set' });
  const slackFailedCount = audits('lead_request.slack_failed').length;
  sent = await captured(() => post(replacement({ leadName: 'Slack Off' }), owner));
  assert.strictEqual(sent.result.status, 200);
  assert.strictEqual(sent.hooks.length, 0, 'nothing is posted when no Slack link is set');
  assert.strictEqual(audits('lead_request.slack_failed').length, slackFailedCount);
  // With nothing saved, the masked link is refused like any other text that is not a real link.
  const maskWithNothingSaved = await putSlack(SLACK_MASK);
  assert.strictEqual(maskWithNothingSaved.status, 400);
  assert.match(maskWithNothingSaved.body.error, /hidden version/);
  assert.deepStrictEqual(savedSlack()!.value, { lead_request_slack_webhook_url: '' });
  console.log(' PASS: the test message reports success or Slack\'s error; Remove switches Slack messages off.');

  // ---- 17. The rate limit: 30 an hour per person ---------------------------------------------
  globalRateLimiter.reset();
  for (let i = 1; i <= 30; i++) {
    const ok = await post(unresponsive({ leadName: `Burst ${i}` }), owner, { keepRateLimit: true });
    assert.strictEqual(ok.status, 200, `request ${i} of 30 is accepted`);
  }
  const limited = await post(unresponsive({ leadName: 'Burst 31' }), owner, { keepRateLimit: true });
  assert.strictEqual(limited.status, 429);
  assert.strictEqual(limited.body.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  assert.ok(!rows().some((r) => r.lead_name === 'Burst 31'));
  assert.strictEqual((await post(unresponsive({ leadName: 'Colleague' }), member, { keepRateLimit: true })).status, 200, 'the limit is per person');
  globalRateLimiter.reset();
  console.log(' PASS: a 31st request within an hour is refused with 429.');

  // ---- 18. The email template and the audit labels -------------------------------------------
  const template = leadRequestEmail({
    to: 'leads@motionz.ai', type: 'replacement', companyName: 'A & B <Roofing>', leadName: '<b>Lead</b>', leadPhone: '555',
    outcome: 'Needs review', outcomeReason: NEEDS_REVIEW_TEXT, fields: [['What happened', '<script>alert(1)</script>'], ['Empty', '']],
    submittedBy: 'john@abcroofing.com', portalUrl: 'https://portal.example/admin/clients/1',
  });
  assert.strictEqual(template.subject, 'Lead replacement request (Needs review): <b>Lead</b> — A & B <Roofing>');
  assert.ok(!template.html.includes('<script>') && template.html.includes('&lt;script&gt;'), 'what the client typed is escaped in the email');
  assert.ok(!template.text.includes('Empty:'), 'unanswered lines are left out');
  assert.strictEqual(auditActionLabel('lead_request.submitted'), 'Lead form sent from the portal');
  assert.strictEqual(auditActionLabel('lead_request.status_changed'), 'Lead request marked done or reopened');
  assert.strictEqual(auditActionLabel('lead_request.webhook_failed'), 'Lead form could not be sent to the automation link');
  assert.strictEqual(auditActionLabel('settings.automation_updated'), 'Automation link updated');
  assert.strictEqual(auditActionLabel('lead_request.outcome_changed'), 'Lead request outcome changed by staff');
  assert.strictEqual(auditActionLabel('lead_request.slack_failed'), 'Lead form could not be posted to Slack');
  assert.strictEqual(auditActionLabel('settings.slack_updated'), 'Slack webhook link updated');
  console.log(' PASS: the email escapes what was typed, and the new audit entries have friendly names.');

  // ---- 19. Before the table exists: a friendly message, never a 500 ---------------------------
  const kept = store.leadRequests;
  // A store without the list stands for "the lead_requests table has not been created yet".
  (store as any).leadRequests = undefined;
  try {
    const unavailable = await captured(() => post(replacement({ leadName: 'No Table Yet' }), owner));
    assert.strictEqual(unavailable.result.status, 503);
    assert.strictEqual(unavailable.result.body.code, 'FORM_UNAVAILABLE');
    assert.strictEqual(unavailable.result.body.error, 'This form is not available yet. Please tell your CSM.');
    assert.strictEqual(unavailable.result.body.error, FORM_UNAVAILABLE);
    assert.strictEqual(unavailable.emails.length, 0);

    mine = await list(owner);
    assert.strictEqual(mine.status, 200, 'the list loads, empty');
    assert.strictEqual(mine.body.available, false);
    assert.deepStrictEqual(mine.body.requests, []);
    assert.deepStrictEqual(mine.body.submittingAs, { name: 'John Smith', company: tenant.name });

    const staff = await staffList(admin);
    assert.strictEqual(staff.status, 200);
    assert.strictEqual(staff.body.available, false);
    assert.deepStrictEqual(staff.body.requests, []);
    assert.strictEqual((await mark({ requestId: 'anything', status: 'done' }, admin)).status, 503);

    const dashRes = await dashboardGet(request('/api/admin/dashboard', 'GET', admin));
    assert.strictEqual(dashRes.status, 200, 'the dashboard still loads');
    assert.deepStrictEqual((await dashRes.json()).leadRequests, { open: 0, clients: [] });
    await assert.rejects(() => leadRequestRepository.listOpen(), /does not exist yet/);
  } finally {
    store.leadRequests = kept;
  }
  assert.strictEqual((await list(owner)).body.available, true);
  console.log(' PASS: while the table is missing the forms say "not available yet" and staff lists are empty.');

  console.log('--- Lead Replacement and Unresponsive Lead form tests passed ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
