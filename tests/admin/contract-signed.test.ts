/**
 * Contract: a CSM Manager marks an attached contract as signed (with a date), changes the date, or
 * marks it as not signed, for contracts signed outside the portal. The client's Contract page and
 * Home read the same signed date.
 */
import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database, Google or email.
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'BREVO_API_KEY',
  'GOOGLE_SHEETS_SCRIPT_URL',
  'GOOGLE_SHEETS_SCRIPT_SECRET',
]) {
  delete process.env[key];
}

const BASE = 'http://localhost:3000';

async function run() {
  console.log('--- Contract: mark as signed / not signed tests ---');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { GET: getRecords, POST: postRecord, PATCH: patchRecord } = await import('../../src/app/api/admin/clients/[id]/records/route');
  const { GET: getPortalContracts } = await import('../../src/app/api/portal/[clientId]/contracts/route');
  const { GET: getPortalData } = await import('../../src/app/api/portal/[clientId]/data/route');
  const { GET: getAdminClients } = await import('../../src/app/api/admin/clients/route');
  const { auditActionLabel } = await import('../../src/lib/utils/log-labels');

  resetStore();
  const store = getStore();
  const DEMO = store.tenants[0].id;
  store.contracts = store.contracts.filter((c) => c.tenant_id !== DEMO);

  const cookie = (token: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${token}` });
  const admin = cookie(createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin'));
  const csm = cookie(createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm'));
  const client = cookie(createSessionToken('user-client-1', 'john@abcroofing.com', 'client', DEMO));

  const req = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(`${BASE}${path}`, {
      method,
      headers: new Headers({ 'content-type': 'application/json', ...headers }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const path = `/api/admin/clients/${DEMO}/records`;
  const patch = async (body: unknown, headers: Record<string, string> = admin, tenantId = DEMO) => {
    const res = await patchRecord(req(`/api/admin/clients/${tenantId}/records`, 'PATCH', body, headers), { params: { id: tenantId } });
    return { status: res.status, json: await res.json() };
  };
  const audits = () => store.auditLogs.filter((l) => l.action === 'contract.signed_changed');
  const clientContract = async () => {
    const res = await getPortalContracts(req(`/api/portal/${DEMO}/contracts`, 'GET', undefined, client), { params: { clientId: DEMO } });
    assert.strictEqual(res.status, 200);
    return (await res.json()).contracts as any[];
  };
  const homeContracts = async () => {
    const res = await getPortalData(req(`/api/portal/${DEMO}/data`, 'GET', undefined, client), { params: { clientId: DEMO } });
    assert.strictEqual(res.status, 200);
    return ((await res.json()).contracts || []) as any[];
  };
  const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // A contract attached without a signed date (the way a GoHighLevel document link is added today).
  const attached = await postRecord(
    req(path, 'POST', { kind: 'contract', title: 'Service Agreement', document_url: 'https://example.test/contract' }, admin),
    { params: { id: DEMO } }
  );
  assert.strictEqual(attached.status, 200);
  const contractId = (await attached.json()).contract.id as string;
  assert.strictEqual((await clientContract())[0].signed_at, undefined, 'the client sees it as awaiting signature');
  assert.ok(!(await homeContracts()).some((c) => c.signed_at), 'Home has no signed contract yet');

  // 1. Only a CSM Manager may do this
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: day(0) }, {})).status, 401);
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: day(0) }, csm)).status, 403, 'a CSM cannot mark a contract');
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: day(0) }, client)).status, 403, 'a client cannot mark a contract');
  assert.strictEqual(store.contracts.find((c) => c.id === contractId)!.signed_at, undefined);
  assert.strictEqual(audits().length, 0);
  console.log(' PASS: only a CSM Manager can mark a contract as signed.');

  // 2. Validation
  assert.strictEqual((await patch({ contractId, action: 'something_else', signedAt: day(0) })).status, 400);
  assert.strictEqual((await patch({ action: 'set_signed', signedAt: day(0) })).status, 400, 'a contract must be named');
  const notADate = await patch({ contractId, action: 'set_signed', signedAt: 'last tuesday' });
  assert.strictEqual(notADate.status, 400);
  assert.strictEqual(notADate.json.error, 'Signed date is not a valid date.');
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: 20260101 })).status, 400, 'a date that is not text is refused');
  const future = await patch({ contractId, action: 'set_signed', signedAt: day(3) });
  assert.strictEqual(future.status, 400);
  assert.strictEqual(future.json.error, 'The signed date cannot be in the future.');
  assert.strictEqual((await patch({ contractId: 'no-such-contract', action: 'set_signed', signedAt: day(0) })).status, 404);
  // A contract cannot be reached through another client's address.
  const other = await createTenant({ name: 'Other Roofing Co', slug: 'other-roofing-signed', primary_email: 'owner@other-roofing.test' } as any);
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: day(0) }, admin, other.id)).status, 404);
  assert.strictEqual(store.contracts.find((c) => c.id === contractId)!.signed_at, undefined, 'refused requests change nothing');
  assert.strictEqual(audits().length, 0, 'refused requests are not audited');
  console.log(' PASS: a bad action, a bad or future date and an unknown contract are refused.');

  // 3. Mark as signed (today, the default in the form)
  const today = day(0);
  const signed = await patch({ contractId, action: 'set_signed', signedAt: today });
  assert.strictEqual(signed.status, 200);
  assert.strictEqual(signed.json.contract.signed_at.slice(0, 10), today);
  assert.strictEqual(audits().length, 1);
  assert.strictEqual(audits()[0].actor_email, 'admin@motionz.ai');
  assert.strictEqual(audits()[0].tenant_id, DEMO);
  assert.strictEqual(audits()[0].resource_id, contractId);
  assert.deepStrictEqual(audits()[0].details, { title: 'Service Agreement', previousSignedOn: 'Not signed', signedOn: today });
  assert.strictEqual(auditActionLabel('contract.signed_changed'), 'Contract marked as signed or not signed');
  // The client's Contract page and Home now read it as signed.
  assert.strictEqual((await clientContract())[0].signed_at.slice(0, 10), today, 'the client’s Contract page shows Signed');
  assert.ok((await homeContracts()).some((c) => c.signed_at), 'Home’s contract tile reads it as signed');
  const list = await getRecords(req(path, 'GET', undefined, admin), { params: { id: DEMO } });
  assert.strictEqual((await list.json()).contracts[0].signed_at.slice(0, 10), today);
  console.log(' PASS: marking as signed saves the date, is audited, and the client sees Signed.');

  // 4. Change the date; saving the same date again writes no second entry
  const earlier = day(-10);
  const changed = await patch({ contractId, action: 'set_signed', signedAt: earlier });
  assert.strictEqual(changed.status, 200);
  assert.strictEqual((await clientContract())[0].signed_at.slice(0, 10), earlier);
  assert.strictEqual(audits().length, 2);
  assert.deepStrictEqual(audits()[0].details, { title: 'Service Agreement', previousSignedOn: today, signedOn: earlier });
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: earlier })).status, 200);
  assert.strictEqual(audits().length, 2, 'saving the same date again is not a change');
  // Tomorrow is allowed: an admin's local date can be a day ahead of the server's.
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() })).status, 200);
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: earlier })).status, 200);
  console.log(' PASS: the signed date can be changed, with the old and new value in the audit entry.');

  // 5. Mark as not signed
  const auditsBefore = audits().length;
  const unsigned = await patch({ contractId, action: 'set_signed', signedAt: null });
  assert.strictEqual(unsigned.status, 200);
  assert.ok(!unsigned.json.contract.signed_at);
  assert.ok(!(await clientContract())[0].signed_at, 'the client sees Awaiting signature again');
  assert.ok(!(await homeContracts()).some((c) => c.signed_at));
  assert.strictEqual(audits().length, auditsBefore + 1);
  assert.deepStrictEqual(audits()[0].details, { title: 'Service Agreement', previousSignedOn: earlier, signedOn: 'Not signed' });
  assert.strictEqual((await patch({ contractId, action: 'set_signed', signedAt: '' })).status, 200, 'an empty date also means not signed');
  assert.strictEqual(audits().length, auditsBefore + 1);
  console.log(' PASS: marking as not signed clears the date for the client and is audited.');

  // 6. The staff reminder is about attachment only: an unsigned attached contract raises none
  const clients = await getAdminClients(req('/api/admin/clients', 'GET', undefined, admin));
  const row = ((await clients.json()).tenants as any[]).find((c) => c.id === DEMO);
  assert.strictEqual(row.hasContract, true, 'an attached but unsigned contract is not "No contract attached"');
  console.log(' PASS: the "No contract attached" reminder is unchanged.');

  console.log('--- Contract signed tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
