import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running Admin Feedback Tests (logs by date, staff edit, GHL connect, invite status)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore } = await import('../../src/lib/db');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { securityEventLabel, auditActionLabel, detailChips } = await import('../../src/lib/utils/log-labels');
  const { GET: getLogs } = await import('../../src/app/api/admin/logs/route');
  const { GET: getStaff, PATCH: patchStaff } = await import('../../src/app/api/admin/staff/route');
  const { GET: getGhl } = await import('../../src/app/api/admin/ghl/route');
  const { GET: getDashboard } = await import('../../src/app/api/admin/dashboard/route');
  const { POST: postClient } = await import('../../src/app/api/admin/clients/route');

  resetStore();

  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');

  function req(path: string, method = 'GET', body?: unknown, cookie?: string) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  // ---------------------------------------------------------------- labels
  assert.strictEqual(securityEventLabel('staff_login_success'), 'Staff signed in');
  assert.strictEqual(securityEventLabel('client_invalid_credentials'), 'Wrong password (client)');
  assert.strictEqual(securityEventLabel('invitation_created'), 'Invitation sent');
  assert.strictEqual(securityEventLabel('password_reset_requested'), 'Password reset requested');
  assert.strictEqual(securityEventLabel('some_new_event'), 'Some new event', 'unknown keys fall back to a title-cased label');
  assert.strictEqual(auditActionLabel('staff.updated'), 'Staff member edited');
  assert.strictEqual(auditActionLabel('security.staff_login_success'), 'Staff signed in');
  const chips = detailChips({ timestamp: 'x', reason: 'Invalid password', email: 'a@b.com', nested: { a: 1 } }, { ip: '10.0.0.1' });
  assert.deepStrictEqual(chips, [
    { label: 'Email', value: 'a@b.com' },
    { label: 'Reason', value: 'Invalid password' },
    { label: 'IP', value: '10.0.0.1' },
  ]);
  console.log(' PASS: friendly labels and detail chips.');

  // ---------------------------------------------------------------- logs API
  const store = getStore();
  const DEMO_ID = store.tenants.find((t) => t.slug === 'abc-roofing')!.id;
  store.securityEvents.push(
    { id: 'se-1', event_type: 'staff_login_success', severity: 'low', details: { email: 'admin@motionz.ai', role: 'admin' }, is_resolved: false, created_at: '2026-01-10T09:00:00.000Z' },
    { id: 'se-2', event_type: 'client_invalid_credentials', severity: 'high', details: { email: 'john@abcroofing.com', reason: 'Invalid password' }, is_resolved: false, created_at: '2026-01-10T18:30:00.000Z' },
    { id: 'se-3', event_type: 'invitation_created', severity: 'info', details: { email: 'new@client.com' }, is_resolved: false, created_at: '2026-01-12T12:00:00.000Z' },
    { id: 'se-4', event_type: 'cross_tenant_access_attempt', severity: 'critical', details: { userEmail: 'x@y.com' }, is_resolved: false, created_at: '2026-01-20T12:00:00.000Z' }
  );
  store.auditLogs.push(
    { id: 'al-1', actor_email: 'admin@motionz.ai', actor_role: 'admin', action: 'staff.created', resource_type: 'user', details: { email: 'x@motionz.ai' }, created_at: '2026-01-10T10:00:00.000Z' },
    { id: 'al-2', actor_email: 'csm@motionz.ai', actor_role: 'csm', action: 'step.updated', resource_type: 'step', created_at: '2026-01-15T10:00:00.000Z' }
  );

  assert.strictEqual((await getLogs(req('/api/admin/logs'))).status, 401, 'anonymous is rejected');
  assert.strictEqual((await getLogs(req('/api/admin/logs', 'GET', undefined, csmCookie))).status, 403, 'CSM is rejected');

  const day = 'from=2026-01-10T00:00:00.000Z&to=2026-01-10T23:59:59.999Z';
  let res = await getLogs(req(`/api/admin/logs?type=security&${day}`, 'GET', undefined, adminCookie));
  assert.strictEqual(res.status, 200);
  let data = await res.json();
  assert.deepStrictEqual(data.securityEvents.map((e: any) => e.id), ['se-2', 'se-1'], 'only that day, newest first');
  assert.strictEqual(data.auditLogs, undefined, 'type=security returns security events only');
  assert.strictEqual(data.pagination.total, 2);
  assert.strictEqual(data.summary.securityTotal, 2);
  assert.strictEqual(data.summary.highSeverity, 1);

  data = await (await getLogs(req('/api/admin/logs?type=security&from=2026-01-10T00:00:00.000Z&to=2026-01-31T00:00:00.000Z', 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(data.securityEvents.map((e: any) => e.id), ['se-4', 'se-3', 'se-2', 'se-1']);
  assert.strictEqual(data.summary.highSeverity, 2, 'high and critical both count as high severity');

  data = await (await getLogs(req('/api/admin/logs?type=security&from=2026-01-10T00:00:00.000Z&to=2026-01-31T00:00:00.000Z&severity=high', 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(data.securityEvents.map((e: any) => e.id), ['se-4', 'se-2'], 'severity=high includes critical');

  data = await (await getLogs(req('/api/admin/logs?type=security&from=2026-01-10T00:00:00.000Z&to=2026-01-31T00:00:00.000Z&severity=info', 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(data.securityEvents.map((e: any) => e.id), ['se-3']);

  data = await (await getLogs(req(`/api/admin/logs?type=security&${day}&q=${encodeURIComponent('wrong password')}`, 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(data.securityEvents.map((e: any) => e.id), ['se-2'], 'search matches the friendly label');

  data = await (await getLogs(req(`/api/admin/logs?type=security&${day}&q=abcroofing`, 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(data.securityEvents.map((e: any) => e.id), ['se-2'], 'search matches the email in details');

  data = await (await getLogs(req('/api/admin/logs?type=security&from=2026-01-10T00:00:00.000Z&to=2026-01-31T00:00:00.000Z&page=2&pageSize=3', 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(data.securityEvents.map((e: any) => e.id), ['se-1'], 'second page');
  assert.strictEqual(data.pagination.totalPages, 2);
  assert.strictEqual(data.pagination.hasPrevPage, true);

  data = await (await getLogs(req(`/api/admin/logs?type=audit&${day}`, 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(data.auditLogs.map((l: any) => l.id), ['al-1']);
  assert.strictEqual(data.securityEvents, undefined);
  assert.strictEqual(data.summary.auditTotal, 1);

  data = await (await getLogs(req('/api/admin/logs?type=audit&from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z&q=csm%40motionz.ai', 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(data.auditLogs.map((l: any) => l.id), ['al-2']);

  data = await (await getLogs(req(`/api/admin/logs?${day}`, 'GET', undefined, adminCookie))).json();
  assert.strictEqual(data.auditLogs.length, 1, 'no type: both lists, same range');
  assert.strictEqual(data.securityEvents.length, 2);

  assert.strictEqual((await getLogs(req('/api/admin/logs?type=security&from=not-a-date', 'GET', undefined, adminCookie))).status, 400);
  assert.strictEqual((await getLogs(req('/api/admin/logs?type=nope', 'GET', undefined, adminCookie))).status, 400);
  assert.strictEqual((await getLogs(req('/api/admin/logs?type=security&severity=urgent', 'GET', undefined, adminCookie))).status, 400);
  assert.strictEqual(
    (await getLogs(req('/api/admin/logs?type=security&from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z', 'GET', undefined, adminCookie))).status,
    400,
    'from after to is rejected'
  );
  console.log(' PASS: /api/admin/logs filters by date range, severity and search, paginates, and is admin-only.');

  // ---------------------------------------------------------------- staff edit
  res = await getStaff(req('/api/admin/staff', 'GET', undefined, adminCookie));
  data = await res.json();
  assert.strictEqual(data.staff.find((s: any) => s.id === 'user-admin-1').self, true, 'own row is flagged');
  assert.strictEqual(data.staff.find((s: any) => s.id === 'user-csm-1').self, false);

  const patch = (body: unknown, cookie = adminCookie) => patchStaff(req('/api/admin/staff', 'PATCH', body, cookie));

  res = await patch({ id: 'user-csm-1', action: 'update', name: 'Casey Morgan', email: 'Casey.Morgan@motionz.ai', role: 'admin' });
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.deepStrictEqual(data.changed.sort(), ['email', 'name', 'role']);
  assert.strictEqual(data.staff.email, 'casey.morgan@motionz.ai', 'email is normalised');
  const edited = getStore().users.find((u) => u.id === 'user-csm-1')!;
  assert.strictEqual(edited.email, 'casey.morgan@motionz.ai');
  assert.strictEqual(edited.full_name, 'Casey Morgan');
  assert.strictEqual(edited.role, 'admin');
  const audit = getStore().auditLogs.find((l) => l.action === 'staff.updated')!;
  assert.ok(audit, 'edit is audit-logged');
  assert.strictEqual(audit.actor_email, 'admin@motionz.ai');
  assert.deepStrictEqual([...audit.details!.changed].sort(), ['email', 'name', 'role']);
  assert.strictEqual(audit.details!.previousEmail, 'csm@motionz.ai');
  assert.strictEqual(audit.details!.previousRole, 'csm');

  // Put the role back so the CSM cookie below is still a CSM in the store.
  res = await patch({ id: 'user-csm-1', action: 'update', role: 'csm' });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual((await res.json()).changed, ['role']);

  const auditCount = getStore().auditLogs.filter((l) => l.action === 'staff.updated').length;
  res = await patch({ id: 'user-csm-1', action: 'update', name: 'Casey Morgan' });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual((await res.json()).changed, [], 'no-op edit');
  assert.strictEqual(getStore().auditLogs.filter((l) => l.action === 'staff.updated').length, auditCount, 'no-op edits are not logged');

  res = await patch({ id: 'user-csm-1', action: 'update', email: 'casey@gmail.com' });
  assert.strictEqual(res.status, 400, 'non-motionz email is rejected');
  assert.match((await res.json()).error, /@motionz\.ai/);

  res = await patch({ id: 'user-csm-1', action: 'update', email: 'csm.agent@motionz.ai' });
  assert.strictEqual(res.status, 400, 'duplicate email is rejected');
  assert.match((await res.json()).error, /already exists/);

  assert.strictEqual((await patch({ id: 'user-csm-1', action: 'update', email: 'not-an-email' })).status, 400);
  assert.strictEqual((await patch({ id: 'user-csm-1', action: 'update', name: '   ' })).status, 400);
  assert.strictEqual((await patch({ id: 'user-csm-1', action: 'update', role: 'owner' })).status, 400);
  assert.strictEqual(getStore().users.find((u) => u.id === 'user-csm-1')!.email, 'casey.morgan@motionz.ai', 'rejected edits change nothing');

  res = await patch({ id: 'user-admin-1', action: 'update', role: 'csm' });
  assert.strictEqual(res.status, 400, 'an admin cannot change their own role');
  assert.strictEqual(getStore().users.find((u) => u.id === 'user-admin-1')!.role, 'admin');

  res = await patch({ id: 'user-admin-1', action: 'update', name: 'Head Admin', role: 'admin' });
  assert.strictEqual(res.status, 200, 'an admin can edit their own name (same role)');
  assert.deepStrictEqual((await res.json()).changed, ['name']);

  assert.strictEqual((await patch({ id: 'user-admin-1', action: 'disable' })).status, 400, 'an admin cannot disable themselves');
  assert.strictEqual((await patch({ id: 'user-client-1', action: 'update', name: 'X' })).status, 404, 'clients are not staff');

  res = await patch({ id: 'user-csm-2', action: 'update', name: 'Hacked' }, csmCookie);
  assert.strictEqual(res.status, 403, 'CSM cannot edit staff');
  assert.strictEqual((await patchStaff(req('/api/admin/staff', 'PATCH', { id: 'user-csm-2', action: 'update', name: 'Hacked' }))).status, 401);
  assert.notStrictEqual(getStore().users.find((u) => u.id === 'user-csm-2')!.full_name, 'Hacked');
  console.log(' PASS: staff update validates, protects the signed-in admin, is admin-only and audit-logged.');

  // ---------------------------------------------------------------- GHL connect
  assert.strictEqual((await getGhl(req('/api/admin/ghl', 'GET', undefined, csmCookie))).status, 403);
  assert.strictEqual((await getGhl(req('/api/admin/ghl'))).status, 401);

  for (const t of getStore().tenants) (t as any).ghl_location_id = null;
  res = await getGhl(req('/api/admin/ghl', 'GET', undefined, adminCookie));
  assert.strictEqual(res.status, 200);
  let ghl = await res.json();
  assert.ok(ghl.counts.total >= 1, 'seed has at least one live client');
  assert.strictEqual(ghl.counts.connected, 0);
  assert.strictEqual(ghl.notConnected.length, ghl.counts.total);
  const demo = ghl.notConnected.find((c: any) => c.id === DEMO_ID);
  assert.ok(demo, 'demo client is listed');
  assert.strictEqual(demo.ghl_location_id, null);
  assert.strictEqual(demo.lastLeadAt, '2026-09-20T14:15:00Z', 'most recent lead created_at');
  assert.ok(demo.name && demo.status);

  // A client without leads reports null (rendered as "No leads yet"), never a made-up date.
  getStore().tenants.push({ ...(getStore().tenants[0] as any), id: 'tenant-no-leads', name: 'No Leads Co', slug: 'no-leads-co', primary_email: 'owner@noleads.example' });
  getStore().tenants.find((t) => t.id === DEMO_ID)!.ghl_location_id = 'LocAbc123456';
  ghl = await (await getGhl(req('/api/admin/ghl', 'GET', undefined, adminCookie))).json();
  assert.strictEqual(ghl.counts.connected, 1);
  assert.strictEqual(ghl.connected[0].ghl_location_id, 'LocAbc123456');
  assert.strictEqual(ghl.notConnected.find((c: any) => c.id === 'tenant-no-leads').lastLeadAt, null);
  assert.strictEqual(ghl.connected.length + ghl.notConnected.length, ghl.counts.total);

  const dash = await (await getDashboard(req('/api/admin/dashboard', 'GET', undefined, adminCookie))).json();
  assert.deepStrictEqual(dash.ghl, ghl.counts, 'dashboard card and GHL page agree');
  assert.strictEqual(dash.ghlNotConnected.length, ghl.counts.total - ghl.counts.connected);
  console.log(' PASS: /api/admin/ghl lists connected / not connected clients and matches the dashboard counts.');

  // ---------------------------------------------------------------- new client invite status
  res = await postClient(
    req('/api/admin/clients', 'POST', { name: 'Feedback Roofing', primary_email: 'owner@feedbackroofing.example', primary_contact_name: 'Fay Back' }, adminCookie)
  );
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.strictEqual(typeof data.emailDelivered, 'boolean', 'emailDelivered is returned as a boolean');
  assert.ok(data.magicLinkUrl, 'the copy-link fallback is always available');
  assert.strictEqual(typeof data.sheet?.ok, 'boolean', 'sheet status is returned');
  console.log(' PASS: POST /api/admin/clients reports emailDelivered and sheet status.');

  console.log('All Admin Feedback tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
