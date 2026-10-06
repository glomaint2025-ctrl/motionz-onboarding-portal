import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { POST as ghlWebhook } from '../../src/app/api/webhooks/ghl/route';
import { PUT as putSettings } from '../../src/app/api/admin/settings/notifications/route';
import { PUT as putClient, PATCH as patchClient } from '../../src/app/api/admin/clients/[id]/route';
import { GET as getCsms } from '../../src/app/api/admin/csms/route';
import { POST as logout } from '../../src/app/api/auth/logout/route';
import { GET as getPortalData } from '../../src/app/api/portal/[clientId]/data/route';
import { getStore, resetStore } from '../../src/lib/db';
import { tenantRepository, userRepository, appSettingsRepository } from '../../src/lib/db/repositories';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';
import { nextUpcomingCall } from '../../src/lib/utils/appointments';
import { auditActionLabel, securityEventLabel, detailChips } from '../../src/lib/utils/log-labels';

// Tests must never send real email, call Google or use a real webhook secret.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SHEETS_SCRIPT_URL', 'GOOGLE_SHEETS_SCRIPT_SECRET', 'GHL_WEBHOOK_SECRET', 'MEDIA_BUYER_EMAIL', 'EMAIL_TEST_REDIRECT_TO']) {
  delete process.env[key];
}

console.log('--- Running GHL Webhook Branch Tests ---');

const BASE = 'http://localhost:3000';
const DEMO_TENANT = '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f';
const DEMO_LOCATION = 'loc_ghl_demo_abc';
const SECRET = 'branch-test-secret-value';

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Posts one webhook event with the shared secret in customData, the way GHL workflows send it. */
async function send(event: string | null, body: Record<string, any> = {}, extraCustomData: Record<string, any> = {}) {
  const res = await ghlWebhook(
    req('/api/webhooks/ghl', 'POST', {
      ...body,
      customData: { ...(event ? { event } : {}), secret: SECRET, ...extraCustomData },
    })
  );
  return { status: res.status, json: await res.json() };
}

/** Captures outgoing provider calls by pretending a Resend key is set and stubbing fetch. */
async function withCapturedEmail<T>(fn: () => Promise<T>): Promise<{ result: T; recipients: string[] }> {
  const sent: any[] = [];
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key-not-real';
  globalThis.fetch = (async (url: any, init?: any) => {
    sent.push({ url: String(url), body: JSON.parse(init?.body || '{}') });
    return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await fn();
    return { result, recipients: sent.flatMap((s) => s.body.to as string[]).sort() };
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
}

const store = () => getStore();
const audits = (action: string) => store().auditLogs.filter((l) => l.action === action);
const leadsFor = (contactId: string) => store().leads.filter((l) => l.ghl_contact_id === contactId);
const callsFor = (appointmentId: string) => store().appointments.filter((a) => a.ghl_appointment_id === appointmentId);

async function run() {
  resetStore();
  process.env.GHL_WEBHOOK_SECRET = SECRET;

  const adminCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin')}` };
  const csmCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm')}` };

  // ───────────── 1. Requests that never reach a handler ─────────────
  const invalid = await ghlWebhook(
    new NextRequest(`${BASE}/api/webhooks/ghl`, { method: 'POST', headers: new Headers({ 'content-type': 'application/json' }), body: '{not json' })
  );
  assert.strictEqual(invalid.status, 400, 'invalid JSON is a 400');
  assert.match((await invalid.json()).error, /Invalid JSON/);

  // Wrong secret: 401 every time, recorded as a security event, but a flood is capped per sender.
  for (let i = 0; i < 8; i++) {
    const res = await ghlWebhook(
      req('/api/webhooks/ghl', 'POST', { location: { id: DEMO_LOCATION }, customData: { event: 'lead', secret: 'definitely-wrong-secret' } }, { 'x-real-ip': '203.0.113.9' })
    );
    assert.strictEqual(res.status, 401);
  }
  const noSecret = await ghlWebhook(req('/api/webhooks/ghl', 'POST', { customData: { event: 'csm_call' } }, { 'x-real-ip': '203.0.113.10' }));
  assert.strictEqual(noSecret.status, 401);
  const badSecretEvents = store().securityEvents.filter((e) => e.event_type === 'ghl_webhook_invalid_secret');
  assert.strictEqual(badSecretEvents.filter((e) => e.details?.ip === '203.0.113.9').length, 5, 'wrong-secret logging is rate limited per sender');
  assert.strictEqual(badSecretEvents.filter((e) => e.details?.ip === '203.0.113.10').length, 1);
  const first = badSecretEvents.find((e) => e.details?.ip === '203.0.113.9')!;
  assert.strictEqual(first.details?.eventType, 'lead');
  assert.strictEqual(first.details?.reason, 'Wrong webhook secret.');
  assert.strictEqual(badSecretEvents.find((e) => e.details?.ip === '203.0.113.10')!.details?.reason, 'No webhook secret was sent.');
  assert.ok(!JSON.stringify(badSecretEvents).includes('definitely-wrong-secret'), 'the secret that was tried is never stored');
  assert.strictEqual(securityEventLabel('ghl_webhook_invalid_secret'), 'Blocked: GoHighLevel message with a wrong or missing secret');
  assert.strictEqual(store().leads.filter((l) => l.created_at > '2026-10-01').length, 0, 'nothing is stored for a rejected secret');
  console.log(' PASS: invalid JSON is 400; wrong or missing secret is 401 and logged as a rate-limited security event.');

  // ───────────── 2. Lead events ─────────────
  const unknownLoc = await send('lead', { contact_id: 'br-unknown', first_name: 'No', last_name: 'Where', location: { id: 'loc_nobody_has_this' } }, { stage: 'New Lead' });
  assert.strictEqual(unknownLoc.status, 200);
  assert.strictEqual(unknownLoc.json.ignored, true);
  assert.strictEqual(leadsFor('br-unknown').length, 0, 'no lead is created for an unknown location');
  const ignoredLead = audits('ghl.webhook.ignored').find((l) => l.details?.location === 'loc_nobody_has_this');
  assert.ok(ignoredLead, 'an ignored lead leaves an audit entry');
  assert.strictEqual(ignoredLead!.details?.eventType, 'lead');
  assert.match(ignoredLead!.details?.reason, /location id/i);
  assert.strictEqual(ignoredLead!.resource_id, 'loc_nobody_has_this');
  assert.strictEqual(ignoredLead!.tenant_id, undefined);
  assert.strictEqual(auditActionLabel('ghl.webhook.ignored', ignoredLead!.details), 'GoHighLevel event ignored: Unknown or missing location id.');
  assert.strictEqual(auditActionLabel('ghl.webhook.ignored'), 'GoHighLevel event ignored');
  assert.ok(detailChips(ignoredLead!.details).some((c) => c.label === 'Location ID' && c.value === 'loc_nobody_has_this'), 'the location is shown as a chip');

  const noLocation = await send('lead', { contact_id: 'br-nolocation' });
  assert.strictEqual(noLocation.json.ignored, true, 'a lead with no location id at all is ignored, not an error');

  const noContact = await send('lead', { first_name: 'No', last_name: 'Id', location: { id: DEMO_LOCATION } });
  assert.strictEqual(noContact.status, 400, 'a lead without contact_id is rejected');
  const rejectedLead = audits('ghl.webhook.rejected').find((l) => l.details?.eventType === 'lead');
  assert.ok(rejectedLead, 'a rejected lead leaves an audit entry');
  assert.match(rejectedLead!.details?.reason, /contact_id/);
  assert.strictEqual(auditActionLabel('ghl.webhook.rejected', rejectedLead!.details), 'GoHighLevel event rejected: contact_id is required.');
  console.log(' PASS: unknown location is ignored with an audit entry; missing contact_id is 400 with an audit entry.');

  // Stage fallbacks, in the order the handler tries them.
  const demoLead = (contactId: string, extra: Record<string, any> = {}) => ({
    contact_id: contactId,
    first_name: 'Stage',
    last_name: 'Tester',
    email: `${contactId}@example.test`,
    location: { id: DEMO_LOCATION },
    ...extra,
  });
  assert.strictEqual((await send('lead', demoLead('br-stage-1'), { stage: 'From Custom Data' })).status, 200);
  assert.strictEqual((await send('lead', demoLead('br-stage-2', { pipeline_stage: 'From Pipeline Stage' }))).status, 200);
  assert.strictEqual((await send('lead', demoLead('br-stage-3', { pipleline_stage: 'From Misspelt Stage' }))).status, 200);
  assert.strictEqual((await send('lead', demoLead('br-stage-4', { opportunity: { pipeline_stage: 'From Opportunity' } }))).status, 200);
  assert.strictEqual((await send('lead', demoLead('br-stage-5', { status: 'From Status' }))).status, 200);
  assert.strictEqual((await send('lead', demoLead('br-stage-6'))).status, 200);
  assert.strictEqual(leadsFor('br-stage-1')[0].status, 'From Custom Data');
  assert.strictEqual(leadsFor('br-stage-2')[0].status, 'From Pipeline Stage');
  assert.strictEqual(leadsFor('br-stage-3')[0].status, 'From Misspelt Stage');
  assert.strictEqual(leadsFor('br-stage-4')[0].status, 'From Opportunity');
  assert.strictEqual(leadsFor('br-stage-5')[0].status, 'From Status');
  assert.strictEqual(leadsFor('br-stage-6')[0].status, 'New', 'a lead with no stage anywhere starts as New');
  // customData.stage wins over every other field.
  await send('lead', demoLead('br-stage-7', { pipeline_stage: 'Loses', status: 'Loses too' }), { stage: 'Wins' });
  assert.strictEqual(leadsFor('br-stage-7')[0].status, 'Wins');
  console.log(' PASS: every stage fallback sets the lead stage (customData.stage, pipeline_stage, pipleline_stage, opportunity.pipeline_stage, status).');

  // The same contact twice, and five times at once: exactly one row.
  await send('lead', demoLead('br-dup'), { stage: 'New Lead' });
  await send('lead', demoLead('br-dup'), { stage: 'New Lead' });
  assert.strictEqual(leadsFor('br-dup').length, 1, 'a repeated event does not duplicate the lead');
  const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => send('lead', demoLead('br-burst'), { stage: `Stage ${i}` })));
  assert.ok(burst.every((r) => r.status === 200));
  assert.strictEqual(leadsFor('br-burst').length, 1, 'events arriving together create exactly one lead');
  assert.strictEqual(leadsFor('br-burst')[0].tenant_id, DEMO_TENANT);

  // Contact details changed on a later event update the same row.
  const before = leadsFor('br-dup')[0];
  const beforeId = before.id;
  await send('lead', demoLead('br-dup', { first_name: 'Renamed', last_name: 'Person', email: 'new.address@example.test', phone: '+1 555 000 1111', opportunity_source: 'Referral' }), { stage: 'Contacted' });
  const after = leadsFor('br-dup');
  assert.strictEqual(after.length, 1);
  assert.strictEqual(after[0].id, beforeId, 'the same row is updated');
  assert.strictEqual(after[0].first_name, 'Renamed');
  assert.strictEqual(after[0].last_name, 'Person');
  assert.strictEqual(after[0].email, 'new.address@example.test');
  assert.strictEqual(after[0].phone, '+1 555 000 1111');
  assert.strictEqual(after[0].source, 'Referral');
  assert.strictEqual(after[0].status, 'Contacted');
  console.log(' PASS: repeated and simultaneous lead events keep one row; changed contact details update it.');

  // Accepted events are audited with the event type and the client.
  const leadAudit = audits('ghl.webhook.lead')[0];
  assert.ok(leadAudit, 'accepted lead events are audited');
  assert.strictEqual(leadAudit.tenant_id, DEMO_TENANT);
  assert.strictEqual(leadAudit.details?.event, 'lead');
  assert.strictEqual(leadAudit.details?.matched, true);
  assert.strictEqual(leadAudit.resource_id, DEMO_LOCATION);
  assert.strictEqual(leadAudit.actor_role, 'webhook');

  // ───────────── 3. CSM calls ─────────────
  // A second client whose company email belongs to no portal user, with one team member.
  const callCo = await tenantRepository.create({ name: 'Call Co Roofing', slug: 'call-co-roofing', primary_email: 'office@callco.test', status: 'active' });
  await userRepository.create({ email: 'member@callco.test', full_name: 'Casey Member', role: 'client_member', tenant_id: callCo.id });
  const portalAppointments = async () => {
    const res = await getPortalData(req(`/api/portal/${callCo.id}/data`, 'GET', undefined, adminCookie), { params: { clientId: callCo.id } });
    assert.strictEqual(res.status, 200);
    return (await res.json()).appointments as { appointment_time: string; status?: string }[];
  };
  const T1 = '2031-03-01T15:00:00.000Z';
  const T2 = '2031-03-02T16:30:00.000Z';
  const T3 = '2031-04-10T09:00:00.000Z';
  const call = (email: string, calendar: Record<string, any>) => send('csm_call', { email, calendar });

  // Matched by a TEAM MEMBER's email (the portal-user branch of tenantByEmail).
  const created = await call('Member@CallCo.test', { appointmentId: 'br-appt-1', startTime: T1, title: 'Onboarding call', status: 'confirmed' });
  assert.strictEqual(created.status, 200);
  assert.strictEqual(created.json.matched, true);
  assert.strictEqual(callsFor('br-appt-1').length, 1);
  assert.strictEqual(callsFor('br-appt-1')[0].tenant_id, callCo.id, 'a team member email places the call on their company');
  assert.strictEqual(callsFor('br-appt-1')[0].notes, 'csm_call');
  assert.strictEqual(nextUpcomingCall(await portalAppointments()), T1, 'the client Home shows the booked call');

  // Same appointment again with a new start time: one row, updated.
  await call('member@callco.test', { appointmentId: 'br-appt-1', startTime: T2, title: 'Onboarding call', status: 'confirmed' });
  assert.strictEqual(callsFor('br-appt-1').length, 1, 'a rescheduled call stays one row');
  assert.strictEqual(callsFor('br-appt-1')[0].appointment_time, T2);
  assert.strictEqual(nextUpcomingCall(await portalAppointments()), T2);

  // Matched by the COMPANY's primary email (no portal user has it): the tenant branch of tenantByEmail.
  assert.strictEqual(await userRepository.findByEmail('office@callco.test'), null);
  const byCompany = await call('office@callco.test', { appointmentId: 'br-appt-2', startTime: T3, status: 'confirmed' });
  assert.strictEqual(byCompany.json.matched, true);
  assert.strictEqual(callsFor('br-appt-2')[0].tenant_id, callCo.id, 'the company primary email places the call');
  assert.strictEqual(callsFor('br-appt-2')[0].contact_name, 'Call with your CSM', 'a call without a title gets a plain one');
  assert.strictEqual(nextUpcomingCall(await portalAppointments()), T2, 'the earliest upcoming call is shown');

  // Cancelled: stored as cancelled and no longer shown as the next call.
  await call('member@callco.test', { appointmentId: 'br-appt-1', startTime: T2, appoinmentStatus: 'Cancelled' });
  assert.strictEqual(callsFor('br-appt-1').length, 1);
  assert.strictEqual(callsFor('br-appt-1')[0].status, 'cancelled');
  assert.strictEqual(nextUpcomingCall(await portalAppointments()), T3, 'a cancelled call is skipped; the next real one is shown');
  await call('office@callco.test', { appointmentId: 'br-appt-2', startTime: T3, status: 'cancelled' });
  assert.strictEqual(nextUpcomingCall(await portalAppointments()), null, 'with every call cancelled nothing is shown');
  assert.strictEqual(nextUpcomingCall([{ appointment_time: '2020-01-01T00:00:00Z', status: 'confirmed' }]), null, 'past calls are never the next call');

  // No client with that email: ignored, with the email and start time in the audit log.
  const stray = await call('Someone.Else@Example.test', { appointmentId: 'br-appt-stray', startTime: T1, status: 'confirmed' });
  assert.strictEqual(stray.status, 200);
  assert.strictEqual(stray.json.ignored, true);
  assert.strictEqual(callsFor('br-appt-stray').length, 0);
  const strayAudit = audits('ghl.webhook.ignored').find((l) => l.details?.email === 'someone.else@example.test');
  assert.ok(strayAudit, 'an unmatched booking leaves an audit entry with the booking email');
  assert.strictEqual(strayAudit!.details?.eventType, 'csm_call');
  assert.strictEqual(strayAudit!.details?.start_time, T1);
  assert.match(strayAudit!.details?.reason, /No client matches/);
  assert.ok(detailChips(strayAudit!.details).some((c) => c.label === 'Email' && c.value === 'someone.else@example.test'));
  assert.ok(detailChips(strayAudit!.details).some((c) => c.label === 'Booked for'), 'the start time is shown as a chip');

  // Missing appointment id or start time: 400.
  assert.strictEqual((await call('member@callco.test', { startTime: T1 })).status, 400, 'missing appointment id');
  assert.strictEqual((await call('member@callco.test', { appointmentId: 'br-appt-3' })).status, 400, 'missing start time');
  assert.strictEqual(callsFor('br-appt-3').length, 0);
  assert.ok(audits('ghl.webhook.rejected').some((l) => l.details?.eventType === 'csm_call' && l.details?.email === 'member@callco.test'));

  const callAudit = audits('ghl.webhook.csm_call')[0];
  assert.strictEqual(callAudit.tenant_id, callCo.id);
  assert.strictEqual(callAudit.details?.event, 'csm_call');
  console.log(' PASS: CSM calls are created, rescheduled and cancelled on one row; matched by member or company email; unmatched ones are audited.');

  // ───────────── 4. Onboarding form ─────────────
  await appSettingsRepository.set('notifications', { onboarding_form_recipients: ['buyer@motionz.ai', 'ops@motionz.ai'], notify_assigned_csm: true }, 'test');
  process.env.MEDIA_BUYER_EMAIL = 'Media.Buyer@Example.test';
  const form = (answers: Record<string, any>) => send('onboarding_form', { contact_id: 'br-form-contact', email: 'john@abcroofing.com', ...answers });
  const demoSubs = () => store().onboardingSubmissions.filter((s) => s.tenant_id === DEMO_TENANT);

  const firstForm = await withCapturedEmail(() => form({ 'DBA Business Name': 'ABC Roofing', 'Service area': 'Lafayette', 'Years in business': 12 }));
  assert.strictEqual(firstForm.result.status, 200);
  assert.strictEqual(firstForm.result.json.matched, true);
  assert.deepStrictEqual(
    firstForm.recipients,
    ['buyer@motionz.ai', 'csm@motionz.ai', 'media.buyer@example.test', 'ops@motionz.ai'],
    'settings list + MEDIA_BUYER_EMAIL + the assigned CSM are emailed'
  );
  assert.strictEqual(demoSubs().length, 1);
  assert.deepStrictEqual(demoSubs()[0].answers, {
    email: 'john@abcroofing.com',
    'DBA Business Name': 'ABC Roofing',
    'Service area': 'Lafayette',
    'Years in business': '12',
  });
  assert.strictEqual((demoSubs()[0].answers as any).secret, undefined);
  assert.strictEqual((demoSubs()[0].answers as any).customData, undefined);
  assert.ok(!JSON.stringify(store().onboardingSubmissions).includes(SECRET), 'the webhook secret is never stored in answers');
  const formAudit = audits('ghl.webhook.onboarding_form')[0];
  assert.strictEqual(formAudit.tenant_id, DEMO_TENANT);
  assert.strictEqual(formAudit.details?.event, 'onboarding_form');
  assert.strictEqual(formAudit.details?.notified, 4);

  // Exact duplicate within 10 minutes is ignored: no row, no email.
  const repeat = await withCapturedEmail(() => form({ 'DBA Business Name': 'ABC Roofing', 'Service area': 'Lafayette', 'Years in business': 12 }));
  assert.strictEqual(repeat.result.json.ignored, true);
  assert.deepStrictEqual(repeat.recipients, [], 'a duplicate sends no email');
  // ... also when the keys arrive in a different order.
  const reordered = await withCapturedEmail(() => form({ 'Years in business': 12, 'Service area': 'Lafayette', 'DBA Business Name': 'ABC Roofing' }));
  assert.strictEqual(reordered.result.json.ignored, true, 'key order does not defeat duplicate detection');
  assert.deepStrictEqual(reordered.recipients, []);
  assert.strictEqual(demoSubs().length, 1);
  assert.ok(audits('ghl.webhook.ignored').some((l) => l.details?.reason === 'Duplicate submission.' && l.tenant_id === DEMO_TENANT));

  // A changed answer is a new submission; with the CSM toggle off the CSM is not emailed.
  await appSettingsRepository.set('notifications', { onboarding_form_recipients: ['buyer@motionz.ai', 'ops@motionz.ai'], notify_assigned_csm: false }, 'test');
  const changed = await withCapturedEmail(() => form({ 'DBA Business Name': 'ABC Roofing', 'Service area': 'Lafayette and Baton Rouge', 'Years in business': 12 }));
  assert.strictEqual(changed.result.json.ignored, undefined);
  assert.strictEqual(demoSubs().length, 2, 'a changed answer creates a new row');
  assert.deepStrictEqual(changed.recipients, ['buyer@motionz.ai', 'media.buyer@example.test', 'ops@motionz.ai'], 'the CSM is not emailed when the toggle is off');
  delete process.env.MEDIA_BUYER_EMAIL;
  console.log(' PASS: onboarding form duplicates are ignored (any key order), changes are stored, and the right people are emailed.');

  // ───────────── 5. Linking an unmatched form (admin settings route) ─────────────
  await send('onboarding_form', { contact_id: 'br-form-stranger', email: 'newco@example.test', 'DBA Business Name': 'New Co' });
  const unmatched = store().onboardingSubmissions.find((s) => s.submitter_email === 'newco@example.test')!;
  assert.ok(unmatched && !unmatched.tenant_id, 'a form from an unknown email waits unmatched');
  const link = (body: Record<string, any>, cookie: Record<string, string> = adminCookie) =>
    putSettings(req('/api/admin/settings/notifications', 'PUT', { action: 'link_submission', ...body }, cookie));

  assert.strictEqual((await link({ submissionId: unmatched.id, tenantId: DEMO_TENANT }, csmCookie)).status, 403, 'a CSM cannot link submissions');
  assert.strictEqual((await link({ submissionId: unmatched.id, tenantId: DEMO_TENANT }, {})).status, 401, 'signed-out callers cannot link submissions');
  const archived = await tenantRepository.create({ name: 'Archived Roofing', slug: 'archived-roofing', primary_email: 'gone@archived.test', status: 'active' });
  await tenantRepository.softDelete(archived.id);
  assert.strictEqual((await link({ submissionId: unmatched.id, tenantId: archived.id })).status, 400, 'an archived client is refused');
  assert.strictEqual((await link({ tenantId: DEMO_TENANT })).status, 400, 'a submission must be chosen');
  assert.strictEqual((await link({ submissionId: unmatched.id, tenantId: 'no-such-client' })).status, 400);
  assert.ok(!unmatched.tenant_id, 'refused requests change nothing');
  assert.strictEqual((await link({ submissionId: unmatched.id, tenantId: callCo.id })).status, 200);
  assert.strictEqual(unmatched.tenant_id, callCo.id, 'an admin links the form to the client');
  console.log(' PASS: only an admin can link an unmatched form, and never to an archived client.');

  // ───────────── 6. Marketplace-format events ─────────────
  const mp = (type: string, body: Record<string, any>) =>
    ghlWebhook(req('/api/webhooks/ghl', 'POST', { type, ...body }, { 'x-motionz-webhook-secret': SECRET }));
  const leadsBefore = store().leads.length;
  const appointmentsBefore = store().appointments.length;
  const submissionsBefore = store().onboardingSubmissions.length;
  for (const type of ['AppointmentCreate', 'OpportunityStageUpdate', 'InboundMessage', 'NoteCreate']) {
    const res = await mp(type, { locationId: DEMO_LOCATION, appointment: { id: 'mp-appt', startTime: T1 }, contact: { id: 'mp-contact' } });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ignored, true, `${type} is ignored`);
    assert.ok(audits('ghl.webhook.ignored').some((l) => l.details?.eventType === type && String(l.details?.reason).includes(type)));
  }
  const untyped = await ghlWebhook(req('/api/webhooks/ghl', 'POST', { locationId: DEMO_LOCATION }, { 'x-motionz-webhook-secret': SECRET }));
  assert.strictEqual((await untyped.json()).ignored, true, 'an event with no type is ignored');
  assert.strictEqual(store().leads.length, leadsBefore, 'unused event types create no leads');
  assert.strictEqual(store().appointments.length, appointmentsBefore, 'unused event types create no appointments');
  assert.strictEqual(store().onboardingSubmissions.length, submissionsBefore);

  // The secret is also accepted as a header; ContactCreate / ContactUpdate are stored as leads.
  assert.strictEqual((await mp('ContactCreate', { locationId: DEMO_LOCATION, contact: { id: 'mp-contact-1', firstName: 'Market', lastName: 'Place', email: 'mp@example.test' } })).status, 200);
  assert.strictEqual((await mp('ContactUpdate', { locationId: DEMO_LOCATION, contact: { id: 'mp-contact-1', firstName: 'Market', lastName: 'Updated', status: 'Qualified' } })).status, 200);
  assert.strictEqual(leadsFor('mp-contact-1').length, 1);
  assert.strictEqual(leadsFor('mp-contact-1')[0].last_name, 'Updated');
  assert.strictEqual(leadsFor('mp-contact-1')[0].status, 'Qualified');
  assert.strictEqual((await mp('ContactCreate', { locationId: 'loc_nobody_has_this', contact: { id: 'mp-contact-2' } })).status, 200);
  assert.strictEqual(leadsFor('mp-contact-2').length, 0, 'a marketplace contact for an unknown location is ignored');
  assert.strictEqual((await mp('ContactUpdate', { locationId: DEMO_LOCATION, contact: { firstName: 'No Id' } })).status, 400, 'a contact event with no id is rejected');
  assert.ok(!JSON.stringify(store().auditLogs).includes(SECRET), 'the webhook secret never reaches the audit log');
  console.log(' PASS: other marketplace events are ignored without creating data; contact events are stored as leads.');

  // ───────────── 7. One Location ID, one live client ─────────────
  const saveLocation = (tenantId: string, locationId: string, cookie: Record<string, string> = adminCookie) =>
    putClient(req(`/api/admin/clients/${tenantId}`, 'PUT', { ghl_location_id: locationId }, cookie), { params: { id: tenantId } });

  const clash = await saveLocation(callCo.id, DEMO_LOCATION);
  assert.strictEqual(clash.status, 409, 'a Location ID used by another live client is refused');
  const clashJson = await clash.json();
  assert.strictEqual(clashJson.error, 'This Location ID is already connected to ABC Roofing.');
  assert.strictEqual(clashJson.field, 'ghl_location_id');
  assert.ok(!(await tenantRepository.findById(callCo.id))!.ghl_location_id, 'nothing was saved');

  assert.strictEqual((await saveLocation(DEMO_TENANT, DEMO_LOCATION)).status, 200, 'saving a client its own Location ID is fine');
  assert.strictEqual((await saveLocation(callCo.id, 'bad id!')).status, 400, 'a malformed Location ID is still a 400');
  assert.strictEqual((await saveLocation(callCo.id, 'loc_callco_123', csmCookie)).status, 403);

  // An archived client holding the id does not block.
  await tenantRepository.update(archived.id, { ghl_location_id: 'loc_was_archived_1' });
  const reuse = await saveLocation(callCo.id, 'loc_was_archived_1');
  assert.strictEqual(reuse.status, 200, 'an archived holder does not block');
  const reuseJson = await reuse.json();
  assert.strictEqual(reuseJson.tenant.ghl_location_id, 'loc_was_archived_1');
  assert.match(reuseJson.locationNotice, /Archived Roofing/, 'the response says an archived client also used it');

  // Leads for that location now go to the live client only.
  await send('lead', { contact_id: 'br-reused-loc', first_name: 'Routed', location: { id: 'loc_was_archived_1' } }, { stage: 'New Lead' });
  assert.strictEqual(leadsFor('br-reused-loc').length, 1);
  assert.strictEqual(leadsFor('br-reused-loc')[0].tenant_id, callCo.id);

  // Restoring the archived client must not leave two live clients on one Location ID.
  const restored = await patchClient(req(`/api/admin/clients/${archived.id}`, 'PATCH', { action: 'unarchive' }, adminCookie), { params: { id: archived.id } });
  assert.strictEqual(restored.status, 200);
  const restoredJson = await restored.json();
  assert.match(restoredJson.locationNotice, /Call Co Roofing/);
  assert.ok(!(await tenantRepository.findById(archived.id))!.ghl_location_id, 'the restored client comes back without the shared Location ID');
  assert.strictEqual((await tenantRepository.findById(callCo.id))!.ghl_location_id, 'loc_was_archived_1');
  // Clearing an id is always allowed.
  assert.strictEqual((await saveLocation(callCo.id, '')).status, 200);
  assert.ok(!(await tenantRepository.findById(callCo.id))!.ghl_location_id);
  console.log(' PASS: a Location ID can be connected to one live client only; an archived holder does not block.');

  // ───────────── 8. GET /api/admin/csms ─────────────
  const csmsRes = await getCsms(req('/api/admin/csms', 'GET', undefined, adminCookie));
  assert.strictEqual(csmsRes.status, 200);
  const csms = (await csmsRes.json()).csms as { id: string; name: string; email: string }[];
  assert.deepStrictEqual(csms.map((c) => c.email).sort(), ['csm.agent@motionz.ai', 'csm@motionz.ai']);
  assert.deepStrictEqual(Object.keys(csms[0]).sort(), ['email', 'id', 'name'], 'only id, name and email are returned');
  assert.ok(!csms.some((c) => c.email === 'admin@motionz.ai'), 'admins are not listed as CSMs');
  store().users.find((u) => u.email === 'csm.agent@motionz.ai')!.status = 'suspended';
  const activeOnly = (await (await getCsms(req('/api/admin/csms', 'GET', undefined, adminCookie))).json()).csms;
  assert.deepStrictEqual(activeOnly.map((c: any) => c.email), ['csm@motionz.ai'], 'a disabled CSM is not offered');
  assert.strictEqual((await getCsms(req('/api/admin/csms', 'GET', undefined, csmCookie))).status, 403, 'CSMs cannot list CSMs');
  assert.strictEqual((await getCsms(req('/api/admin/csms', 'GET'))).status, 401);
  console.log(' PASS: GET /api/admin/csms is admin only and returns active CSMs.');

  // ───────────── 9. POST /api/auth/logout ─────────────
  const logoutAuditsBefore = audits('auth.logout').length;
  const out = await logout(req('/api/auth/logout', 'POST', undefined, adminCookie));
  assert.strictEqual(out.status, 200);
  assert.strictEqual((await out.json()).redirectTo, '/auth/login');
  const cleared = out.headers.get('set-cookie') || '';
  assert.ok(cleared.startsWith(`${SESSION_COOKIE_NAME}=;`), 'the session cookie is emptied');
  assert.match(cleared, /Max-Age=0/i);
  assert.match(cleared, /HttpOnly/i);
  assert.strictEqual(audits('auth.logout').length, logoutAuditsBefore + 1, 'signing out is audited');
  assert.strictEqual(audits('auth.logout')[0].actor_email, 'admin@motionz.ai');
  // Without a session (or with a forged one) the cookie is still cleared and nothing is audited.
  const anonymous = await logout(req('/api/auth/logout', 'POST'));
  assert.strictEqual(anonymous.status, 200);
  assert.match(anonymous.headers.get('set-cookie') || '', /Max-Age=0/i);
  const forged = await logout(req('/api/auth/logout', 'POST', undefined, { cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` }));
  assert.strictEqual(forged.status, 200);
  assert.strictEqual(audits('auth.logout').length, logoutAuditsBefore + 1);
  console.log(' PASS: POST /api/auth/logout clears the session cookie and audits real sign-outs only.');

  delete process.env.GHL_WEBHOOK_SECRET;
  console.log('--- GHL Webhook Branch Tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
