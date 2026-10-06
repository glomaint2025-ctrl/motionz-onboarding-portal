import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running Admin Staff Delete Tests (DELETE /api/admin/staff)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { csmAssignmentRepository, userRepository } = await import('../../src/lib/db/repositories');
  const { getCsmCalendarSettings } = await import('../../src/lib/db/repositories/app-settings.repository');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { authenticateStaff } = await import('../../src/lib/auth/staff');
  const { AUDIT_ACTION_LABELS } = await import('../../src/lib/utils/log-labels');
  const { GET: getStaff, PATCH: patchStaff, DELETE: deleteStaff } = await import('../../src/app/api/admin/staff/route');

  resetStore();
  const store = getStore();

  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const clientA = store.tenants.find((t) => t.slug === 'abc-roofing')!.id;
  const clientCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', clientA);

  function req(method: string, body?: unknown, cookie?: string) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest('http://localhost:3000/api/admin/staff', {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const del = (body: unknown, cookie: string | null = adminCookie) => deleteStaff(req('DELETE', body, cookie ?? undefined));
  const patch = (body: unknown, cookie: string = adminCookie) => patchStaff(req('PATCH', body, cookie));
  const staffList = async (cookie: string = adminCookie) => (await getStaff(req('GET', undefined, cookie))).json();
  const has = (id: string) => store.users.some((u) => u.id === id);

  // ---------------------------------------------------------------- who may delete
  assert.strictEqual((await del({ id: 'user-csm-2' }, null)).status, 401, 'signed-out callers are refused');
  assert.strictEqual((await del({ id: 'user-csm-2' }, csmCookie)).status, 403, 'a CSM cannot delete staff');
  assert.strictEqual((await del({ id: 'user-csm-2' }, clientCookie)).status, 403, 'a client cannot delete staff');
  assert.ok(has('user-csm-2'), 'refused requests delete nobody');
  console.log(' PASS: only admins can delete staff.');

  // ---------------------------------------------------------------- not staff / unknown
  assert.strictEqual((await del({ id: 'user-client-1' })).status, 404, 'a client user is not a staff member');
  assert.strictEqual((await del({ id: 'no-such-user' })).status, 404);
  assert.strictEqual((await del({})).status, 404);
  assert.ok(has('user-client-1'), 'the client user is untouched');
  console.log(' PASS: non-staff and unknown ids return 404.');

  // ---------------------------------------------------------------- yourself
  let res = await del({ id: 'user-admin-1' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).error, 'You cannot delete your own account.');
  assert.ok(has('user-admin-1'));
  console.log(' PASS: you cannot delete your own account.');

  // ---------------------------------------------------------------- CSM who still has clients
  const clientB = (await createTenant({ name: 'Beta Roofing', slug: 'beta-roofing', primary_email: 'owner@betaroofing.com' })).id;
  await csmAssignmentRepository.setForTenant(clientB, 'user-csm-1');
  store.users.find((u) => u.id === 'user-csm-1')!.full_name = 'Thomas';

  res = await del({ id: 'user-csm-1' });
  assert.strictEqual(res.status, 409);
  let data = await res.json();
  assert.strictEqual(
    data.error,
    'Thomas still looks after 2 clients. Give those clients to another CSM first (Clients → open the client → Assigned CSM), then delete.'
  );
  assert.ok(has('user-csm-1'), 'the CSM is not deleted');
  assert.strictEqual((await csmAssignmentRepository.listByCsm('user-csm-1')).length, 2, 'nothing is unassigned automatically');

  await csmAssignmentRepository.setForTenant(clientB, 'user-csm-2');
  res = await del({ id: 'user-csm-1' });
  assert.strictEqual(res.status, 409);
  assert.ok((await res.json()).error.startsWith('Thomas still looks after 1 client. Give that client to another CSM first'));
  console.log(' PASS: a CSM with assigned clients is refused with 409 and the count.');

  // ---------------------------------------------------------------- delete works, calendar entry removed
  const CSM1_CALENDAR = 'Csm1CalendarAbc123XYZ';
  const CSM2_CALENDAR = 'Csm2CalendarDef456UVW';
  assert.strictEqual((await patch({ id: 'user-csm-1', action: 'update', calendar_id: CSM1_CALENDAR })).status, 200);
  assert.strictEqual((await patch({ id: 'user-csm-2', action: 'update', calendar_id: CSM2_CALENDAR })).status, 200);
  await csmAssignmentRepository.setForTenant(clientA, 'user-csm-2');
  assert.strictEqual((await csmAssignmentRepository.listByCsm('user-csm-1')).length, 0);

  // An audit entry written by the person, which must survive the delete.
  store.auditLogs.push({
    id: 'audit-by-thomas',
    actor_email: 'csm@motionz.ai',
    actor_role: 'csm',
    action: 'client.updated',
    created_at: new Date().toISOString(),
  } as any);
  const auditBefore = store.auditLogs.length;

  res = await del({ id: 'user-csm-1' });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { success: true });
  assert.ok(!has('user-csm-1'), 'the users row is gone');

  const list = await staffList();
  assert.ok(!list.staff.some((m: any) => m.id === 'user-csm-1'), 'they are gone from the Staff list');
  assert.ok(list.staff.some((m: any) => m.id === 'user-csm-2'), 'other staff are untouched');

  const calendars = await getCsmCalendarSettings();
  assert.strictEqual(calendars.by_user['user-csm-1'], undefined, 'their booking calendar entry is removed');
  assert.strictEqual(calendars.by_user['user-csm-2'], CSM2_CALENDAR, "another CSM's calendar is kept");

  assert.strictEqual(store.auditLogs.length, auditBefore + 1, 'one audit entry is added, none removed');
  assert.ok(store.auditLogs.some((l) => l.id === 'audit-by-thomas'), 'their past activity stays in the audit log');
  const entry = store.auditLogs.find((l) => l.action === 'staff.deleted')!;
  assert.ok(entry, 'staff.deleted is audited');
  assert.strictEqual(entry.actor_email, 'admin@motionz.ai');
  assert.strictEqual(entry.resource_id, 'user-csm-1');
  assert.deepStrictEqual(entry.details, { email: 'csm@motionz.ai', name: 'Thomas', role: 'csm' });
  assert.strictEqual(AUDIT_ACTION_LABELS['staff.deleted'], 'Staff member deleted');
  console.log(' PASS: delete removes the person and their calendar entry, and is audited.');

  // ---------------------------------------------------------------- deleted person cannot sign in
  const signIn = await authenticateStaff('csm@motionz.ai', 'password');
  assert.strictEqual(signIn.success, false, 'a deleted staff member cannot sign in');
  assert.ok(!has('user-csm-1'), 'signing in does not bring the account back');
  assert.strictEqual(await userRepository.findByEmail('csm@motionz.ai'), null);

  // A session cookie issued before the delete stops working on the next request.
  const staleAdmin = await userRepository.create({ email: 'old.admin@motionz.ai', full_name: 'Old Admin', role: 'admin', status: 'active' } as any);
  const staleAdminCookie = createSessionToken(staleAdmin.id, staleAdmin.email, 'admin');
  assert.strictEqual((await getStaff(req('GET', undefined, staleAdminCookie))).status, 200, 'works before the delete');
  assert.strictEqual((await del({ id: staleAdmin.id })).status, 200, 'an admin who is not the last one can be deleted');
  assert.strictEqual((await getStaff(req('GET', undefined, staleAdminCookie))).status, 403, 'their old session is refused');
  assert.strictEqual(
    (await patch({ id: 'user-csm-2', action: 'disable' }, staleAdminCookie)).status,
    403,
    'and it cannot change anything'
  );
  assert.strictEqual((await del({ id: 'user-csm-1' })).status, 404, 'deleting someone twice is a 404');
  console.log(' PASS: a deleted person cannot sign in and their old session is refused.');

  // ---------------------------------------------------------------- last active admin
  // Someone demoted to CSM whose browser still holds an admin session must not remove the only admin.
  const second = await userRepository.create({ email: 'second.admin@motionz.ai', full_name: 'Second Admin', role: 'admin', status: 'active' } as any);
  const secondCookie = createSessionToken(second.id, second.email, 'admin');
  store.users.find((u) => u.id === second.id)!.role = 'csm';
  res = await del({ id: 'user-admin-1' }, secondCookie);
  assert.strictEqual(res.status, 400);
  assert.ok(/only active admin/i.test((await res.json()).error));
  assert.ok(has('user-admin-1'), 'the last active admin is kept');

  // A disabled second admin does not count as "another active admin".
  store.users.find((u) => u.id === second.id)!.role = 'admin';
  const third = await userRepository.create({ email: 'third.admin@motionz.ai', full_name: 'Third Admin', role: 'admin', status: 'active' } as any);
  const thirdCookie = createSessionToken(third.id, third.email, 'admin');
  assert.strictEqual((await patch({ id: second.id, action: 'disable' })).status, 200, 'PATCH disable still works');
  store.users.find((u) => u.id === third.id)!.role = 'csm';
  assert.strictEqual((await del({ id: 'user-admin-1' }, thirdCookie)).status, 400, 'still the only active admin');
  store.users.find((u) => u.id === third.id)!.role = 'admin';

  // A disabled person can be deleted, or enabled again.
  assert.strictEqual((await patch({ id: second.id, action: 'enable' })).status, 200, 'PATCH enable still works');
  assert.strictEqual((await patch({ id: second.id, action: 'disable' })).status, 200);
  assert.strictEqual((await del({ id: second.id })).status, 200, 'a disabled staff member can be deleted');
  assert.ok(!has(second.id));
  console.log(' PASS: the last active admin cannot be deleted; disabled staff can.');

  console.log('All Admin Staff Delete Tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
