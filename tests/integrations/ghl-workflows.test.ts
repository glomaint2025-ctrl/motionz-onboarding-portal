import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { POST as ghlWebhook } from '../../src/app/api/webhooks/ghl/route';
import { GET as getSettings, PUT as putSettings } from '../../src/app/api/admin/settings/notifications/route';
import { GET as getRecords, POST as postRecord, PATCH as patchRecord, DELETE as deleteRecord } from '../../src/app/api/admin/clients/[id]/records/route';
import { GET as getAdminClient } from '../../src/app/api/admin/clients/[id]/route';
import {
  leadRepository,
  appointmentRepository,
  onboardingSubmissionRepository,
  userRepository,
} from '../../src/lib/db/repositories';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';
import { validatePhone } from '../../src/lib/validation';
import { summarizeBuildingInsights, degreesToPitch } from '../../src/lib/integrations/roof/solar';

console.log('--- Running GHL Workflow, Settings & Records Tests ---');

const BASE = 'http://localhost:3000';
const DEMO_TENANT = '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f';
const SECRET = 'workflow-test-secret-value';

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: body ? JSON.stringify(body) : undefined,
  });

async function run() {
  process.env.GHL_WEBHOOK_SECRET = SECRET;
  const admin = await userRepository.findByEmail('admin@motionz.ai');
  const adminCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken(admin!.id, admin!.email, 'admin')}` };

  // 1. Secret can be sent in customData (GHL's standard Webhook action cannot set headers)
  const wrong = await ghlWebhook(req('/api/webhooks/ghl', 'POST', { customData: { event: 'lead', secret: 'nope' } }));
  assert.strictEqual(wrong.status, 401);

  // 2. Lead event (opportunity created / stage changed in a client's sub-account)
  const leadEvent = (stage: string) => ({
    contact_id: 'wf-contact-1',
    first_name: 'Jamie',
    last_name: 'Homeowner',
    email: 'jamie@example.test',
    phone: '+1 555 200 3000',
    opportunity_source: 'Facebook',
    location: { id: 'loc_ghl_demo_abc' },
    customData: { event: 'lead', secret: SECRET, stage },
  });
  assert.strictEqual((await ghlWebhook(req('/api/webhooks/ghl', 'POST', leadEvent('New Lead')))).status, 200);
  assert.strictEqual((await ghlWebhook(req('/api/webhooks/ghl', 'POST', leadEvent('Booked Appointment')))).status, 200);
  const leads = (await leadRepository.listByTenant(DEMO_TENANT, { limit: 500 })).filter((l) => l.ghl_contact_id === 'wf-contact-1');
  assert.strictEqual(leads.length, 1, 'stage change updates the same lead');
  assert.strictEqual(leads[0].status, 'Booked Appointment');
  assert.strictEqual(leads[0].source, 'Facebook');
  console.log(' PASS: lead workflow creates then updates one lead with the GHL stage.');

  // 3. CSM call booked on the Motionz calendar, matched to the client by email
  const callRes = await ghlWebhook(
    req('/api/webhooks/ghl', 'POST', {
      email: 'john@abcroofing.com',
      calendar: { appointmentId: 'wf-appt-1', startTime: '2030-01-15T15:00:00Z', title: 'Onboarding call', status: 'confirmed' },
      customData: { event: 'csm_call', secret: SECRET },
    })
  );
  assert.strictEqual((await callRes.json()).matched, true);
  const calls = (await appointmentRepository.listByTenant(DEMO_TENANT)).filter((a) => a.ghl_appointment_id === 'wf-appt-1');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].notes, 'csm_call');
  console.log(' PASS: CSM call workflow is matched to the client by email.');

  // 4. Notification settings validation and save
  const bad = await putSettings(req('/api/admin/settings/notifications', 'PUT', { onboarding_form_recipients: 'not-an-email' }, adminCookie));
  assert.strictEqual(bad.status, 400);
  const saved = await putSettings(
    req('/api/admin/settings/notifications', 'PUT', { onboarding_form_recipients: 'Buyer@Motionz.ai, ops@motionz.ai', notify_assigned_csm: true }, adminCookie)
  );
  assert.deepStrictEqual((await saved.json()).notifications.onboarding_form_recipients, ['buyer@motionz.ai', 'ops@motionz.ai']);
  const csmCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm')}` };
  assert.strictEqual((await getSettings(req('/api/admin/settings/notifications', 'GET', undefined, csmCookie))).status, 403);
  console.log(' PASS: notification recipients are validated, normalized and admin-only.');

  // 5. Onboarding form submission: stored for the matched client; unmatched ones kept for review
  const formRes = await ghlWebhook(
    req('/api/webhooks/ghl', 'POST', {
      contact_id: 'wf-contact-form',
      email: 'john@abcroofing.com',
      'DBA Business Name': 'ABC Roofing',
      'What is your ideal client profile?': 'Homeowners 35-65',
      customData: { event: 'onboarding_form', secret: SECRET },
    })
  );
  assert.strictEqual((await formRes.json()).matched, true);
  const subs = await onboardingSubmissionRepository.listByTenant(DEMO_TENANT);
  assert.strictEqual(subs[0].answers['What is your ideal client profile?'], 'Homeowners 35-65');
  assert.strictEqual((subs[0].answers as any).secret, undefined, 'secret is never stored');
  assert.strictEqual((subs[0].answers as any).customData, undefined);

  await ghlWebhook(req('/api/webhooks/ghl', 'POST', { email: 'stranger@example.test', customData: { event: 'onboarding_form', secret: SECRET } }));
  const unmatched = await onboardingSubmissionRepository.listByTenant(null);
  assert.ok(unmatched.some((s) => s.submitter_email === 'stranger@example.test'), 'unmatched submission kept for admin review');

  const detail = await (await getAdminClient(req(`/api/admin/clients/${DEMO_TENANT}`, 'GET', undefined, adminCookie), { params: { id: DEMO_TENANT } })).json();
  assert.ok(detail.onboardingSubmissions.length >= 1, 'admin client detail includes onboarding answers');
  console.log(' PASS: onboarding form answers are stored per client, unmatched ones are queued.');

  // 6. Contracts and orders managed by admin
  const recordsUrl = `/api/admin/clients/${DEMO_TENANT}/records`;
  const p = { params: { id: DEMO_TENANT } };
  const badUrl = await postRecord(req(recordsUrl, 'POST', { kind: 'contract', title: 'Agreement', document_url: 'javascript:alert(1)' }, adminCookie), p);
  assert.strictEqual(badUrl.status, 400, 'non-https document links rejected');
  const contract = await (await postRecord(req(recordsUrl, 'POST', { kind: 'contract', title: 'Service Agreement', document_url: 'https://example.com/a.pdf', signed_at: '2026-09-10' }, adminCookie), p)).json();
  assert.ok(contract.success);
  const order = await (await postRecord(req(recordsUrl, 'POST', { kind: 'order', label: 'Yard signs', carrier: 'UPS' }, adminCookie), p)).json();
  const moved = await (await patchRecord(req(recordsUrl, 'PATCH', { kind: 'order', id: order.order.id, stage: 'shipped' }, adminCookie), p)).json();
  assert.strictEqual(moved.order.stage, 'shipped');
  const list = await (await getRecords(req(recordsUrl, 'GET', undefined, adminCookie), p)).json();
  assert.ok(list.contracts.some((c: any) => c.id === contract.contract.id));
  const del = await deleteRecord(req(`${recordsUrl}?kind=order&recordId=${order.order.id}`, 'DELETE', undefined, adminCookie), p);
  assert.strictEqual(del.status, 200);
  assert.strictEqual((await postRecord(req(recordsUrl, 'POST', { kind: 'order', label: 'x' }, csmCookie), p)).status, 403);
  console.log(' PASS: admin can attach contracts and manage orders; CSM cannot.');

  // 7. Phone validation
  assert.strictEqual(validatePhone('+1 (555) 234-5678'), '+1 (555) 234-5678');
  assert.throws(() => validatePhone('MotionzClient2026!'), /valid phone/);
  assert.throws(() => validatePhone('', { required: true }), /required/);
  assert.strictEqual(validatePhone(''), undefined);
  console.log(' PASS: phone validation rejects passwords and notes.');

  // 8. Roof math from Solar API data
  assert.strictEqual(degreesToPitch(26.57), '6/12');
  const roof = summarizeBuildingInsights(
    {
      imageryQuality: 'HIGH',
      imageryDate: { year: 2025, month: 4, day: 2 },
      solarPotential: {
        wholeRoofStats: { areaMeters2: 200, groundAreaMeters2: 180 },
        roofSegmentStats: [
          { pitchDegrees: 26.57, azimuthDegrees: 180, stats: { areaMeters2: 120, groundAreaMeters2: 107 } },
          { pitchDegrees: 26.57, azimuthDegrees: 0, stats: { areaMeters2: 80, groundAreaMeters2: 73 } },
        ],
      },
    },
    { address: 'x', formattedAddress: 'X', latitude: 1, longitude: 2 }
  );
  assert.strictEqual(roof.roofAreaSqFt, 2153);
  assert.strictEqual(roof.squares, 21.5);
  assert.strictEqual(roof.predominantPitch, '6/12');
  assert.strictEqual(roof.segments[0].facing, 'S');
  assert.strictEqual(roof.facets, 2);
  console.log(' PASS: roof squares and pitch are derived from Solar API segments.');

  delete process.env.GHL_WEBHOOK_SECRET;
  console.log('--- GHL Workflow, Settings & Records Tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
