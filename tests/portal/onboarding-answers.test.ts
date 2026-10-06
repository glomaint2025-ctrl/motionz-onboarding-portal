/**
 * The client can read their own onboarding form answers:
 *  - the owner gets their own submissions, newest first, at most 10
 *  - another client's submissions and ones not linked to any client are never returned
 *  - webhook/internal fields are never in the answers, even on an old row that still has them
 *  - a team member without Setup Progress gets 403; signed-out gets 401; staff may look
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById } from '../../src/lib/db';
import { createSessionToken } from '../../src/lib/auth/session';
import { featureToggleRepository, onboardingSubmissionRepository } from '../../src/lib/db/repositories';
import { GET as answersGet } from '../../src/app/api/portal/[clientId]/onboarding-answers/route';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const clientId = 'abc-roofing';
const ctx = { params: { clientId } };
const path = `/api/portal/${clientId}/onboarding-answers`;
const SECRET = 'whsec-never-show-this';

function req(session?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (session) headers.set('cookie', `motionz_session=${session}`);
  return new NextRequest(`${BASE_URL}${path}`, { method: 'GET', headers });
}

async function get(session?: string) {
  const res = await answersGet(req(session), ctx);
  return { status: res.status, body: await res.json() };
}

async function run() {
  console.log('--- Portal onboarding answers tests ---');
  resetStore();

  const tenant = await getTenantById(clientId);
  assert(tenant, 'demo tenant must exist');
  const store = getStore();
  const owner = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant!.id);
  const member = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenant!.id);
  const admin = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const assignedCsm = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const otherCsm = createSessionToken('user-csm-2', 'csm.agent@motionz.ai', 'csm');
  const outsider = createSessionToken('user-outsider', 'boss@otherroofing.test', 'client', 'some-other-tenant');

  // ---- Nothing sent yet ----------------------------------------------------------------------
  const empty = await get(owner);
  assert.strictEqual(empty.status, 200);
  assert.deepStrictEqual(empty.body.submissions, []);
  console.log(' PASS: a client who has not sent the form gets an empty list.');

  // ---- Own submissions, newest first ---------------------------------------------------------
  const older = await onboardingSubmissionRepository.create({
    tenant_id: tenant!.id,
    submitter_email: 'john@abcroofing.com',
    ghl_contact_id: 'ghl-contact-internal-1',
    answers: { 'Service area': 'Lafayette', 'Brand colours': 'Red and white' },
  });
  // Seen by the store as sent an hour earlier.
  store.onboardingSubmissions.find((s) => s.id === older.id)!.submitted_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const newer = await onboardingSubmissionRepository.create({
    tenant_id: tenant!.id,
    submitter_email: 'sarah@abcroofing.com',
    ghl_contact_id: 'ghl-contact-internal-2',
    // An old row that still carries webhook fields: none of them may reach the client.
    answers: {
      'Service area': 'Lafayette and Baton Rouge',
      'Years in business': 12,
      secret: SECRET,
      customData: { event: 'onboarding_form', secret: SECRET },
      contact_id: 'ghl-contact-internal-2',
      locationId: 'loc_ghl_demo_abc',
      contact: { id: 'ghl-contact-internal-2' },
      workflow: { id: 'wf-1', name: 'Onboarding form' },
    } as Record<string, unknown>,
  });

  // Another client's answers and answers not linked to a client yet.
  await onboardingSubmissionRepository.create({
    tenant_id: 'some-other-tenant',
    submitter_email: 'boss@otherroofing.test',
    answers: { 'Service area': 'OTHER-CLIENT-ONLY' },
  });
  await onboardingSubmissionRepository.create({
    tenant_id: null,
    submitter_email: 'newco@example.test',
    answers: { 'Service area': 'UNMATCHED-ONLY' },
  });

  const own = await get(owner);
  assert.strictEqual(own.status, 200);
  assert.deepStrictEqual(
    own.body.submissions.map((s: any) => s.id),
    [newer.id, older.id],
    'own submissions only, newest first'
  );
  assert.deepStrictEqual(Object.keys(own.body.submissions[0]).sort(), ['answers', 'id', 'submittedAt', 'submitterEmail']);
  assert.strictEqual(own.body.submissions[0].submitterEmail, 'sarah@abcroofing.com');
  assert.strictEqual(own.body.submissions[0].submittedAt, newer.submitted_at);
  assert.deepStrictEqual(own.body.submissions[1].answers, { 'Service area': 'Lafayette', 'Brand colours': 'Red and white' });
  console.log(' PASS: the owner gets their own submissions, newest first.');

  const ownText = JSON.stringify(own.body);
  assert.ok(!ownText.includes('OTHER-CLIENT-ONLY'), "another client's answers are never returned");
  assert.ok(!ownText.includes('UNMATCHED-ONLY'), 'answers not linked to a client are never returned');
  assert.ok(!ownText.includes('boss@otherroofing.test') && !ownText.includes('newco@example.test'));
  console.log(" PASS: another client's and unmatched submissions are never returned.");

  assert.deepStrictEqual(own.body.submissions[0].answers, {
    'Service area': 'Lafayette and Baton Rouge',
    'Years in business': '12',
  });
  for (const hidden of [SECRET, 'ghl-contact-internal', 'loc_ghl_demo_abc', 'customData', 'tenant_id', 'ghl_contact_id', 'wf-1']) {
    assert.ok(!ownText.includes(hidden), `"${hidden}" must not reach the client`);
  }
  console.log(' PASS: secrets and internal fields are stripped from the answers.');

  // ---- At most 10 ----------------------------------------------------------------------------
  for (let i = 0; i < 12; i++) {
    await onboardingSubmissionRepository.create({
      tenant_id: tenant!.id,
      submitter_email: 'john@abcroofing.com',
      answers: { 'Service area': `Round ${i}` },
    });
  }
  const capped = await get(owner);
  assert.strictEqual(capped.body.submissions.length, 10);
  assert.strictEqual(capped.body.submissions[0].answers['Service area'], 'Round 11', 'the newest is first');
  console.log(' PASS: at most 10 submissions are returned.');

  // ---- Who may read --------------------------------------------------------------------------
  assert.strictEqual((await get()).status, 401, 'signed-out is refused');
  const outsiderRes = await get(outsider);
  assert.strictEqual(outsiderRes.status, 403, "another client cannot read this client's answers");
  assert.strictEqual(outsiderRes.body.submissions, undefined);
  console.log(' PASS: signed-out gets 401 and another client gets 403.');

  // A team member with Setup Progress may read; without it they may not.
  assert.strictEqual((await get(member)).status, 200);
  const memberUser = store.users.find((u) => u.id === 'user-member-1')!;
  const allowedBefore = memberUser.allowed_modules;
  memberUser.allowed_modules = (allowedBefore || []).filter((m) => m !== 'onboarding');
  const blocked = await get(member);
  assert.strictEqual(blocked.status, 403, 'a member without Setup Progress is refused');
  assert.strictEqual(blocked.body.submissions, undefined);
  memberUser.allowed_modules = allowedBefore;
  console.log(' PASS: a team member without Setup Progress gets 403.');

  // Setup Progress switched off for the whole client: nobody on the client side reads it.
  await featureToggleRepository.setToggle(tenant!.id, 'onboarding', false);
  assert.strictEqual((await get(owner)).status, 403);
  assert.strictEqual((await get(admin)).status, 200, 'staff are not blocked by the client switch');
  await featureToggleRepository.setToggle(tenant!.id, 'onboarding', true);
  console.log(' PASS: the Setup Progress switch gates the answers for the client.');

  // Staff viewing the portal.
  const adminRes = await get(admin);
  assert.strictEqual(adminRes.status, 200);
  assert.strictEqual(adminRes.body.submissions.length, 10);
  assert.strictEqual((await get(assignedCsm)).status, 200, 'the assigned CSM may look');
  assert.strictEqual((await get(otherCsm)).status, 403, 'a CSM of another client may not');
  console.log(' PASS: admin and the assigned CSM may read; an unassigned CSM may not.');

  // Suspended client: the owner is locked out like on every other portal route.
  const storedTenant = store.tenants.find((t) => t.id === tenant!.id)!;
  storedTenant.status = 'suspended';
  assert.strictEqual((await get(owner)).status, 403);
  storedTenant.status = 'active';
  console.log(' PASS: a suspended client cannot read the answers.');

  console.log('All portal onboarding answers tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
