import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running Admin & CSM End-to-End Fix Tests (field errors, log details, client names in logs, legacy sections)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { auditLogRepository, featureToggleRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { PORTAL_MODULES } = await import('../../src/lib/portal-modules');
  const clientRoute = await import('../../src/app/api/admin/clients/[id]/route');
  const clientsRoute = await import('../../src/app/api/admin/clients/route');
  const { GET: getLogs } = await import('../../src/app/api/admin/logs/route');
  const { GET: getDashboard } = await import('../../src/app/api/admin/dashboard/route');
  const { PUT: putSetup } = await import('../../src/app/api/csm/clients/[id]/setup/route');
  const { detailChips, fieldLabel } = await import('../../src/lib/utils/log-labels');
  const { formatDateTime } = await import('../../src/lib/utils/format');

  resetStore();
  const store = getStore();
  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');

  function req(path: string, method = 'GET', body?: unknown) {
    const headers = new Headers({ 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` });
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const ctx = (id: string) => ({ params: { id } });
  const demoTenant = store.tenants.find((t) => t.slug === 'abc-roofing')!;
  const demo = demoTenant.id;

  // ---------------------------------------------------------------- 1. errors say which field is wrong
  let res = await clientsRoute.POST(
    req('/api/admin/clients', 'POST', { name: 'Field Error Roofing', primary_contact_name: 'Pat', primary_email: 'pat@fielderror.example', phone: 'abc' })
  );
  let body = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(body.field, 'phone', 'a bad phone number is reported against the phone field');
  assert.ok(body.error, 'the message is still returned');

  res = await clientsRoute.POST(req('/api/admin/clients', 'POST', { name: '', primary_email: 'pat@fielderror.example' }));
  assert.strictEqual((await res.json()).field, 'name', 'a missing company name is reported against the name field');

  res = await clientsRoute.POST(req('/api/admin/clients', 'POST', { name: 'Field Error Roofing', primary_email: 'not-an-email' }));
  assert.strictEqual((await res.json()).field, 'primary_email', 'a bad email is reported against the email field');
  assert.ok(!store.tenants.some((t) => t.name === 'Field Error Roofing'), 'nothing is created when validation fails');

  res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { name: demoTenant.name, phone: '12' }), ctx(demo));
  body = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(body.field, 'phone', 'client Save reports the phone field');

  res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { name: '   ' }), ctx(demo));
  assert.strictEqual((await res.json()).field, 'name', 'client Save reports the company name field');

  const stepKey = store.clientSetupSteps.find((s) => s.tenant_id === demo)!.step_key;
  res = await putSetup(req(`/api/csm/clients/${demo}/setup`, 'PUT', { stepKey, right_now: '   ' }), ctx(demo));
  body = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(body.field, 'right_now', 'setup step Save reports the blank field');
  res = await putSetup(req(`/api/csm/clients/${demo}/setup`, 'PUT', { stepKey, name: '' }), ctx(demo));
  assert.strictEqual((await res.json()).field, 'name');
  console.log(' PASS: Validation errors name the field that needs fixing.');

  // ---------------------------------------------------------------- 6. log chips
  const iso = '2026-10-07T11:05:03.921Z';
  const chips = detailChips({
    email: 'owner@abc.example',
    expiresAt: iso,
    mode: 'development_server_resolved',
    invitationId: '3f2b6c1e-8a4d-4e0b-9c7a-1d2e3f4a5b6c',
    invitation_id: 'inv-123',
    someRef: '3f2b6c1e-8a4d-4e0b-9c7a-1d2e3f4a5b6c',
    reason: 'Invitation expired',
  });
  const chip = (label: string) => chips.find((c) => c.label === label)?.value;
  assert.strictEqual(chip('Expires'), formatDateTime(iso), 'timestamps use the shared date and time style');
  assert.ok(!chips.some((c) => c.value.includes('T11:05')), 'no raw ISO timestamp is shown');
  assert.ok(!chips.some((c) => /mode/i.test(c.label)), 'the internal "mode" value is hidden');
  assert.ok(!chips.some((c) => /invitation/i.test(c.label)), 'raw invitation ids are hidden');
  assert.ok(!chips.some((c) => /^[0-9a-f]{8}-/.test(c.value)), 'no UUID is shown as a chip');
  assert.strictEqual(chip('Email'), 'owner@abc.example');
  assert.strictEqual(chip('Reason'), 'Invitation expired');
  assert.deepStrictEqual(detailChips({ status: 'done', changed: ['right_now'] }).map((c) => c.label), ['Status', 'Changed'], 'ordinary details are still shown');
  console.log(' PASS: Log chips format timestamps and hide internal values and raw ids.');

  // ---------------------------------------------------------------- 6. logs API joins the client name
  const other = await createTenant({ name: 'Zydeco Roof Revival', slug: 'zydeco-roof', primary_email: 'owner@zydeco.example' });
  await auditLogRepository.create({ tenant_id: demo, actor_email: 'webhook@gohighlevel.com', actor_role: 'webhook', action: 'ghl.webhook.lead', resource_type: 'webhook', details: { event: 'lead' } });
  await auditLogRepository.create({ tenant_id: other.id, actor_email: 'webhook@gohighlevel.com', actor_role: 'webhook', action: 'ghl.webhook.lead', resource_type: 'webhook', details: { event: 'lead' } });
  await auditLogRepository.create({ actor_email: 'admin@motionz.ai', actor_role: 'admin', action: 'settings.notifications_updated', resource_type: 'app_settings' });

  res = await getLogs(req('/api/admin/logs?type=audit&pageSize=100'));
  body = await res.json();
  assert.strictEqual(res.status, 200);
  const leadRows = body.auditLogs.filter((l: any) => l.action === 'ghl.webhook.lead');
  assert.deepStrictEqual(
    leadRows.map((l: any) => l.tenant_name).sort(),
    [demoTenant.name, 'Zydeco Roof Revival'].sort(),
    'each GoHighLevel lead row carries its client name'
  );
  assert.ok(body.auditLogs.every((l: any) => 'tenant_name' in l), 'every audit row has a tenant_name key');
  assert.strictEqual(body.auditLogs.find((l: any) => l.action === 'settings.notifications_updated').tenant_name, null, 'rows without a client have no name');

  // An archived client still shows its name in old log rows.
  await clientRoute.DELETE(req(`/api/admin/clients/${other.id}`, 'DELETE'), ctx(other.id));
  body = await (await getLogs(req('/api/admin/logs?type=audit&pageSize=100'))).json();
  assert.ok(
    body.auditLogs.some((l: any) => l.action === 'ghl.webhook.lead' && l.tenant_name === 'Zydeco Roof Revival'),
    'archived clients keep their name in the log'
  );
  body = await (await getLogs(req('/api/admin/logs?type=security&pageSize=100'))).json();
  assert.ok(body.securityEvents.every((e: any) => 'tenant_name' in e), 'security events carry tenant_name too');
  console.log(' PASS: The logs API returns tenant_name.');

  // ---------------------------------------------------------------- 7. onboarding answer labels
  assert.strictEqual(fieldLabel('email'), 'Email');
  assert.strictEqual(fieldLabel('full_name'), 'Full Name');
  assert.strictEqual(fieldLabel('businessPhone'), 'Business Phone');
  assert.strictEqual(fieldLabel('ghl_location_id'), 'GHL Location ID');
  assert.strictEqual(fieldLabel('DBA Business Name'), 'DBA Business Name', 'labels that already read well are left alone');
  assert.strictEqual(fieldLabel('What is your website?'), 'What is your website?');
  console.log(' PASS: Onboarding answers use friendly field labels.');

  // ---------------------------------------------------------------- 11. the legacy "orders" switch
  await featureToggleRepository.setToggle(demo, 'orders', true);
  const detail = await (await clientRoute.GET(req(`/api/admin/clients/${demo}`), ctx(demo))).json();
  assert.strictEqual(detail.success, true);
  assert.ok(!('orders' in detail.features), 'the client page API never returns the legacy "orders" section');
  const known = new Set(PORTAL_MODULES.map((m) => m.key));
  assert.ok(Object.keys(detail.features).every((k) => known.has(k)), 'only real portal sections are returned');

  const before = store.featureToggles.filter((t) => t.tenant_id === demo && t.feature_key === 'orders').map((t) => t.updated_at);
  res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { feature_toggles: { orders: false, leads: false, made_up: true } }), ctx(demo));
  assert.strictEqual(res.status, 200);
  const toggles = await featureToggleRepository.getTogglesForTenant(demo);
  assert.strictEqual(toggles.leads, false, 'real sections are still saved');
  assert.strictEqual(toggles.orders, true, '"orders" is not written back');
  assert.ok(!('made_up' in toggles), 'unknown sections are not created');
  assert.deepStrictEqual(
    store.featureToggles.filter((t) => t.tenant_id === demo && t.feature_key === 'orders').map((t) => t.updated_at),
    before,
    'the stored "orders" row is untouched'
  );

  // An invitation with no explicit list gets real sections only.
  res = await clientRoute.PATCH(
    req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'create_invitation', email: 'helper@abc-team.example', role: 'client_member' }),
    ctx(demo)
  );
  body = await res.json();
  assert.strictEqual(res.status, 200, `invitation is created (got: ${body.error})`);
  const invited: string[] = body.invitation.allowed_modules || [];
  assert.ok(invited.length > 0 && invited.every((k) => known.has(k)), 'a team invitation never includes "orders"');
  assert.ok(!invited.includes('leads'), 'sections switched off for the client are left out');
  console.log(' PASS: The legacy "orders" section is never returned or saved.');

  // ---------------------------------------------------------------- 5. "Still in setup" tile opens a matching list
  const dashboard = await (await getDashboard(req('/api/admin/dashboard'))).json();
  const inSetup = await (await clientsRoute.GET(req('/api/admin/clients?setup=in_progress'))).json();
  assert.strictEqual(inSetup.success, true);
  assert.strictEqual(inSetup.tenants.length, dashboard.inSetup, 'the filtered client list matches the dashboard number');
  assert.ok(inSetup.tenants.every((t: any) => !t.is_archived), 'archived clients are not "in setup"');
  const everyone = await (await clientsRoute.GET(req('/api/admin/clients'))).json();
  assert.ok(everyone.tenants.length >= inSetup.tenants.length, 'without the filter every client is listed');
  console.log(' PASS: The "Still in setup" tile links to the same clients it counts.');

  console.log('Admin & CSM End-to-End Fix Tests: ALL PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
