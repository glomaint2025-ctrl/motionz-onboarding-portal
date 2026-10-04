import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running Admin & CSM Audit Fix Tests (unarchive, status guard, client validation, CSM filters, setup text)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant, getClientSetupSteps, updateClientSetupStep } = await import('../../src/lib/db');
  const { csmAssignmentRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { PORTAL_MODULES } = await import('../../src/lib/portal-modules');
  const clientRoute = await import('../../src/app/api/admin/clients/[id]/route');
  const clientsRoute = await import('../../src/app/api/admin/clients/route');
  const { GET: getDashboard } = await import('../../src/app/api/admin/dashboard/route');
  const { GET: getCsmClients } = await import('../../src/app/api/csm/clients/route');
  const { PUT: putSetup } = await import('../../src/app/api/csm/clients/[id]/setup/route');
  const { getNavGroups, getBottomBarItems, isNavItemActive } = await import('../../src/components/layout/nav-config');
  const { auditActionLabel, securityEventLabel, roleLabel, detailChips } = await import('../../src/lib/utils/log-labels');

  resetStore();
  const store = getStore();

  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');

  function req(path: string, method = 'GET', body?: unknown, cookie: string | undefined = adminCookie) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const ctx = (id: string) => ({ params: { id } });
  const putClient = (id: string, body: unknown) => clientRoute.PUT(req(`/api/admin/clients/${id}`, 'PUT', body), ctx(id));
  const patchClient = (id: string, body: unknown) => clientRoute.PATCH(req(`/api/admin/clients/${id}`, 'PATCH', body), ctx(id));
  const stored = (id: string) => store.tenants.find((t) => t.id === id)!;

  const demo = store.tenants.find((t) => t.slug === 'abc-roofing')!.id;

  // ---------------------------------------------------------------- 1. unarchive
  const archiveMe = (await createTenant({ name: 'Archive Me Roofing', slug: 'archive-me', primary_email: 'owner@archiveme.example' })).id;
  let res = await clientRoute.DELETE(req(`/api/admin/clients/${archiveMe}`, 'DELETE'), ctx(archiveMe));
  assert.strictEqual(res.status, 200, 'archive works');
  assert.ok(stored(archiveMe).deleted_at || stored(archiveMe).status === 'cancelled', 'client is archived');

  res = await patchClient(archiveMe, { action: 'unarchive' });
  let body = await res.json();
  assert.strictEqual(res.status, 200, `unarchive must not ask for an invitation (got: ${body.error})`);
  assert.strictEqual(body.success, true);
  assert.ok(!stored(archiveMe).deleted_at, 'archive marker is cleared');
  assert.notStrictEqual(stored(archiveMe).status, 'cancelled', 'client is live again');
  assert.ok(store.auditLogs.some((l) => l.action === 'client.unarchived' && l.tenant_id === archiveMe), 'unarchive is recorded');

  // Invitation actions still need an invitation, and unknown actions are refused.
  res = await patchClient(demo, { action: 'resend' });
  assert.strictEqual(res.status, 400, 'resend without an invitation is rejected');
  res = await patchClient(demo, { action: 'made_up_action' });
  assert.strictEqual(res.status, 400, 'unknown action is rejected');
  console.log(' PASS: Unarchive works without an invitation ID; invitation actions still validate.');

  // ---------------------------------------------------------------- 4. status guard
  const before = stored(demo).status;
  for (const bad of ['suspended', 'cancelled', 'banned', 'archived']) {
    res = await putClient(demo, { status: bad });
    body = await res.json();
    assert.strictEqual(res.status, 400, `PUT status=${bad} is rejected`);
    assert.match(body.error, /Suspend|Archive/, 'the message points to the Suspend / Archive buttons');
    assert.strictEqual(stored(demo).status, before, `status is unchanged after PUT status=${bad}`);
  }
  res = await putClient(demo, { status: 'onboarding' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(stored(demo).status, 'onboarding');
  res = await putClient(demo, { status: 'active' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(stored(demo).status, 'active');

  // A suspended client cannot be flipped back to Active through the settings form.
  res = await patchClient(demo, { action: 'suspend_client', reason: 'Subscription paused' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(stored(demo).status, 'suspended');
  res = await putClient(demo, { status: 'active' });
  assert.strictEqual(res.status, 400, 'settings form cannot lift a suspension');
  assert.strictEqual(stored(demo).status, 'suspended');
  res = await putClient(demo, { name: stored(demo).name });
  assert.strictEqual(res.status, 200, 'other details of a suspended client can still be saved');
  res = await patchClient(demo, { action: 'unsuspend_client' });
  assert.strictEqual(res.status, 200);
  assert.notStrictEqual(stored(demo).status, 'suspended');

  // Bad input is reported, and an invalid CSM does not leave a half-saved form.
  const nameBefore = stored(demo).name;
  res = await putClient(demo, { name: 'Half Saved Name', csm_user_id: 'user-client-1' });
  assert.strictEqual(res.status, 400, 'a non-CSM user is rejected');
  assert.strictEqual(stored(demo).name, nameBefore, 'nothing is saved when the CSM is invalid');
  res = await putClient(demo, { phone: 'call me maybe' });
  assert.strictEqual(res.status, 400, 'bad phone is rejected');
  assert.ok((await res.json()).error, 'bad phone has a message the page can show');
  console.log(' PASS: Settings form can only set Active / Onboarding; suspend and archive keep their own actions.');

  // ---------------------------------------------------------------- 5. POST validation
  const post = (payload: unknown) => clientsRoute.POST(req('/api/admin/clients', 'POST', payload));
  const tenantCount = store.tenants.length;
  const badPayloads: [string, any][] = [
    ['email is a number', { name: 'Num Roofing', primary_contact_name: 'Nia Num', primary_email: 12345 }],
    ['email is an object', { name: 'Obj Roofing', primary_contact_name: 'Olu Obj', primary_email: { a: 1 } }],
    ['email is an array', { name: 'Arr Roofing', primary_contact_name: 'Ari Arr', primary_email: ['a@b.co'] }],
    ['email has no domain', { name: 'Bad Roofing', primary_contact_name: 'Bo Bad', primary_email: 'not-an-email' }],
    ['email is blank', { name: 'Blank Roofing', primary_contact_name: 'Bea Blank', primary_email: '   ' }],
    ['name is blank', { name: '   ', primary_contact_name: 'Ned Name', primary_email: 'ned@nameless.example' }],
    ['name is not text', { name: 42, primary_contact_name: 'Ned Name', primary_email: 'ned2@nameless.example' }],
    ['name is too long', { name: 'x'.repeat(300), primary_contact_name: 'Lee Long', primary_email: 'lee@long.example' }],
    ['contact name is not text', { name: 'No Contact Roofing', primary_contact_name: { first: 'A' }, primary_email: 'owner@nocontact.example' }],
    ['contact name is too long', { name: 'Long Contact Roofing', primary_contact_name: 'y'.repeat(300), primary_email: 'owner@longcontact.example' }],
    ['phone is not a phone', { name: 'Phone Roofing', primary_contact_name: 'Pat Phone', primary_email: 'pat@phone.example', phone: 'abc' }],
  ];
  for (const [label, payload] of badPayloads) {
    res = await post(payload);
    body = await res.json();
    assert.strictEqual(res.status, 400, `POST is rejected with 400 when ${label} (got ${res.status}: ${body.error})`);
    assert.ok(typeof body.error === 'string' && body.error.length > 0, `there is a message when ${label}`);
    assert.doesNotMatch(body.error, /already exists/, `"${label}" is not reported as a duplicate email`);
  }
  assert.strictEqual(store.tenants.length, tenantCount, 'no client is created from bad input');

  res = await post({ name: 'Audit Fix Roofing', primary_contact_name: 'Ada Fix', primary_email: 'Owner@AuditFix.example' });
  body = await res.json();
  assert.strictEqual(res.status, 200, `a valid client is created (got: ${body.error})`);
  assert.strictEqual(body.tenant.primary_email, 'owner@auditfix.example', 'email is trimmed and lower-cased');
  res = await post({ name: 'Audit Fix Roofing Two', primary_contact_name: 'Ada Fix', primary_email: 'owner@auditfix.example' });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /already exists/, 'a real duplicate email is still reported as one');
  console.log(' PASS: Adding a client validates name, contact, email and phone; only real duplicates say "already exists".');

  // ---------------------------------------------------------------- 6. CSM filters and stats
  const csmList = async (query = '') => (await getCsmClients(req(`/api/csm/clients${query}`, 'GET', undefined, csmCookie))).json();

  const doneClient = (await createTenant({ name: 'All Done Roofing', slug: 'all-done', primary_email: 'owner@alldone.example' })).id;
  await csmAssignmentRepository.setForTenant(doneClient, 'user-csm-1');
  for (const step of await getClientSetupSteps(doneClient)) {
    await updateClientSetupStep(doneClient, step.step_key, { status: 'done' });
  }
  const doneSteps = await getClientSetupSteps(doneClient);
  assert.ok(doneSteps.length > 0 && doneSteps.every((s) => s.status === 'done'), 'fixture: every step is done');

  const all = await csmList();
  assert.strictEqual(all.success, true);
  const mine: any[] = all.clients;
  assert.ok(mine.some((c) => c.id === doneClient) && mine.some((c) => c.id === demo), 'CSM sees both assigned clients');
  assert.ok(!mine.some((c) => c.id === archiveMe), 'CSM does not see clients assigned to nobody');

  const completed = await csmList('?status=completed');
  assert.deepStrictEqual(completed.clients.map((c: any) => c.id), [doneClient], '"completed" means setup is 100% done, not a client status');
  const inSetup = await csmList('?status=in_progress');
  assert.ok(inSetup.clients.every((c: any) => c.progress_percent < 100) && inSetup.clients.some((c: any) => c.id === demo));
  assert.ok(!inSetup.clients.some((c: any) => c.id === doneClient), '"in setup" leaves out finished clients');

  const expectedAvg = Math.round(mine.reduce((sum, c) => sum + c.progress_percent, 0) / mine.length);
  assert.strictEqual(all.stats.totalClients, mine.length);
  assert.strictEqual(all.stats.completedClients, 1);
  assert.strictEqual(all.stats.avgProgress, expectedAvg);
  assert.strictEqual(all.stats.pendingSetup, mine.length - 1);

  // Stats cover every assigned client, whatever page or filter is being viewed.
  const paged = await csmList('?page=1&pageSize=1&status=completed');
  assert.strictEqual(paged.tenants.length, 1);
  assert.deepStrictEqual(paged.stats, all.stats, 'stats do not change with the page or filter');
  for (const c of mine) assert.ok(c.total_steps > 0, 'the real step count is returned, so the page needs no hardcoded total');
  console.log(' PASS: CSM "completed" filter and whole-list stats (completedClients, avgProgress).');

  // ---------------------------------------------------------------- 7. CSM setup text
  const putStep = (payload: unknown, cookie = csmCookie) =>
    putSetup(req(`/api/csm/clients/${demo}/setup`, 'PUT', payload, cookie), ctx(demo));
  const firstStep = (await getClientSetupSteps(demo))[0];
  const original = { ...firstStep };

  for (const field of ['what_it_is', 'right_now', 'unlocks'] as const) {
    for (const blank of ['', '   ', '\n\t ']) {
      res = await putStep({ stepKey: firstStep.step_key, [field]: blank });
      assert.strictEqual(res.status, 400, `blank ${field} (${JSON.stringify(blank)}) is rejected`);
    }
    res = await putStep({ stepKey: firstStep.step_key, [field]: 12345 });
    assert.strictEqual(res.status, 400, `non-text ${field} is rejected`);
    res = await putStep({ stepKey: firstStep.step_key, [field]: 'x'.repeat(2001) });
    assert.strictEqual(res.status, 400, `over-long ${field} is rejected`);
  }
  res = await putStep({ stepKey: firstStep.step_key, name: '  ' });
  assert.strictEqual(res.status, 400, 'blank step name is rejected');
  let after = (await getClientSetupSteps(demo)).find((s) => s.step_key === firstStep.step_key)!;
  assert.strictEqual(after.what_it_is, original.what_it_is, 'rejected saves change nothing');
  assert.strictEqual(after.right_now, original.right_now);
  assert.strictEqual(after.unlocks, original.unlocks);

  res = await putStep({ stepKey: firstStep.step_key, we_need_from_you: '   ', right_now: '  Waiting on the ad account.  ' });
  assert.strictEqual(res.status, 200, '"What we need from you" may be left empty');
  after = (await getClientSetupSteps(demo)).find((s) => s.step_key === firstStep.step_key)!;
  assert.strictEqual(after.we_need_from_you || '', '');
  assert.strictEqual(after.right_now, 'Waiting on the ad account.', 'text is trimmed');

  res = await putStep({ stepKey: firstStep.step_key, status: 'done' });
  assert.strictEqual(res.status, 200, 'a status-only update still works');
  res = await putStep({ stepKey: firstStep.step_key, status: 'finished' });
  assert.strictEqual(res.status, 400, 'unknown status is rejected');
  console.log(' PASS: CSM setup text is required (only "What we need from you" may be empty).');

  // ---------------------------------------------------------------- 11. one place for each thing
  const dash = await (await getDashboard(req('/api/admin/dashboard'))).json();
  assert.strictEqual(dash.success, true);
  assert.ok(dash.ghl && typeof dash.ghl.connected === 'number', 'the GHL Connect count tile still has its numbers');
  assert.ok(!('ghlNotConnected' in dash) && !('revenue' in dash) && !('churnRate' in dash), 'removed dashboard cards send no data');

  const labels = (role: 'admin' | 'csm' | 'client') => getNavGroups(role, demo).flatMap((g) => g.items);
  const csmNav = labels('csm');
  assert.ok(!csmNav.some((i) => i.href.includes('setup-queue')), 'the CSM setup queue page is gone from the menu');
  assert.ok(!getBottomBarItems('csm', demo).some((i) => i.href.includes('setup-queue')));
  const adminNav = labels('admin');
  const ghlItem = adminNav.find((i) => i.href === '/admin/ghl')!;
  assert.strictEqual(ghlItem.label, 'GHL Connect');
  assert.notStrictEqual(ghlItem.icon, adminNav.find((i) => i.href === '/admin/integrations')!.icon, 'GHL Connect has its own icon');
  assert.strictEqual(adminNav.find((i) => i.href === '/admin/templates/scripts')?.label, 'Video Scripts');
  assert.strictEqual(isNavItemActive('/admin/templates', '/admin/templates/scripts', 'admin', demo), false, 'only one menu item is highlighted on the scripts page');
  assert.strictEqual(isNavItemActive('/admin/templates/scripts', '/admin/templates/scripts', 'admin', demo), true);
  assert.deepStrictEqual(
    ['onboarding', 'tracking', 'contracts', 'book_call', 'leads'].map((key) => labels('client').find((i) => i.featureKey === key)?.label),
    ['Setup Progress', 'Results Tracking', 'Contract', 'Book a Call', 'Leads'],
    'client menu labels match the page titles'
  );
  console.log(' PASS: Dashboard and menus keep each thing in one place.');

  // ---------------------------------------------------------------- 8 / 14. modules come from PORTAL_MODULES
  const detail = await (await clientRoute.GET(req(`/api/admin/clients/${demo}`), ctx(demo))).json();
  assert.strictEqual(detail.success, true);
  res = await putClient(demo, { feature_toggles: Object.fromEntries(PORTAL_MODULES.map((m) => [m.key, true])) });
  assert.strictEqual(res.status, 200, 'every module in PORTAL_MODULES can be saved, even one with no stored switch yet');
  const refreshed = await (await clientRoute.GET(req(`/api/admin/clients/${demo}`), ctx(demo))).json();
  for (const m of PORTAL_MODULES) assert.strictEqual(refreshed.features[m.key], true, `${m.key} is switched on`);

  // ---------------------------------------------------------------- 12 / 13. friendly labels
  const actions = [
    'staff.default_calendar_changed', 'staff.updated', 'staff.created', 'staff.disabled', 'staff.enabled',
    'contract.added', 'contract.removed', 'settings.notifications_updated', 'integration.sheet_created',
    'client.authenticated', 'ghl.webhook.lead', 'ghl.webhook.csm_call', 'ghl.webhook.onboarding_form',
  ];
  for (const action of actions) {
    const label = auditActionLabel(action);
    assert.ok(label && !/[._]/.test(label), `"${action}" has a plain label (got "${label}")`);
  }
  assert.ok(!/[._]/.test(auditActionLabel('ghl.webhook.some_new_event')), 'unknown GoHighLevel messages still read as words');
  for (const event of ['staff_login_code_sent', 'staff_login_code_verified', 'staff_login_code_failed']) {
    assert.ok(!/_/.test(securityEventLabel(event)), `"${event}" has a plain label`);
    assert.ok(!/_/.test(auditActionLabel(`security.${event}`)), `"security.${event}" has a plain label`);
  }
  assert.strictEqual(roleLabel('client'), 'Account owner');
  assert.strictEqual(roleLabel('client_member'), 'Team member');
  assert.strictEqual(roleLabel('admin'), 'Admin');
  assert.strictEqual(roleLabel('csm'), 'CSM');
  assert.deepStrictEqual(detailChips({ role: 'client_member' }), [{ label: 'Role', value: 'Team member' }], 'log details show the role in plain words');
  console.log(' PASS: Audit and security log entries, and roles, use plain labels.');

  console.log('Admin & CSM Audit Fix Tests: ALL PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
