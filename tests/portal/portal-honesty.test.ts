/**
 * FR-502: the portal never reports success when nothing happened and never invents data.
 * Covers the website change request flow and anonymous-write rejection on portal write APIs.
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById } from '../../src/lib/db';
import { createSessionToken } from '../../src/lib/auth/session';
import { POST as websiteUpdateHandler } from '../../src/app/api/portal/[clientId]/website-update/route';
import { GET as videoPrefGetHandler, POST as videoPrefPostHandler } from '../../src/app/api/portal/[clientId]/video-preference/route';
import { PATCH as profilePatchHandler } from '../../src/app/api/portal/[clientId]/profile/route';
import { websiteChangeRequestEmail } from '../../src/lib/email';

// Tests must never send real email.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY']) delete process.env[key];

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

function req(path: string, method: string, body?: unknown, session?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (session) headers.set('cookie', `motionz_session=${session}`);
  return new NextRequest(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Captures outgoing provider calls by pretending a Resend key is set and stubbing fetch. */
async function withCapturedEmail<T>(fn: () => Promise<T>): Promise<{ result: T; sent: any[] }> {
  const sent: any[] = [];
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key-not-real';
  globalThis.fetch = (async (url: any, init?: any) => {
    sent.push({ url: String(url), body: JSON.parse(init?.body || '{}') });
    return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await fn();
    return { result, sent };
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
}

async function run() {
  console.log('--- Portal honesty (FR-502) tests ---');
  resetStore();

  const tenant = await getTenantById('abc-roofing');
  assert(tenant, 'demo tenant must exist');
  const clientId = 'abc-roofing';
  const ctx = { params: { clientId } };

  const clientSession = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant!.id);
  const memberSession = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenant!.id);

  // 1. Website change request: anonymous writes are rejected (also on the demo tenant)
  for (const id of [clientId, 'demo']) {
    const res = await websiteUpdateHandler(
      req(`/api/portal/${id}/website-update`, 'POST', { title: 'x', description: 'y' }),
      { params: { clientId: id } }
    );
    assert.strictEqual(res.status, 401, `anonymous website-update on ${id} must be 401`);
  }
  console.log(' PASS: website-update rejects anonymous requests.');

  // 2. Website change request validation
  const auditCountBefore = getStore().auditLogs.length;
  const invalidBodies: Array<[string, unknown]> = [
    ['missing title', { description: 'Change the banner' }],
    ['blank title', { title: '   ', description: 'Change the banner' }],
    ['missing description', { title: 'Banner' }],
    ['title too long', { title: 'a'.repeat(201), description: 'Change the banner' }],
    ['description too long', { title: 'Banner', description: 'a'.repeat(5001) }],
    ['invalid url', { title: 'Banner', description: 'Change it', targetPageUrl: 'not a url' }],
    ['javascript url', { title: 'Banner', description: 'Change it', targetPageUrl: 'javascript:alert(1)' }],
  ];
  for (const [label, body] of invalidBodies) {
    const res = await websiteUpdateHandler(req(`/api/portal/${clientId}/website-update`, 'POST', body, clientSession), ctx);
    assert.strictEqual(res.status, 400, `${label} must be rejected with 400`);
    const data = await res.json();
    assert(!data.success, `${label} must not report success`);
  }
  assert.strictEqual(getStore().auditLogs.length, auditCountBefore, 'invalid requests must not be recorded');
  console.log(' PASS: website-update validates title, description and URL.');

  // 3. Valid request is recorded and emailed to the assigned CSM
  const { result: okRes, sent } = await withCapturedEmail(() =>
    websiteUpdateHandler(
      req(
        `/api/portal/${clientId}/website-update`,
        'POST',
        { title: 'Update header phone', description: 'Please change the header phone number.', targetPageUrl: 'abcroofing.com/contact', isUrgent: true },
        clientSession
      ),
      ctx
    )
  );
  assert.strictEqual(okRes.status, 200);
  const okData = await okRes.json();
  assert.strictEqual(okData.success, true);
  assert.strictEqual(okData.notified, 1, 'exactly the assigned CSM is emailed');
  const record = getStore().auditLogs.find((l) => l.action === 'client.website_change_requested');
  assert(record, 'request must be recorded in the audit log');
  assert.strictEqual(record!.actor_email, 'john@abcroofing.com');
  assert.strictEqual((record!.details as any).targetPageUrl, 'https://abcroofing.com/contact');
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(sent[0].body.to, ['csm@motionz.ai']);
  assert(String(sent[0].body.subject).includes('[Urgent]'));
  console.log(' PASS: website-update records the request and emails the assigned CSM.');

  // 4. Without an assigned CSM, every admin is emailed instead
  getStore().csmAssignments = getStore().csmAssignments.filter((a) => a.tenant_id !== tenant!.id);
  const { result: adminRes, sent: adminSent } = await withCapturedEmail(() =>
    websiteUpdateHandler(
      req(`/api/portal/${clientId}/website-update`, 'POST', { title: 'Swap photo', description: 'Use the new crew photo.' }, clientSession),
      ctx
    )
  );
  assert.strictEqual(adminRes.status, 200);
  const adminRecipients = adminSent.flatMap((s) => s.body.to);
  const admins = getStore().users.filter((u) => u.role === 'admin' && u.status !== 'suspended').map((u) => u.email);
  assert(admins.length > 0);
  assert.deepStrictEqual(adminRecipients.sort(), admins.sort());
  console.log(' PASS: website-update falls back to emailing admins when no CSM is assigned.');

  // 5. Delivery failure is reported honestly (request recorded, notified = 0)
  const devRes = await websiteUpdateHandler(
    req(`/api/portal/${clientId}/website-update`, 'POST', { title: 'Fix typo', description: 'Typo on services page.' }, clientSession),
    ctx
  );
  const devData = await devRes.json();
  assert.strictEqual(devRes.status, 200);
  assert.strictEqual(devData.notified, 0);
  assert(!/emailed/i.test(devData.message), 'must not claim an email was sent when none was');
  console.log(' PASS: website-update does not claim notification when no email was delivered.');

  // 6. Video preference: anonymous write rejected, member write rejected, no invented names on GET
  const anonPref = await videoPrefPostHandler(
    req(`/api/portal/${clientId}/video-preference`, 'POST', { video_preference: 'ai_video' }),
    ctx
  );
  assert.strictEqual(anonPref.status, 401);
  const anonDemoPref = await videoPrefPostHandler(
    req('/api/portal/demo/video-preference', 'POST', { video_preference: 'ai_video' }),
    { params: { clientId: 'demo' } }
  );
  assert.strictEqual(anonDemoPref.status, 401);
  const memberPref = await videoPrefPostHandler(
    req(`/api/portal/${clientId}/video-preference`, 'POST', { video_preference: 'self_filmed' }, memberSession),
    ctx
  );
  assert.strictEqual(memberPref.status, 403);
  getStore().clientScriptPreferences = [];
  const storedTenant = getStore().tenants.find((t) => t.id === tenant!.id)!;
  storedTenant.primary_contact_name = undefined;
  const prefGet = await videoPrefGetHandler(req(`/api/portal/${clientId}/video-preference`, 'GET', undefined, clientSession), ctx);
  const prefData = await prefGet.json();
  assert.strictEqual(prefData.preference, null, 'no saved preference is reported as null');
  assert.strictEqual(prefData.defaults.custom_company, tenant!.name);
  assert.strictEqual(prefData.defaults.custom_name, '', 'missing contact name stays empty, never a placeholder person');
  console.log(' PASS: video-preference rejects anonymous/member writes and invents no defaults.');

  // 7. Profile: anonymous write rejected (tenant and demo)
  for (const id of [clientId, 'demo']) {
    const res = await profilePatchHandler(
      req(`/api/portal/${id}/profile`, 'PATCH', { name: 'Hijacked Roofing' }),
      { params: { clientId: id } }
    );
    assert.strictEqual(res.status, 401, `anonymous profile write on ${id} must be 401`);
  }
  assert.strictEqual((await getTenantById('abc-roofing'))!.name, tenant!.name, 'profile must be unchanged');
  console.log(' PASS: profile rejects anonymous writes.');

  // 8. Email template is plain text-first and escapes client input
  const email = websiteChangeRequestEmail({
    to: 'csm@motionz.ai',
    companyName: 'ABC <Roofing>',
    requestedBy: 'john@abcroofing.com',
    title: 'Header',
    description: '<script>x</script>',
    portalUrl: 'http://localhost:3000/admin/clients/1',
  });
  assert(!email.html.includes('<script>x</script>'));
  assert(email.text.includes('<script>x</script>'));
  console.log(' PASS: website change email escapes client input.');

  console.log('All portal honesty tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
