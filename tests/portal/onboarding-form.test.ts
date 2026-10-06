/**
 * The onboarding form built into the portal (replaces the GoHighLevel pop-up):
 *  - the definition holds every question of the original form, with the same required ones
 *  - a valid submission is saved for the client with answers keyed by the question label, is
 *    audit-logged and emails the notification list plus the assigned CSM
 *  - missing or malformed answers and wrong, too large or too many files are refused with 400
 *  - uploaded files can be opened by the client and staff only, never across clients
 *  - sign-in, the Setup Progress section, suspension, duplicates and the rate limit are enforced
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById, createTenant } from '../../src/lib/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';
import { appSettingsRepository, featureToggleRepository, onboardingSubmissionRepository } from '../../src/lib/db/repositories';
import { globalRateLimiter } from '../../src/lib/security/rate-limiter';
import { POST as formPost } from '../../src/app/api/portal/[clientId]/onboarding-form/route';
import { GET as fileGet } from '../../src/app/api/portal/[clientId]/onboarding-files/route';
import { GET as answersGet } from '../../src/app/api/portal/[clientId]/onboarding-answers/route';
import { POST as ghlWebhook } from '../../src/app/api/webhooks/ghl/route';
import {
  ONBOARDING_FORM_SECTIONS,
  ONBOARDING_FORM_FIELDS,
  TEXT_MAX_LENGTH,
  TEXTAREA_MAX_LENGTH,
} from '../../src/lib/onboarding/form-definition';
import { displayAnswers, answersAsText } from '../../src/lib/onboarding/answers';
import { getMockOnboardingFiles, resetMockOnboardingFiles } from '../../src/lib/storage';
import { auditActionLabel } from '../../src/lib/utils/log-labels';

// Tests must never send real email, use real storage or a real webhook secret.
for (const key of [
  'RESEND_API_KEY', 'BREVO_API_KEY', 'MEDIA_BUYER_EMAIL', 'EMAIL_TEST_REDIRECT_TO', 'GHL_WEBHOOK_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
]) {
  delete process.env[key];
}

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const clientId = 'abc-roofing';

type Values = Record<string, string | string[]>;
type Upload = { field: string; name: string; type: string; bytes: Uint8Array };

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0]);
const text = (content: string) => new TextEncoder().encode(content);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A complete, valid set of answers (every required question, plus a few optional ones). */
function validValues(overrides: Values = {}): Values {
  return {
    full_name: 'John Smith',
    dba_business_name: 'ABC Roofing',
    business_email: 'John@ABCRoofing.com',
    current_website: 'https://abcroofing.com',
    personal_phone: '+1 555 234 5678',
    business_phone: '(555) 234-9999',
    city: 'Lafayette',
    country: 'United States',
    sales_process: 'We greet the customer, inspect the roof and treat it.',
    what_makes_you_different: 'No oil-based products.',
    job_duration: 'About four hours.',
    phrases_to_avoid: 'A lifetime roof guarantee',
    pricing_increases: ['Skylights', 'Steep pitch'],
    attraction_offer: 'Extend your roof by up to 15 years.',
    attraction_offer_deliverables: 'Clean, treat, before-and-after photos.',
    taking_deposit: 'Yes',
    appointment_manager_name: 'Maricia at the front desk.',
    appointment_manager_email: 'Her email is maricia@abcroofing.com',
    ...overrides,
  };
}

function formRequest(target: string, values: Values, uploads: Upload[], session?: string, extra: [string, string][] = []): NextRequest {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
  }
  for (const upload of uploads) {
    body.append(upload.field, new File([upload.bytes as BlobPart], upload.name, { type: upload.type }));
  }
  for (const [key, value] of extra) body.append(key, value);
  const headers = new Headers();
  if (session) headers.set('cookie', `${SESSION_COOKIE_NAME}=${session}`);
  return new NextRequest(`${BASE_URL}/api/portal/${target}/onboarding-form`, { method: 'POST', headers, body });
}

async function post(
  values: Values,
  session?: string,
  options: { uploads?: Upload[]; target?: string; keepRateLimit?: boolean; extra?: [string, string][] } = {}
) {
  // The limit of 10 an hour has its own test; everywhere else each request starts fresh.
  if (!options.keepRateLimit) globalRateLimiter.reset();
  const target = options.target || clientId;
  const res = await formPost(formRequest(target, values, options.uploads || [], session, options.extra), { params: { clientId: target } });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function openFile(path: string, session?: string, target: string = clientId) {
  const headers = new Headers();
  if (session) headers.set('cookie', `${SESSION_COOKIE_NAME}=${session}`);
  const res = await fileGet(
    new NextRequest(`${BASE_URL}/api/portal/${target}/onboarding-files?path=${encodeURIComponent(path)}`, { method: 'GET', headers }),
    { params: { clientId: target } }
  );
  return res;
}

/** Captures outgoing provider calls by pretending a Resend key is set and stubbing fetch. */
async function withCapturedEmail<T>(fn: () => Promise<T>): Promise<{ result: T; recipients: string[]; bodies: string[] }> {
  const sent: any[] = [];
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key-not-real';
  globalThis.fetch = (async (url: any, init?: any) => {
    sent.push({ url: String(url), body: JSON.parse(init?.body || '{}') });
    return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await fn();
    return {
      result,
      recipients: sent.flatMap((s) => s.body.to as string[]).sort(),
      bodies: sent.map((s) => `${s.body.subject}\n${s.body.text || ''}\n${s.body.html || ''}`),
    };
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
}

async function run() {
  console.log('--- Portal onboarding form tests ---');
  resetStore();
  resetMockOnboardingFiles();
  globalRateLimiter.reset();

  const tenant = (await getTenantById(clientId))!;
  assert(tenant, 'demo tenant must exist');
  const store = getStore();
  const rows = () => store.onboardingSubmissions.filter((s) => s.tenant_id === tenant.id);
  const owner = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant.id);
  const member = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenant.id);
  const admin = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const assignedCsm = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const otherCsm = createSessionToken('user-csm-2', 'csm.agent@motionz.ai', 'csm');
  const otherTenant = await createTenant({ name: 'Beta Roofing', slug: 'beta-roofing', primary_email: 'owner@betaroofing.com' });
  const outsider = createSessionToken('user-outsider', 'owner@betaroofing.com', 'client', otherTenant.id);

  // ---- 1. The definition ---------------------------------------------------------------------
  assert.deepStrictEqual(
    ONBOARDING_FORM_SECTIONS.map((s) => s.title),
    ['Business details', 'Marketing', 'Website', 'Offer to advertise', 'Sales refinement']
  );
  assert.ok(ONBOARDING_FORM_SECTIONS.every((s) => s.description.length > 10), 'every section has its sub-line');
  // The GoHighLevel form has 31 questions (headings and the submit button not counted), plus the portal's video-links question.
  assert.strictEqual(ONBOARDING_FORM_FIELDS.length, 32);
  assert.deepStrictEqual(
    ONBOARDING_FORM_SECTIONS.map((s) => s.fields.length),
    [11, 6, 9, 2, 4]
  );
  assert.deepStrictEqual(
    ONBOARDING_FORM_FIELDS.filter((f) => f.required).map((f) => f.label),
    [
      'DBA Business Name',
      'Business Email',
      'Current Website',
      'Personal Phone Number (For Communication)',
      'Business Phone',
      'What is the process from coming to their house and signing a contract and how do you handle the fulfillment side as well?',
      'What makes your Rejuvenation Business different from the others?',
      "How long does a typical Rejuvenation Job usually take from start to finish, including inspection, treatment, and completion and what's the process?",
      'What are the phrases we should ABSOLUTELY avoid mentioning?',
      'Roof Rejuvenation Attraction Offer',
      'Attraction Offer Deliverables',
      'Appointment Manager Name / Front Desk Representative Name',
      'Appointment Manager Email / Front Desk Email',
    ]
  );
  const labels = ONBOARDING_FORM_FIELDS.map((f) => f.label);
  for (const label of [
    'Full Name', 'Street Address', 'City', 'State', 'Country', 'Postal Code',
    'Upload Useful Video / Materials for Marketing',
    "What is the maximum distance you're willing to travel for a job?",
    'What is the ideal project size?',
    'What is your ideal client profile?',
    'Do you want to target residential (Homeowners), Commercial (Real Estate Agent) Industrial (Entrepreneurs)',
    'How much do you charge per square foot? (For the website)',
    'What is the average ticket value of your roof replacement jobs?',
    'Which of these increase your pricing?',
    'What financing providers do you use (If not use N/A) ?',
    'Which cities or zip/postal codes do you serve?',
    'Are you taking a deposit?',
    'Upload A List Of Old Leads to Reactivate',
  ]) {
    assert.ok(labels.includes(label), `the form asks "${label}"`);
  }
  assert.ok(!labels.some((l) => /Personnal|wanna/.test(l)), 'the two typos are fixed');
  assert.strictEqual(new Set(labels).size, labels.length, 'no two questions share a label');
  const keys = ONBOARDING_FORM_FIELDS.map((f) => f.key);
  assert.strictEqual(new Set(keys).size, keys.length, 'no two questions share a key');
  assert.ok(keys.every((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(k)), 'keys are snake_case');
  const byKey = Object.fromEntries(ONBOARDING_FORM_FIELDS.map((f) => [f.key, f]));
  assert.deepStrictEqual(byKey.pricing_increases.options, [
    'Steep pitch', 'Multiple valleys', 'Skylights', 'Chimneys', 'Solar panels', 'Difficult access', 'Multiple layers of shingles',
  ]);
  assert.deepStrictEqual(byKey.taking_deposit.options, ['Yes', 'No']);
  assert.deepStrictEqual(byKey.country.options!.slice(0, 2), ['United States', 'Canada']);
  assert.strictEqual(byKey.country.defaultValue, 'United States');
  assert.deepStrictEqual(ONBOARDING_FORM_FIELDS.filter((f) => f.type === 'file').map((f) => f.key), ['marketing_materials', 'old_leads_list']);
  assert.ok(ONBOARDING_FORM_FIELDS.filter((f) => f.type === 'file').every((f) => /For videos and other large files, paste a link in the next question\./.test(f.help || '')));
  assert.ok(ONBOARDING_FORM_FIELDS.filter((f) => f.type === 'text').every((f) => f.maxLength === TEXT_MAX_LENGTH && TEXT_MAX_LENGTH === 300));
  assert.ok(ONBOARDING_FORM_FIELDS.filter((f) => f.type === 'textarea').every((f) => f.maxLength === TEXTAREA_MAX_LENGTH && TEXTAREA_MAX_LENGTH === 5000));
  console.log(' PASS: the definition has all 32 questions in 5 sections, with the 13 required ones.');

  // ---- 2. A valid submission -----------------------------------------------------------------
  await appSettingsRepository.set('notifications', { onboarding_form_recipients: ['buyer@motionz.ai', 'ops@motionz.ai'], notify_assigned_csm: true }, 'test');
  const first = await withCapturedEmail(() => post(validValues(), owner));
  assert.strictEqual(first.result.status, 200, JSON.stringify(first.result.body));
  assert.strictEqual(first.result.body.success, true);
  assert.strictEqual(first.result.body.message, 'Thanks — your answers were sent to your Motionz team.');
  assert.strictEqual(rows().length, 1);
  const saved = rows()[0];
  assert.strictEqual(saved.id, first.result.body.submissionId);
  assert.strictEqual(saved.tenant_id, tenant.id);
  assert.strictEqual(saved.submitter_email, 'john@abcroofing.com', 'the signed-in person is the submitter');
  assert.ok(saved.ghl_contact_id === undefined || saved.ghl_contact_id === null, 'there is no GoHighLevel contact');
  assert.deepStrictEqual(saved.answers, {
    'Full Name': 'John Smith',
    'DBA Business Name': 'ABC Roofing',
    'Business Email': 'john@abcroofing.com',
    'Current Website': 'https://abcroofing.com',
    'Personal Phone Number (For Communication)': '+1 555 234 5678',
    'Business Phone': '(555) 234-9999',
    City: 'Lafayette',
    Country: 'United States',
    'What is the process from coming to their house and signing a contract and how do you handle the fulfillment side as well?':
      'We greet the customer, inspect the roof and treat it.',
    'What makes your Rejuvenation Business different from the others?': 'No oil-based products.',
    "How long does a typical Rejuvenation Job usually take from start to finish, including inspection, treatment, and completion and what's the process?":
      'About four hours.',
    'What are the phrases we should ABSOLUTELY avoid mentioning?': 'A lifetime roof guarantee',
    // Ticked choices are joined in the order the form lists them.
    'Which of these increase your pricing?': 'Steep pitch, Skylights',
    'Roof Rejuvenation Attraction Offer': 'Extend your roof by up to 15 years.',
    'Attraction Offer Deliverables': 'Clean, treat, before-and-after photos.',
    'Are you taking a deposit?': 'Yes',
    'Appointment Manager Name / Front Desk Representative Name': 'Maricia at the front desk.',
    'Appointment Manager Email / Front Desk Email': 'Her email is maricia@abcroofing.com',
    _source: 'portal',
  });
  assert.deepStrictEqual(first.recipients, ['buyer@motionz.ai', 'csm@motionz.ai', 'ops@motionz.ai'], 'the settings list and the assigned CSM are emailed');
  assert.ok(first.bodies.every((b) => b.includes('ABC Roofing') && b.includes('No oil-based products.')), 'the email carries the answers');
  assert.ok(first.bodies.every((b) => !b.includes('_source')), 'the source marker is not in the email');

  const audit = store.auditLogs.filter((l) => l.action === 'onboarding.form_submitted');
  assert.strictEqual(audit.length, 1);
  assert.strictEqual(audit[0].tenant_id, tenant.id);
  assert.strictEqual(audit[0].actor_email, 'john@abcroofing.com');
  assert.strictEqual(audit[0].resource_id, saved.id);
  assert.strictEqual(audit[0].details?.notified, 3);
  assert.ok(!JSON.stringify(audit[0].details).includes('oil-based'), 'the answers themselves are not copied into the audit log');
  assert.strictEqual(auditActionLabel('onboarding.form_submitted'), 'Onboarding form sent from the portal');

  // The client reads the same answers back, in the order of the form, without the marker.
  const readBack = await answersGet(
    new NextRequest(`${BASE_URL}/api/portal/${clientId}/onboarding-answers`, { headers: new Headers({ cookie: `${SESSION_COOKIE_NAME}=${owner}` }) }),
    { params: { clientId } }
  );
  const shown = (await readBack.json()).submissions[0].answers;
  assert.strictEqual(shown._source, undefined);
  assert.deepStrictEqual(Object.keys(shown).slice(0, 3), ['Full Name', 'DBA Business Name', 'Business Email']);
  assert.strictEqual(Object.keys(shown).length, Object.keys(saved.answers).length - 1);
  console.log(' PASS: a valid submission is saved by label, audit-logged and emailed to the list and the CSM.');

  // The CSM box unticked: only the list.
  await appSettingsRepository.set('notifications', { onboarding_form_recipients: ['buyer@motionz.ai'], notify_assigned_csm: false }, 'test');
  const second = await withCapturedEmail(() => post(validValues({ city: 'Baton Rouge' }), member));
  assert.strictEqual(second.result.status, 200);
  assert.deepStrictEqual(second.recipients, ['buyer@motionz.ai']);
  assert.strictEqual(rows()[0].submitter_email, 'sarah@abcroofing.com', 'a team member with Setup Progress may send it');
  // Nobody to email for a while: without a mail provider every message would be printed here.
  const notifyNobody = () => appSettingsRepository.set('notifications', { onboarding_form_recipients: [], notify_assigned_csm: false }, 'test');
  const notifyEveryone = () =>
    appSettingsRepository.set('notifications', { onboarding_form_recipients: ['buyer@motionz.ai', 'ops@motionz.ai'], notify_assigned_csm: true }, 'test');
  await notifyNobody();

  // Staff may fill it in for the client.
  assert.strictEqual((await post(validValues({ city: 'By admin' }), admin)).status, 200);
  assert.strictEqual(rows()[0].submitter_email, 'admin@motionz.ai');
  assert.strictEqual((await post(validValues({ city: 'By CSM' }), assignedCsm)).status, 200);
  console.log(' PASS: a team member and staff can send the form; the CSM is only emailed when that box is ticked.');

  // ---- 3. Required answers -------------------------------------------------------------------
  const before = rows().length;
  for (const field of ONBOARDING_FORM_FIELDS.filter((f) => f.required)) {
    for (const blank of [undefined, '   ']) {
      const values = validValues();
      if (blank === undefined) delete values[field.key];
      else values[field.key] = blank;
      const res = await post(values, owner);
      assert.strictEqual(res.status, 400, `"${field.label}" is required`);
      assert.ok(res.body.error.includes(field.label), `the message names "${field.label}"`);
      assert.deepStrictEqual(Object.keys(res.body.fields), [field.key]);
    }
  }
  const empty = await post({}, owner);
  assert.strictEqual(empty.status, 400);
  assert.strictEqual(Object.keys(empty.body.fields).length, 13, 'every missing required question is reported');
  assert.ok(empty.body.error.includes('DBA Business Name'), 'the first one in form order is named');
  console.log(' PASS: a missing required answer is a 400 that names the question.');

  // ---- 4. Email, phone, length ---------------------------------------------------------------
  for (const bad of ['not-an-email', 'john@', 'john@abc', 'a b@c.com']) {
    const res = await post(validValues({ business_email: bad }), owner);
    assert.strictEqual(res.status, 400, `business email "${bad}" is refused`);
    assert.ok(res.body.error.includes('Business Email'));
    assert.ok(res.body.fields.business_email);
  }
  for (const key of ['personal_phone', 'business_phone']) {
    for (const bad of ['call me', '12345', 'my password 123456789', '+1 555 234 5678 ext 4']) {
      const res = await post(validValues({ [key]: bad }), owner);
      assert.strictEqual(res.status, 400, `${key} "${bad}" is refused`);
      assert.ok(res.body.error.includes(byKey[key].label));
      assert.deepStrictEqual(Object.keys(res.body.fields), [key]);
    }
  }
  let res = await post(validValues({ city: 'x'.repeat(301) }), owner);
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error.includes('City') && /too long/.test(res.body.error));
  res = await post(validValues({ phrases_to_avoid: 'x'.repeat(5001) }), owner);
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.fields.phrases_to_avoid);
  assert.strictEqual((await post(validValues({ city: 'x'.repeat(300), phrases_to_avoid: 'y'.repeat(5000) }), owner)).status, 200, 'the limits themselves are allowed');
  console.log(' PASS: a bad email, a bad phone number and an over-long answer are 400.');

  // ---- 5. Choices must come from the list ----------------------------------------------------
  const badChoices: [string, string | string[]][] = [
    ['country', 'Mars'],
    ['taking_deposit', 'Maybe'],
    ['taking_deposit', ['Yes', 'No']],
    ['pricing_increases', ['Skylights', 'Gold roof']],
    ['pricing_increases', '<script>alert(1)</script>'],
  ];
  for (const [key, value] of badChoices) {
    const r = await post(validValues({ [key]: value }), owner);
    assert.strictEqual(r.status, 400, `${key}=${JSON.stringify(value)} is refused`);
    assert.ok(r.body.error.includes(byKey[key].label));
    assert.deepStrictEqual(Object.keys(r.body.fields), [key]);
  }
  // Parts the form does not have are ignored, never stored.
  res = await post(validValues({ city: 'Extra parts' }), owner, { extra: [['tenant_id', otherTenant.id], ['secret_note', 'store me'], ['_source', 'ghl']] });
  assert.strictEqual(res.status, 200);
  assert.ok(!JSON.stringify(rows()[0].answers).includes('store me'));
  assert.strictEqual(rows()[0].tenant_id, tenant.id);
  assert.strictEqual(rows()[0].answers._source, 'portal');
  console.log(' PASS: a choice that is not on the list is 400; unknown parts are ignored.');

  // ---- 6. Files that are refused -------------------------------------------------------------
  const storedBefore = getMockOnboardingFiles().size;
  const refusedUploads: [string, Upload[], RegExp][] = [
    ['a program', [{ field: 'marketing_materials', name: 'setup.exe', type: 'application/x-msdownload', bytes: text('MZ') }], /not an allowed file type/],
    ['a video', [{ field: 'marketing_materials', name: 'promo.mp4', type: 'video/mp4', bytes: text('video') }], /not an allowed file type/],
    ['a web page', [{ field: 'old_leads_list', name: 'leads.html', type: 'text/html', bytes: text('<html>') }], /not an allowed file type/],
    ['a PDF name with the wrong type', [{ field: 'marketing_materials', name: 'brochure.pdf', type: 'text/html', bytes: PDF }], /not an allowed file type/],
    ['a program renamed to .pdf', [{ field: 'marketing_materials', name: 'brochure.pdf', type: 'application/pdf', bytes: text('MZ this is not a pdf') }], /does not look like a valid \.pdf/],
    ['a picture renamed to .xlsx', [{ field: 'old_leads_list', name: 'leads.xlsx', type: XLSX_TYPE, bytes: PNG }], /does not look like a valid \.xlsx/],
    ['a binary file renamed to .csv', [{ field: 'old_leads_list', name: 'leads.csv', type: 'text/csv', bytes: PNG }], /does not look like a valid \.csv/],
    ['an empty file', [{ field: 'old_leads_list', name: 'leads.csv', type: 'text/csv', bytes: new Uint8Array(0) }], /is empty/],
  ];
  for (const [what, uploads, pattern] of refusedUploads) {
    const r = await post(validValues({ city: `Refused ${what}` }), owner, { uploads });
    assert.strictEqual(r.status, 400, `${what} is refused`);
    assert.match(r.body.error, pattern, what);
    assert.ok(r.body.error.includes(byKey[uploads[0].field].label), 'the message names the upload question');
    assert.deepStrictEqual(Object.keys(r.body.fields), [uploads[0].field]);
  }

  // Over 4 MB in total, spread over both upload questions.
  const big = (name: string, field: string): Upload => ({ field, name, type: 'text/plain', bytes: new Uint8Array(Math.floor(2.1 * 1024 * 1024)).fill(0x61) });
  res = await post(validValues({ city: 'Too big' }), owner, { uploads: [big('notes-1.txt', 'marketing_materials'), big('notes-2.txt', 'old_leads_list')] });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /larger than 4 MB in total/);
  assert.deepStrictEqual(Object.keys(res.body.fields).sort(), ['marketing_materials', 'old_leads_list']);
  // Just under the limit is fine.
  res = await post(validValues({ city: 'Big enough' }), owner, { uploads: [{ ...big('notes-1.txt', 'marketing_materials'), bytes: new Uint8Array(Math.floor(3.9 * 1024 * 1024)).fill(0x61) }] });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));

  // More than 5 files on one question.
  const six: Upload[] = [1, 2, 3, 4, 5, 6].map((n) => ({ field: 'old_leads_list', name: `leads-${n}.csv`, type: 'text/csv', bytes: text('name,phone\n') }));
  res = await post(validValues({ city: 'Too many' }), owner, { uploads: six });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /up to 5 files/);
  assert.deepStrictEqual(Object.keys(res.body.fields), ['old_leads_list']);
  assert.strictEqual((await post(validValues({ city: 'Five is fine' }), owner, { uploads: six.slice(0, 5) })).status, 200);

  // A text value sent where a file is expected.
  res = await post(validValues({ city: 'Not a file', marketing_materials: 'C:\\secret.txt' }), owner);
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.fields.marketing_materials);

  assert.strictEqual(getMockOnboardingFiles().size, storedBefore + 1 + 5, 'refused files are never stored');
  console.log(' PASS: a wrong file type, more than 4 MB in total and more than 5 files are 400, and nothing is stored.');

  // ---- 7. Files that are accepted, and who can open them -------------------------------------
  const csvBytes = text('name,phone\nAnn,555 0100\n');
  res = await post(validValues({ city: 'With files' }), owner, {
    uploads: [
      { field: 'marketing_materials', name: 'Brochure 2026 (final).pdf', type: 'application/pdf', bytes: PDF },
      { field: 'marketing_materials', name: 'logo.png', type: 'image/png', bytes: PNG },
      { field: 'old_leads_list', name: '../../old leads.csv', type: 'application/vnd.ms-excel', bytes: csvBytes },
      // Computers without Office report no type for these; the content is what counts.
      { field: 'old_leads_list', name: 'leads.xlsx', type: '', bytes: ZIP },
      { field: 'old_leads_list', name: 'notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: ZIP },
      // Same name twice in one submission: both are kept.
      { field: 'old_leads_list', name: 'logo.png', type: 'image/png', bytes: PNG },
    ],
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const withFiles = rows()[0];
  const marketing = withFiles.answers['Upload Useful Video / Materials for Marketing'] as any[];
  const oldLeads = withFiles.answers['Upload A List Of Old Leads to Reactivate'] as any[];
  assert.deepStrictEqual(marketing.map((f) => f.name), ['Brochure-2026-final.pdf', 'logo.png']);
  assert.deepStrictEqual(oldLeads.map((f) => f.name), ['old-leads.csv', 'leads.xlsx', 'notes.docx', '2-logo.png']);
  for (const file of [...marketing, ...oldLeads]) {
    assert.deepStrictEqual(Object.keys(file).sort(), ['name', 'path', 'size']);
    assert.ok(file.path.startsWith(`${tenant.id}/`), 'files live under the client');
    assert.match(file.path, /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/, 'the path holds no unsafe characters');
    assert.ok(getMockOnboardingFiles().has(file.path));
  }
  assert.strictEqual(marketing[0].size, PDF.byteLength);
  assert.strictEqual(new Set([...marketing, ...oldLeads].map((f) => f.path.split('/')[1])).size, 1, 'one folder per submission');
  assert.strictEqual(store.auditLogs.find((l) => l.action === 'onboarding.form_submitted' && l.resource_id === withFiles.id)!.details?.files, 6);

  // The viewer gets them as file lists; the email lists their names.
  const display = displayAnswers(withFiles.answers);
  assert.deepStrictEqual((display['Upload A List Of Old Leads to Reactivate'] as any[]).map((f) => f.name), oldLeads.map((f) => f.name));
  assert.strictEqual(answersAsText(withFiles.answers)['Upload Useful Video / Materials for Marketing'], 'Brochure-2026-final.pdf, logo.png');
  assert.strictEqual(display._source, undefined);
  // Old GoHighLevel file values and other odd shapes are not shown as files (or at all).
  assert.deepStrictEqual(
    displayAnswers({
      'Business Email': 'a@b.co',
      'Upload A List Of Old Leads to Reactivate': [{ url: 'https://files.example/x.csv', meta: { name: 'x.csv' } }],
      'Upload Useful Video / Materials for Marketing': [{ name: 'x.pdf', path: '../../other-tenant/x.pdf' }],
      Weird: { nested: true },
      'An older question': 'still shown',
    }),
    { 'Business Email': 'a@b.co', 'An older question': 'still shown' }
  );

  const csvPath = oldLeads[0].path;
  for (const [who, session] of [['the owner', owner], ['a team member', member], ['an admin', admin], ['the assigned CSM', assignedCsm]] as const) {
    const fileRes = await openFile(csvPath, session);
    assert.strictEqual(fileRes.status, 200, `${who} can open the file`);
    assert.deepStrictEqual(new Uint8Array(await fileRes.arrayBuffer()), csvBytes, `${who} gets the file that was uploaded`);
    assert.match(fileRes.headers.get('content-disposition') || '', /attachment; filename="old-leads\.csv"/);
    assert.match(fileRes.headers.get('cache-control') || '', /no-store/);
  }
  // By tenant id as well as by slug.
  assert.strictEqual((await openFile(csvPath, admin, tenant.id)).status, 200);

  assert.strictEqual((await openFile(csvPath)).status, 401, 'signed-out is refused');
  assert.strictEqual((await openFile(csvPath, outsider)).status, 403, "another client cannot open this client's file");
  assert.strictEqual((await openFile(csvPath, otherCsm)).status, 403, 'a CSM of another client cannot');
  // Asking through the other client's own portal does not work either: the path is not theirs.
  assert.strictEqual((await openFile(csvPath, admin, otherTenant.id)).status, 404);
  for (const badPath of [
    '', 'leads.csv', `${tenant.id}/../${tenant.id}/x/leads.csv`, `${tenant.id}/a/b/c.csv`, `${otherTenant.id}/x/leads.csv`,
    `${tenant.id}/nope/missing.csv`, `/${csvPath}`, `${csvPath}?download=1`, csvPath.replace(/\//g, '\\'),
  ]) {
    assert.strictEqual((await openFile(badPath, owner)).status, 404, `"${badPath}" opens nothing`);
  }
  const memberUser = store.users.find((u) => u.id === 'user-member-1')!;
  const allowedBefore = memberUser.allowed_modules;
  memberUser.allowed_modules = (allowedBefore || []).filter((m) => m !== 'onboarding');
  assert.strictEqual((await openFile(csvPath, member)).status, 403, 'a member without Setup Progress cannot open files');
  console.log(' PASS: accepted files are stored under the client and open for the client and staff only.');

  // ---- 8. Who may send the form --------------------------------------------------------------
  const count = rows().length;
  res = await post(validValues({ city: 'Member without the section' }), member);
  assert.strictEqual(res.status, 403, 'a member without Setup Progress is refused');
  memberUser.allowed_modules = allowedBefore;

  assert.strictEqual((await post(validValues({ city: 'Signed out' }))).status, 401, 'signed-out is refused');
  assert.strictEqual((await post(validValues({ city: 'Outsider' }), outsider)).status, 403, 'another client is refused');
  assert.strictEqual((await post(validValues({ city: 'Other CSM' }), otherCsm)).status, 403, 'a CSM of another client is refused');
  assert.strictEqual((await post(validValues({ city: 'Nowhere' }), admin, { target: '00000000-0000-4000-8000-00000000dead' })).status, 404);

  await featureToggleRepository.setToggle(tenant.id, 'onboarding', false);
  assert.strictEqual((await post(validValues({ city: 'Section off' }), owner)).status, 403, 'Setup Progress switched off: the client cannot send it');
  await featureToggleRepository.setToggle(tenant.id, 'onboarding', true);

  const storedTenant = store.tenants.find((t) => t.id === tenant.id)!;
  storedTenant.status = 'suspended';
  assert.strictEqual((await post(validValues({ city: 'Suspended' }), owner)).status, 403, 'a suspended client cannot send it');
  storedTenant.status = 'active';

  // Not a form post at all.
  globalRateLimiter.reset();
  const json = await formPost(
    new NextRequest(`${BASE_URL}/api/portal/${clientId}/onboarding-form`, {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${owner}` }),
      body: JSON.stringify(validValues()),
    }),
    { params: { clientId } }
  );
  assert.strictEqual(json.status, 400);
  assert.strictEqual(rows().length, count, 'none of the refused requests saved anything');
  console.log(' PASS: signed-out is 401; no Setup Progress, another client, a suspended client are 403.');

  // ---- 9. The same form twice ----------------------------------------------------------------
  const dupValues = validValues({ city: 'Sent twice' });
  const dupUpload: Upload[] = [{ field: 'marketing_materials', name: 'brochure.pdf', type: 'application/pdf', bytes: PDF }];
  await notifyEveryone();
  const once = await withCapturedEmail(() => post(dupValues, owner, { uploads: dupUpload }));
  assert.strictEqual(once.result.status, 200);
  assert.strictEqual(once.recipients.length, 3);
  const afterOnce = rows().length;
  const filesAfterOnce = getMockOnboardingFiles().size;
  const twice = await withCapturedEmail(() => post(dupValues, owner, { uploads: dupUpload }));
  assert.strictEqual(twice.result.status, 200, 'the second send is answered kindly');
  assert.strictEqual(twice.result.body.duplicate, true);
  assert.strictEqual(twice.result.body.submissionId, once.result.body.submissionId);
  assert.strictEqual(rows().length, afterOnce, 'no second row');
  assert.strictEqual(getMockOnboardingFiles().size, filesAfterOnce, 'no second copy of the file');
  assert.deepStrictEqual(twice.recipients, [], 'no second email');
  await notifyNobody();
  // The same answers from someone else, or with one change, are not duplicates.
  assert.strictEqual((await post(dupValues, member, { uploads: dupUpload })).body.duplicate, undefined);
  assert.strictEqual((await post({ ...dupValues, state: 'LA' }, owner, { uploads: dupUpload })).body.duplicate, undefined);
  assert.strictEqual(rows().length, afterOnce + 2);
  // After 10 minutes the same answers count as a new submission.
  const again = validValues({ city: 'Sent again later' });
  const early = await post(again, owner);
  store.onboardingSubmissions.find((s) => s.id === early.body.submissionId)!.submitted_at = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const later = await post(again, owner);
  assert.strictEqual(later.body.duplicate, undefined);
  assert.notStrictEqual(later.body.submissionId, early.body.submissionId);
  console.log(' PASS: the same form sent again within 10 minutes is ignored: no row, no file, no email.');

  // ---- 10. Updating: files of the previous submission can be kept -----------------------------
  const base = await post(validValues({ city: 'Keep base' }), owner, {
    uploads: [
      { field: 'marketing_materials', name: 'keep-me.pdf', type: 'application/pdf', bytes: PDF },
      { field: 'marketing_materials', name: 'drop-me.pdf', type: 'application/pdf', bytes: PDF },
    ],
  });
  assert.strictEqual(base.status, 200);
  const baseFiles = rows()[0].answers['Upload Useful Video / Materials for Marketing'] as any[];
  const olderPath = marketing[0].path; // A file of an earlier submission, not the newest one.
  const update = await post(validValues({ city: 'Keep update' }), owner, {
    uploads: [{ field: 'marketing_materials', name: 'new-one.png', type: 'image/png', bytes: PNG }],
    extra: [
      ['marketing_materials__keep', baseFiles[0].path],
      ['marketing_materials__keep', olderPath],
      ['marketing_materials__keep', `${otherTenant.id}/x/stolen.pdf`],
      ['old_leads_list__keep', baseFiles[0].path],
    ],
  });
  assert.strictEqual(update.status, 200, JSON.stringify(update.body));
  const updated = rows()[0];
  assert.deepStrictEqual(
    (updated.answers['Upload Useful Video / Materials for Marketing'] as any[]).map((f) => f.name),
    ['keep-me.pdf', 'new-one.png'],
    'only files of the newest earlier submission, under the same question, can be kept'
  );
  assert.strictEqual(updated.answers['Upload A List Of Old Leads to Reactivate'], undefined);
  assert.ok(!JSON.stringify(updated.answers).includes(otherTenant.id));
  // Kept files count towards the 5 per question.
  const five: Upload[] = [1, 2, 3, 4, 5].map((n) => ({ field: 'marketing_materials', name: `extra-${n}.png`, type: 'image/png', bytes: PNG }));
  const tooManyKept = await post(validValues({ city: 'Keep too many' }), owner, {
    uploads: five,
    extra: [['marketing_materials__keep', (updated.answers['Upload Useful Video / Materials for Marketing'] as any[])[0].path]],
  });
  assert.strictEqual(tooManyKept.status, 400);
  assert.match(tooManyKept.body.error, /up to 5 files/);
  console.log(' PASS: when updating, files of the last submission can be kept; nothing else can be claimed.');

  // ---- 11. Rate limit ------------------------------------------------------------------------
  globalRateLimiter.reset();
  for (let i = 0; i < 10; i++) {
    const r = await post(validValues({ city: `Round ${i}` }), owner, { keepRateLimit: true });
    assert.strictEqual(r.status, 200, `send ${i + 1} of 10 is allowed`);
  }
  const limited = await post(validValues({ city: 'Round 11' }), owner, { keepRateLimit: true });
  assert.strictEqual(limited.status, 429, 'the 11th send within an hour is refused');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.ok(!rows().some((r) => r.answers.City === 'Round 11'));
  // The limit is per person.
  assert.strictEqual((await post(validValues({ city: 'Round 11 by Sarah' }), member, { keepRateLimit: true })).status, 200);
  console.log(' PASS: more than 10 sends an hour by one person is 429.');

  // ---- 12. The GoHighLevel webhook still works (an old workflow may still fire) ---------------
  globalRateLimiter.reset();
  await notifyEveryone();
  const hook = await withCapturedEmail(async () => {
    const r = await ghlWebhook(
      new NextRequest(`${BASE_URL}/api/webhooks/ghl`, {
        method: 'POST',
        headers: new Headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          email: 'john@abcroofing.com',
          contact_id: 'ghl-contact-9',
          'DBA Business Name': 'ABC Roofing',
          'Personnal Phone Number (For Communication)': '+1 555 000 1111',
          customData: { event: 'onboarding_form' },
        }),
      })
    );
    return { status: r.status, body: await r.json() };
  });
  assert.strictEqual(hook.result.status, 200);
  assert.strictEqual(hook.result.body.matched, true);
  assert.deepStrictEqual(hook.recipients, ['buyer@motionz.ai', 'csm@motionz.ai', 'ops@motionz.ai'], 'the webhook emails the same people');
  const fromGhl = (await onboardingSubmissionRepository.listByTenant(tenant.id, 1))[0];
  assert.strictEqual(fromGhl.ghl_contact_id, 'ghl-contact-9');
  assert.strictEqual(fromGhl.answers._source, undefined, 'a GoHighLevel submission is not marked as a portal one');
  // The old spelling of the phone question is shown where the question is on the form.
  assert.deepStrictEqual(Object.keys(displayAnswers({ ...fromGhl.answers, Zzz: 'last', 'Full Name': 'first' })), [
    'Full Name', 'DBA Business Name', 'Personnal Phone Number (For Communication)', 'email', 'Zzz',
  ]);
  console.log(' PASS: the GoHighLevel onboarding_form webhook still saves and notifies through the shared helper.');

  console.log('All portal onboarding form tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
