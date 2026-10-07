import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running Admin Client Delete Tests (PATCH /api/admin/clients/[id] delete_client_permanently)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { csmAssignmentRepository, userRepository, passwordResetRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { requireAuth, PORTAL_DELETED_MESSAGE } = await import('../../src/lib/auth/guard');
  const { AUDIT_ACTION_LABELS, auditActionLabel } = await import('../../src/lib/utils/log-labels');
  const { getMockStoredFiles, getMockOnboardingFiles, getMockStoredAvatars } = await import('../../src/lib/storage');
  const { confirmNameMatches } = await import('../../src/lib/admin/delete-client');
  const { PATCH: patchClient, DELETE: archiveClient, GET: getClient } = await import('../../src/app/api/admin/clients/[id]/route');
  const { POST: login } = await import('../../src/app/api/auth/login/route');
  const { GET: portalLeads } = await import('../../src/app/api/portal/[clientId]/leads/route');

  resetStore();
  const store = getStore() as any;

  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const abc = store.tenants.find((t: any) => t.slug === 'abc-roofing')!.id as string;
  const abcOwnerCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', abc);

  function req(url: string, method: string, body?: unknown, cookie?: string | null) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest(`http://localhost:3000${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  const remove = (id: string, confirmName?: unknown, cookie: string | null = adminCookie) =>
    patchClient(req(`/api/admin/clients/${id}`, 'PATCH', { action: 'delete_client_permanently', ...(confirmName === undefined ? {} : { confirmName }) }, cookie), {
      params: { id },
    });
  const signIn = (email: string) => login(req('/api/auth/login', 'POST', { email, password: 'password', action: 'client_login' }));

  /** A client with one of everything, so nothing can be left behind unnoticed. */
  async function makeClient(name: string, slug: string, ownerEmail: string) {
    const tenant = await createTenant({ name, slug, primary_email: ownerEmail });
    const id = tenant.id;
    const owner = await userRepository.create({ email: ownerEmail, full_name: `${name} Owner`, role: 'client', tenant_id: id, password_hash: 'password' } as any);
    const member = await userRepository.create({ email: `team@${slug}.com`, full_name: `${name} Team`, role: 'client_member', tenant_id: id, password_hash: 'password' } as any);
    await csmAssignmentRepository.setForTenant(id, 'user-csm-2');
    const now = new Date().toISOString();
    store.userInvitations.push({ id: `inv-${slug}`, tenant_id: id, email: `new@${slug}.com`, role: 'client_member', token_hash: `hash-${slug}`, expires_at: now, created_at: now });
    store.leads.push({ id: `lead-${slug}`, tenant_id: id, name: 'A Lead', created_at: now });
    store.appointments.push({ id: `appt-${slug}`, tenant_id: id, appointment_time: now, created_at: now });
    store.leadRequests.push({ id: `lr-${slug}`, tenant_id: id, status: 'open', created_at: now });
    store.onboardingSubmissions.push({ id: `sub-${slug}`, tenant_id: id, answers: {}, created_at: now });
    store.contracts.push({ id: `contract-${slug}`, tenant_id: id, title: 'Service agreement', created_at: now });
    store.roofMeasurements.push({ id: `roof-${slug}`, tenant_id: id, created_at: now });
    store.clientScriptPreferences.push({ id: `pref-${slug}`, tenant_id: id });
    store.integrationConfigs.push({
      id: `int-${slug}`,
      tenant_id: id,
      integration_type: 'google_sheets',
      config_data: { folder_url: `https://drive.google.com/drive/folders/${slug}` },
    });
    store.featureToggles.push({ id: `toggle-${slug}`, tenant_id: id, feature_key: 'leads', is_enabled: true });
    store.clientSetupSteps.push({ id: `step-${slug}`, tenant_id: id, step_key: 'google_sheet', status: 'pending' });
    store.auditLogs.push({ id: `audit-${slug}`, tenant_id: id, actor_email: 'admin@motionz.ai', actor_role: 'admin', action: 'client.updated', created_at: now });
    store.securityEvents.push({ id: `sec-${slug}`, tenant_id: id, event_type: 'failed_login', severity: 'low', is_resolved: false, created_at: now });
    await passwordResetRepository.create(ownerEmail, `token-${slug}`, 60);
    const bytes = new Uint8Array([1, 2, 3]);
    getMockStoredFiles().set(`${id}/abc-logo.png`, { bytes, contentType: 'image/png' });
    getMockOnboardingFiles().set(`${id}/folder-1/licence.pdf`, { bytes, contentType: 'application/pdf' });
    getMockStoredAvatars().set(`users/${owner.id}/me.png`, { bytes, contentType: 'image/png' });
    return { id, owner, member };
  }

  const TENANT_TABLES = [
    'users', 'csmAssignments', 'userInvitations', 'clientSetupSteps', 'featureToggles', 'integrationConfigs', 'contracts', 'orders',
    'clientScriptPreferences', 'roofMeasurements', 'leads', 'appointments', 'onboardingSubmissions', 'leadRequests',
  ];
  const rowsOf = (tenantId: string) => Object.fromEntries(TENANT_TABLES.map((t) => [t, store[t].filter((r: any) => r.tenant_id === tenantId).length]));
  const totalRows = (tenantId: string) => Object.values(rowsOf(tenantId)).reduce((a: number, b: any) => a + b, 0) as number;
  const exists = (id: string) => store.tenants.some((t: any) => t.id === id);

  const beta = await makeClient('Beta Roofing', 'beta-roofing', 'owner@betaroofing.com');
  const betaRowsBefore = totalRows(beta.id);
  const abcRowsBefore = JSON.stringify(rowsOf(abc));
  assert.ok(betaRowsBefore >= 13, 'the test client has data in every table');
  for (const table of ['users', 'leads', 'leadRequests', 'onboardingSubmissions', 'contracts', 'csmAssignments', 'userInvitations']) {
    assert.ok(rowsOf(beta.id)[table] > 0, `the test client has ${table}`);
  }

  // ---------------------------------------------------------------- the typed name
  assert.ok(confirmNameMatches({ name: 'Beta Roofing' }, '  beta ROOFING '), 'case and outer spaces do not matter');
  assert.ok(!confirmNameMatches({ name: 'Beta Roofing' }, 'Beta'));
  assert.ok(!confirmNameMatches({ name: 'Beta Roofing' }, ''));
  assert.ok(!confirmNameMatches({ name: 'Beta Roofing' }, undefined));

  for (const wrong of [undefined, '', '   ', 'Beta', 'Beta Roofing Inc', 'ABC Roofing', 42, null]) {
    const res = await remove(beta.id, wrong);
    assert.strictEqual(res.status, 400, `confirm name ${JSON.stringify(wrong)} is refused`);
    assert.strictEqual((await res.json()).error, "Type the client's name exactly to confirm.");
  }
  assert.ok(exists(beta.id), 'a wrong name deletes nothing');
  assert.strictEqual(totalRows(beta.id), betaRowsBefore, 'a wrong name leaves every row in place');
  console.log(' PASS: a missing or wrong name returns 400 and deletes nothing.');

  // ---------------------------------------------------------------- who may delete
  const betaOwnerCookie = createSessionToken(beta.owner.id, beta.owner.email, 'client', beta.id);
  assert.strictEqual((await remove(beta.id, 'Beta Roofing', null)).status, 401, 'signed-out callers are refused');
  assert.strictEqual((await remove(beta.id, 'Beta Roofing', csmCookie)).status, 403, 'a CSM cannot delete a client');
  assert.strictEqual((await remove(beta.id, 'Beta Roofing', betaOwnerCookie)).status, 403, 'a client cannot delete itself');
  assert.strictEqual((await remove(beta.id, 'Beta Roofing', abcOwnerCookie)).status, 403, 'another client cannot delete it');
  assert.ok(exists(beta.id));
  assert.strictEqual(totalRows(beta.id), betaRowsBefore, 'refused requests delete nothing');
  assert.strictEqual((await remove('no-such-client', 'Whatever')).status, 404);
  console.log(' PASS: only admins can delete a client.');

  // ---------------------------------------------------------------- before: the owner can sign in and work
  assert.strictEqual((await signIn('owner@betaroofing.com')).status, 200, 'the owner can sign in before the delete');
  const ownerRequest = () => req(`/api/portal/${beta.id}/leads`, 'GET', undefined, betaOwnerCookie);
  await requireAuth(ownerRequest(), { roles: ['client'] });
  assert.strictEqual((await portalLeads(ownerRequest(), { params: { clientId: beta.id } } as any)).status, 200);

  // ---------------------------------------------------------------- success
  const auditBefore = store.auditLogs.length;
  let res = await remove(beta.id, '  beta roofing ');
  let data = await res.json();
  assert.strictEqual(res.status, 200, JSON.stringify(data));
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.message, 'Beta Roofing was deleted.');
  assert.strictEqual(data.driveNote, 'Their Google Drive folder was kept. Delete it in Drive if you no longer need it.');
  assert.strictEqual(data.driveFolderUrl, 'https://drive.google.com/drive/folders/beta-roofing');
  assert.strictEqual(data.removed.people, 2);
  assert.strictEqual(data.removed.leads, 1);
  assert.strictEqual(data.removed.leadRequests, 1);
  assert.strictEqual(data.removed.contracts, 1);
  assert.strictEqual(data.removed.invitations, 1);
  assert.strictEqual(data.removed.csmAssignments, 1);
  assert.strictEqual(data.removed.onboardingSubmissions, 1);
  assert.strictEqual(data.removed.files, 3, 'website request file, onboarding file and profile picture');
  assert.strictEqual(data.removed.passwordResetLinks, 1);

  assert.ok(!exists(beta.id), 'the tenant row is gone');
  assert.deepStrictEqual(rowsOf(beta.id), Object.fromEntries(TENANT_TABLES.map((t) => [t, 0])), 'nothing that belonged to the client is left');
  assert.ok(!store.users.some((u: any) => u.id === beta.owner.id || u.id === beta.member.id), 'owner and team member are gone');
  assert.ok(!store.passwordResetTokens.some((t: any) => t.email === 'owner@betaroofing.com'), 'their password reset links are gone');
  assert.ok(!Array.from(getMockStoredFiles().keys()).some((p) => p.startsWith(`${beta.id}/`)), 'website request files are gone');
  assert.ok(!Array.from(getMockOnboardingFiles().keys()).some((p) => p.startsWith(`${beta.id}/`)), 'onboarding files are gone');
  assert.ok(!getMockStoredAvatars().has(`users/${beta.owner.id}/me.png`), 'profile pictures are gone');
  assert.strictEqual((await getClient(req(`/api/admin/clients/${beta.id}`, 'GET', undefined, adminCookie), { params: { id: beta.id } })).status, 404);
  console.log(' PASS: delete removes the client, its people, data and stored files.');

  // ---------------------------------------------------------------- the people are locked out
  assert.strictEqual((await signIn('owner@betaroofing.com')).status, 403, 'the owner can no longer sign in');
  assert.strictEqual((await signIn('team@beta-roofing.com')).status, 403, 'the team member can no longer sign in');
  await assert.rejects(
    () => requireAuth(ownerRequest(), { roles: ['client'] }),
    (err: any) => err.statusCode === 403 && err.message === PORTAL_DELETED_MESSAGE,
    'a session opened before the delete is refused'
  );
  assert.notStrictEqual((await portalLeads(ownerRequest(), { params: { clientId: beta.id } } as any)).status, 200, 'the old session reads nothing');
  console.log(' PASS: the deleted client\'s owner cannot sign in and an open session is refused.');

  // ---------------------------------------------------------------- history
  const entry = store.auditLogs.find((l: any) => l.action === 'tenant.deleted_permanently');
  assert.ok(entry, 'an audit entry is written');
  assert.strictEqual(entry.actor_email, 'admin@motionz.ai');
  assert.strictEqual(entry.resource_id, beta.id);
  assert.strictEqual(entry.details.client, 'Beta Roofing');
  assert.strictEqual(entry.details.removed.people, 2);
  assert.strictEqual(entry.details.removed.leads, 1);
  assert.strictEqual(entry.details.driveFolderKept, true);
  assert.strictEqual(AUDIT_ACTION_LABELS['tenant.deleted_permanently'], 'Client deleted permanently');
  assert.strictEqual(auditActionLabel('tenant.deleted_permanently'), 'Client deleted permanently');
  assert.ok(store.auditLogs.length > auditBefore);
  const oldAudit = store.auditLogs.find((l: any) => l.id === 'audit-beta-roofing');
  assert.ok(oldAudit, 'earlier audit rows survive');
  assert.strictEqual(oldAudit.tenant_id, undefined, 'they only lose the link to the client (ON DELETE SET NULL)');
  const oldEvent = store.securityEvents.find((e: any) => e.id === 'sec-beta-roofing');
  assert.ok(oldEvent && oldEvent.tenant_id === undefined, 'earlier security events survive');
  console.log(' PASS: the delete is in the audit log and the old history is kept.');

  // ---------------------------------------------------------------- everybody else
  assert.ok(exists(abc), 'the other client is still there');
  assert.strictEqual(JSON.stringify(rowsOf(abc)), abcRowsBefore, 'the other client keeps every row');
  assert.strictEqual((await signIn('john@abcroofing.com')).status, 200, 'the other client can still sign in');
  await requireAuth(req(`/api/portal/${abc}/leads`, 'GET', undefined, abcOwnerCookie), { roles: ['client'] });
  for (const id of ['user-admin-1', 'user-csm-1', 'user-csm-2']) {
    assert.ok(store.users.some((u: any) => u.id === id), `staff member ${id} is untouched`);
  }
  console.log(' PASS: other clients and staff are untouched.');

  // ---------------------------------------------------------------- twice
  assert.strictEqual((await remove(beta.id, 'Beta Roofing')).status, 404, 'a deleted client cannot be deleted again');

  // ---------------------------------------------------------------- an archived client
  const gamma = await makeClient('Gamma Exteriors', 'gamma-exteriors', 'owner@gammaexteriors.com');
  assert.strictEqual((await archiveClient(req(`/api/admin/clients/${gamma.id}`, 'DELETE', undefined, adminCookie), { params: { id: gamma.id } })).status, 200);
  assert.ok(store.tenants.find((t: any) => t.id === gamma.id).deleted_at, 'archiving only marks the client (DELETE is still archive)');
  assert.ok(totalRows(gamma.id) > 0, 'archiving keeps the data');
  res = await remove(gamma.id, 'Gamma Exteriors');
  data = await res.json();
  assert.strictEqual(res.status, 200, JSON.stringify(data));
  assert.ok(!exists(gamma.id));
  assert.strictEqual(totalRows(gamma.id), 0);
  assert.strictEqual(store.auditLogs.find((l: any) => l.action === 'tenant.deleted_permanently' && l.resource_id === gamma.id).details.statusBefore, 'archived');
  console.log(' PASS: an archived client can be deleted.');

  // ---------------------------------------------------------------- a suspended client
  const delta = await makeClient('Delta Roofs', 'delta-roofs', 'owner@deltaroofs.com');
  assert.strictEqual(
    (await patchClient(req(`/api/admin/clients/${delta.id}`, 'PATCH', { action: 'suspend_client', reason: 'test' }, adminCookie), { params: { id: delta.id } })).status,
    200
  );
  assert.strictEqual((await remove(delta.id, 'delta roofs')).status, 200, 'a suspended client can be deleted');
  assert.ok(!exists(delta.id));
  assert.ok(exists(abc), 'the first client is still there after all of it');
  console.log(' PASS: a suspended client can be deleted.');

  console.log('All Admin Client Delete Tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
