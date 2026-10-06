/**
 * Two client requests:
 *  1. Staff are reminded while a client has no contract attached (admin list, CSM list, CSM setup
 *     page, admin dashboard). Clients never receive the flag.
 *  2. Each review team has its own notification list: onboarding form, website change requests, lead forms.
 */
import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database or send real email.
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'BREVO_API_KEY',
  'MEDIA_BUYER_EMAIL',
  'EMAIL_TEST_REDIRECT_TO',
]) {
  delete process.env[key];
}

const BASE = 'http://localhost:3000';

async function run() {
  console.log('--- Contract reminder and notification recipients tests ---');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { appSettingsRepository, contractRepository, tenantRepository } = await import('../../src/lib/db/repositories');
  const { leadFormRecipients, uniqueEmails } = await import('../../src/lib/onboarding/submissions');
  const { GET: getAdminClients } = await import('../../src/app/api/admin/clients/route');
  const { GET: getCsmClients } = await import('../../src/app/api/csm/clients/route');
  const { GET: getCsmSetup } = await import('../../src/app/api/csm/clients/[id]/setup/route');
  const { GET: getDashboard } = await import('../../src/app/api/admin/dashboard/route');
  const { POST: postRecord, DELETE: deleteRecord } = await import('../../src/app/api/admin/clients/[id]/records/route');
  const { GET: getPortalData } = await import('../../src/app/api/portal/[clientId]/data/route');
  const { GET: getPortalContracts } = await import('../../src/app/api/portal/[clientId]/contracts/route');
  const { POST: postWebsiteRequest } = await import('../../src/app/api/portal/[clientId]/website-update/route');
  const { GET: getSettings, PUT: putSettings } = await import('../../src/app/api/admin/settings/notifications/route');

  resetStore();
  const store = getStore();
  const DEMO = store.tenants[0].id;

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

  // The demo client has a contract and a CSM. These two do not have a contract.
  const bare = await createTenant({ name: 'No Paper Roofing', slug: 'no-paper', primary_email: 'owner@nopaper.example', csm_user_id: 'user-csm-1' });
  const gone = await createTenant({ name: 'Archived Roofing', slug: 'archived-roofing', primary_email: 'owner@archived.example' });
  await tenantRepository.softDelete(gone.id);

  // ───────────── 1. Contract reminder ─────────────
  const adminList = await (await getAdminClients(req('/api/admin/clients', 'GET', undefined, admin))).json();
  const adminRow = (id: string) => adminList.tenants.find((t: any) => t.id === id);
  assert.strictEqual(adminRow(DEMO).hasContract, true, 'admin list: a client with a contract');
  assert.strictEqual(adminRow(bare.id).hasContract, false, 'admin list: a client without a contract');
  assert.strictEqual(adminRow(gone.id).hasContract, false, 'admin list: the flag is a boolean for archived clients too');
  console.log(' PASS: the admin client list says which clients have a contract.');

  const csmList = await (await getCsmClients(req('/api/csm/clients', 'GET', undefined, csm))).json();
  const csmRow = (id: string) => csmList.tenants.find((t: any) => t.id === id);
  assert.strictEqual(csmRow(DEMO).hasContract, true, 'CSM list: a client with a contract');
  assert.strictEqual(csmRow(bare.id).hasContract, false, 'CSM list: a client without a contract');
  console.log(' PASS: the CSM client list says which clients have a contract.');

  const setupOf = async (id: string) => (await getCsmSetup(req(`/api/csm/clients/${id}/setup`, 'GET', undefined, csm), { params: { id } })).json();
  assert.strictEqual((await setupOf(DEMO)).hasContract, true, 'CSM setup data: has a contract');
  assert.strictEqual((await setupOf(bare.id)).hasContract, false, 'CSM setup data: no contract');
  console.log(' PASS: the CSM setup page data carries hasContract.');

  const dashboard = async () => (await getDashboard(req('/api/admin/dashboard', 'GET', undefined, admin))).json();
  assert.deepStrictEqual((await dashboard()).withoutContract, [{ id: bare.id, name: 'No Paper Roofing' }], 'dashboard lists live clients without a contract only');
  console.log(' PASS: the dashboard lists live clients without a contract (archived ones are left out).');

  // A CSM cannot attach a contract, which is why the CSM page says "ask an admin".
  const contractBody = { kind: 'contract', title: 'Service Agreement', document_url: 'https://example.com/contract.pdf' };
  const csmAttach = await postRecord(req(`/api/admin/clients/${bare.id}/records`, 'POST', contractBody, csm), { params: { id: bare.id } });
  assert.strictEqual(csmAttach.status, 403, 'a CSM cannot attach a contract');
  const attached = await postRecord(req(`/api/admin/clients/${bare.id}/records`, 'POST', contractBody, admin), { params: { id: bare.id } });
  assert.strictEqual(attached.status, 200, 'an admin attaches the contract');
  const contractId = (await attached.json()).contract.id;

  assert.deepStrictEqual((await dashboard()).withoutContract, [], 'the dashboard card empties once the contract is attached');
  assert.strictEqual((await setupOf(bare.id)).hasContract, true, 'the CSM reminder goes away once the contract is attached');
  assert((await contractRepository.listTenantIdsWithContract()).has(bare.id), 'the one-query lookup includes the client');

  const removed = await deleteRecord(req(`/api/admin/clients/${bare.id}/records?kind=contract&recordId=${contractId}`, 'DELETE', undefined, admin), {
    params: { id: bare.id },
  });
  assert.strictEqual(removed.status, 200);
  assert.strictEqual((await dashboard()).withoutContract.length, 1, 'removing the contract brings the reminder back');
  console.log(' PASS: attaching (admin only) clears the reminder; removing brings it back.');

  // Clients never receive the flag.
  for (const [label, handler, path] of [
    ['portal data', getPortalData, `/api/portal/${DEMO}/data`],
    ['portal contracts', getPortalContracts, `/api/portal/${DEMO}/contracts`],
  ] as const) {
    const res = await handler(req(path, 'GET', undefined, client), { params: { clientId: DEMO } });
    assert.strictEqual(res.status, 200, `${label} loads for the client`);
    assert(!JSON.stringify(await res.json()).includes('hasContract'), `${label} must not carry the staff-only flag`);
  }
  console.log(' PASS: portal APIs do not carry hasContract.');

  // Staff-only APIs stay staff-only.
  assert.strictEqual((await getAdminClients(req('/api/admin/clients', 'GET', undefined, csm))).status, 403, 'a CSM cannot read the admin list');
  assert.strictEqual((await getDashboard(req('/api/admin/dashboard', 'GET', undefined, csm))).status, 403, 'a CSM cannot read the dashboard');
  for (const who of [client, {}]) {
    assert.notStrictEqual((await getCsmClients(req('/api/csm/clients', 'GET', undefined, who))).status, 200, 'clients and visitors cannot read the CSM list');
    const setupRes = await getCsmSetup(req(`/api/csm/clients/${DEMO}/setup`, 'GET', undefined, who), { params: { id: DEMO } });
    assert.notStrictEqual(setupRes.status, 200, 'clients and visitors cannot read the CSM setup data');
  }
  console.log(' PASS: non-staff are refused.');

  // ───────────── 2. Notification recipients ─────────────
  const settingsUrl = '/api/admin/settings/notifications';
  const readSettings = async () => (await (await getSettings(req(settingsUrl, 'GET', undefined, admin))).json()).notifications;

  // Nothing stored yet: every list is empty.
  assert.deepStrictEqual(await readSettings(), {
    onboarding_form_recipients: [],
    notify_assigned_csm: true,
    website_request_recipients: [],
    lead_form_recipients: [],
  });

  // A value saved before the new lists existed still reads correctly.
  await appSettingsRepository.set('notifications', { onboarding_form_recipients: ['buyer@motionz.ai'], notify_assigned_csm: false }, 'test');
  assert.deepStrictEqual(await readSettings(), {
    onboarding_form_recipients: ['buyer@motionz.ai'],
    notify_assigned_csm: false,
    website_request_recipients: [],
    lead_form_recipients: [],
  });
  console.log(' PASS: GET returns the new lists, empty for a value stored before they existed.');

  // Refused for everyone but admins.
  for (const who of [csm, client, {}]) {
    assert.notStrictEqual((await getSettings(req(settingsUrl, 'GET', undefined, who))).status, 200, 'non-admin GET refused');
    const res = await putSettings(req(settingsUrl, 'PUT', { website_request_recipients: 'x@motionz.ai' }, who));
    assert([401, 403].includes(res.status), 'non-admin PUT refused');
  }
  assert.deepStrictEqual((await readSettings()).website_request_recipients, [], 'a refused save changes nothing');
  console.log(' PASS: non-admins cannot read or change notification settings.');

  // Each list is validated and the bad address is named, with the box it came from.
  for (const key of ['onboarding_form_recipients', 'website_request_recipients', 'lead_form_recipients']) {
    const bad = await putSettings(req(settingsUrl, 'PUT', { onboarding_form_recipients: 'buyer@motionz.ai', [key]: 'ok@motionz.ai, not-an-email' }, admin));
    assert.strictEqual(bad.status, 400, `${key}: a bad address is refused`);
    const badJson = await bad.json();
    assert.match(badJson.error, /Invalid email address: not-an-email/, `${key}: the bad address is named`);
    assert.strictEqual(badJson.field, key, `${key}: the response names the list`);

    const many = Array.from({ length: 21 }, (_, i) => `person${i}@motionz.ai`).join(', ');
    const tooMany = await putSettings(req(settingsUrl, 'PUT', { onboarding_form_recipients: 'buyer@motionz.ai', [key]: many }, admin));
    assert.strictEqual(tooMany.status, 400, `${key}: more than 20 addresses is refused`);
    assert.strictEqual((await tooMany.json()).field, key);
  }
  assert.deepStrictEqual((await readSettings()).onboarding_form_recipients, ['buyer@motionz.ai'], 'a refused save changes nothing');

  const auditsBefore = store.auditLogs.filter((l) => l.action === 'settings.notifications_updated').length;
  const saved = await putSettings(
    req(
      settingsUrl,
      'PUT',
      {
        onboarding_form_recipients: 'buyer@motionz.ai',
        website_request_recipients: 'Web@Motionz.ai, web@motionz.ai; csm@motionz.ai',
        lead_form_recipients: ['Leads@Motionz.ai'],
        notify_assigned_csm: false,
      },
      admin
    )
  );
  assert.strictEqual(saved.status, 200);
  const expected = {
    onboarding_form_recipients: ['buyer@motionz.ai'],
    website_request_recipients: ['web@motionz.ai', 'csm@motionz.ai'],
    lead_form_recipients: ['leads@motionz.ai'],
    notify_assigned_csm: false,
  };
  assert.deepStrictEqual((await saved.json()).notifications, expected, 'lists are lower-cased and de-duplicated');
  assert.deepStrictEqual(await readSettings(), expected, 'the saved lists are read back');

  const audit = store.auditLogs.filter((l) => l.action === 'settings.notifications_updated');
  assert.strictEqual(audit.length, auditsBefore + 1, 'one audit entry per save');
  const lastAudit = audit[audit.length - 1];
  assert.deepStrictEqual(lastAudit.details?.changed, ['website_request_recipients', 'lead_form_recipients'], 'the audit entry lists only the lists that changed');

  // An older caller that sends only the onboarding list does not wipe the other two.
  const older = await putSettings(req(settingsUrl, 'PUT', { onboarding_form_recipients: 'buyer@motionz.ai, ops@motionz.ai', notify_assigned_csm: true }, admin));
  assert.strictEqual(older.status, 200);
  assert.deepStrictEqual(await readSettings(), {
    ...expected,
    onboarding_form_recipients: ['buyer@motionz.ai', 'ops@motionz.ai'],
    notify_assigned_csm: true,
  });
  console.log(' PASS: PUT validates each list, saves all three, audits what changed and keeps lists it was not sent.');

  // The helper the future lead forms will call.
  assert.deepStrictEqual(await leadFormRecipients(), ['leads@motionz.ai'], 'no client: the lead team only');
  assert.deepStrictEqual((await leadFormRecipients({ id: DEMO })).sort(), ['csm@motionz.ai', 'leads@motionz.ai'], 'with a client: the lead team plus the CSM');
  await appSettingsRepository.set('notifications', { ...(await appSettingsRepository.get('notifications')), notify_assigned_csm: false }, 'test');
  assert.deepStrictEqual(await leadFormRecipients({ id: DEMO }), ['leads@motionz.ai'], 'CSM box unticked: the lead team only');
  assert.deepStrictEqual(uniqueEmails(['A@x.com', ' a@x.com ', ''], [null, undefined, 'b@x.com']), ['a@x.com', 'b@x.com']);
  console.log(' PASS: leadFormRecipients() gives the lead team, plus the CSM when that box is ticked.');

  // ───────────── 3. Website change requests ─────────────
  const sendRequest = (tenantId: string, session: Record<string, string>) =>
    withCapturedEmail(() =>
      postWebsiteRequest(req(`/api/portal/${tenantId}/website-update`, 'POST', { title: 'Update phone', description: 'Please change the phone number.' }, session), {
        params: { clientId: tenantId },
      })
    );
  const setWebsiteTeam = async (list: string[]) =>
    appSettingsRepository.set('notifications', { ...(await appSettingsRepository.get('notifications')), website_request_recipients: list }, 'test');

  // Before: no website team set. The assigned CSM only, exactly as it was.
  await setWebsiteTeam([]);
  const before = await sendRequest(DEMO, client);
  assert.strictEqual(before.result.status, 200);
  assert.deepStrictEqual(before.recipients, ['csm@motionz.ai'], 'empty list: only the assigned CSM, as before');
  assert.strictEqual((await before.result.json()).notified, 1);

  // After: the website team is added. The CSM is on both lists (in different capitals) and is emailed once.
  // The CSM box is still unticked here: it does not remove the CSM from website requests.
  await setWebsiteTeam(['web@motionz.ai', 'CSM@Motionz.ai', 'web2@motionz.ai']);
  const after = await sendRequest(DEMO, client);
  assert.deepStrictEqual(after.recipients, ['csm@motionz.ai', 'web2@motionz.ai', 'web@motionz.ai'], 'the previous recipient plus the website team, each once');
  assert.strictEqual((await after.result.json()).notified, 3);

  // A client with no CSM: every admin, as before, plus the website team.
  const noCsm = await createTenant({ name: 'No CSM Roofing', slug: 'no-csm', primary_email: 'owner@nocsm.example' });
  const admins = store.users.filter((u) => u.role === 'admin' && u.email).map((u) => u.email.toLowerCase());
  await setWebsiteTeam([]);
  const adminsOnly = await sendRequest(noCsm.id, admin);
  assert.strictEqual(adminsOnly.result.status, 200);
  assert.deepStrictEqual(adminsOnly.recipients, [...admins].sort(), 'no CSM and an empty list: every admin, as before');
  await setWebsiteTeam(['web@motionz.ai', 'ADMIN@motionz.ai']);
  const adminsPlusTeam = await sendRequest(noCsm.id, admin);
  assert.deepStrictEqual(adminsPlusTeam.recipients, Array.from(new Set([...admins, 'web@motionz.ai'])).sort(), 'no CSM: every admin plus the website team, each once');
  console.log(' PASS: website change requests go to the previous recipients plus the website team, each address once.');

  console.log('Contract reminder and notification recipients tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
