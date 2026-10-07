import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running Staff "Tech" Title Tests (role admin + title tech)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore } = await import('../../src/lib/db');
  const { getStaffTitles, resolveStaffTitle, STAFF_TITLES_KEY } = await import('../../src/lib/db/repositories/app-settings.repository');
  const { staffRoleLabel, parseStaffTitle } = await import('../../src/lib/account/role-labels');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { requireAuth } = await import('../../src/lib/auth/guard');
  const { hasPermission } = await import('../../src/lib/auth/permissions');
  const { roleLabel } = await import('../../src/lib/utils/log-labels');
  const staffRoute = await import('../../src/app/api/admin/staff/route');
  const { GET: authMe } = await import('../../src/app/api/auth/me/route');
  const { GET: getProfile } = await import('../../src/app/api/account/profile/route');
  const { GET: listClients } = await import('../../src/app/api/admin/clients/route');

  resetStore();
  const store = getStore() as any;
  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');

  function req(url: string, method: string, body?: unknown, cookie: string | null = adminCookie) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest(`http://localhost:3000${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  const post = (body: unknown, cookie: string | null = adminCookie) => staffRoute.POST(req('/api/admin/staff', 'POST', body, cookie));
  const patch = (body: unknown, cookie: string | null = adminCookie) => staffRoute.PATCH(req('/api/admin/staff', 'PATCH', body, cookie));
  const del = (body: unknown) => staffRoute.DELETE(req('/api/admin/staff', 'DELETE', body));
  const listed = async (id: string) => (await (await staffRoute.GET(req('/api/admin/staff', 'GET'))).json()).staff.find((s: any) => s.id === id);
  const lastAudit = (action: string) => store.auditLogs.find((l: any) => l.action === action);

  // ---------------------------------------------------------------- the one label helper
  assert.strictEqual(staffRoleLabel('admin', null), 'CSM Manager');
  assert.strictEqual(staffRoleLabel('admin', 'tech'), 'Tech');
  assert.strictEqual(staffRoleLabel('admin'), 'CSM Manager');
  assert.strictEqual(staffRoleLabel('csm', 'tech'), 'CSM', 'a title never renames a CSM');
  assert.strictEqual(staffRoleLabel('client', 'tech'), 'Account owner');
  assert.strictEqual(parseStaffTitle('tech'), 'tech');
  assert.strictEqual(parseStaffTitle('boss'), null);
  console.log(' PASS: one helper names the role; only admin + tech reads "Tech".');

  // ---------------------------------------------------------------- creating a Tech
  let res = await post({ name: 'Tess Tech', email: 'tess@motionz.ai', role: 'admin', title: 'tech' });
  let data = await res.json();
  assert.strictEqual(res.status, 200, JSON.stringify(data));
  const tessId = data.staff.id as string;
  assert.strictEqual(data.staff.role, 'admin', 'a Tech is saved with the role admin');
  assert.strictEqual(data.staff.title, 'tech');
  assert.strictEqual(data.staff.roleLabel, 'Tech');
  assert.strictEqual(store.users.find((u: any) => u.id === tessId).role, 'admin');
  assert.deepStrictEqual(await getStaffTitles(), { [tessId]: 'tech' });
  assert.strictEqual(lastAudit('staff.created').details.title, 'Tech', 'the title is in the staff.created entry');
  assert.strictEqual(lastAudit('staff.created').details.role, 'admin');

  let row = await listed(tessId);
  assert.strictEqual(row.role, 'admin');
  assert.strictEqual(row.title, 'tech');
  assert.strictEqual(row.roleLabel, 'Tech');
  const adminRow = await listed('user-admin-1');
  assert.strictEqual(adminRow.title, null, 'no entry means CSM Manager');
  assert.strictEqual(adminRow.roleLabel, 'CSM Manager');
  assert.strictEqual((await listed('user-csm-1')).roleLabel, 'CSM');
  console.log(' PASS: adding a Tech saves role admin + title tech; GET staff returns the title and label.');

  // ---------------------------------------------------------------- invalid input
  for (const body of [
    { name: 'Bad', email: 'bad1@motionz.ai', role: 'admin', title: 'boss' },
    { name: 'Bad', email: 'bad2@motionz.ai', role: 'admin', title: 5 },
    { name: 'Bad', email: 'bad3@motionz.ai', role: 'csm', title: 'tech' },
    { name: 'Bad', email: 'bad4@motionz.ai', role: 'tech' },
  ]) {
    res = await post(body);
    assert.strictEqual(res.status, 400, `refused: ${JSON.stringify(body)}`);
  }
  assert.ok(!store.users.some((u: any) => /^bad\d@motionz\.ai$/.test(u.email)), 'a refused request adds nobody');
  assert.strictEqual((await patch({ id: tessId, action: 'update', title: 'boss' })).status, 400, 'an unknown title is refused on edit');
  assert.strictEqual((await patch({ id: 'user-csm-2', action: 'update', title: 'tech' })).status, 400, 'a CSM cannot be given the Tech title without becoming an admin');
  assert.strictEqual((await patch({ id: tessId, action: 'update', role: 'csm', title: 'tech' })).status, 400);
  assert.deepStrictEqual(await getStaffTitles(), { [tessId]: 'tech' }, 'refused edits change nothing');
  assert.strictEqual((await post({ name: 'X', email: 'x@motionz.ai', role: 'admin', title: 'tech' }, csmCookie)).status, 403, 'a CSM cannot add staff');
  console.log(' PASS: an invalid title returns 400 and changes nothing.');

  // ---------------------------------------------------------------- the label the person sees
  const tessCookie = createSessionToken(tessId, 'tess@motionz.ai', 'admin');
  data = await (await authMe(req('/api/auth/me', 'GET', undefined, tessCookie))).json();
  assert.strictEqual(data.role, 'admin', 'the role value is still admin');
  assert.strictEqual(data.title, 'tech');
  assert.strictEqual(data.roleLabel, 'Tech');
  data = await (await getProfile(req('/api/account/profile', 'GET', undefined, tessCookie))).json();
  assert.strictEqual(data.role, 'admin');
  assert.strictEqual(data.roleLabel, 'Tech');

  data = await (await authMe(req('/api/auth/me', 'GET', undefined, adminCookie))).json();
  assert.strictEqual(data.roleLabel, 'CSM Manager');
  assert.strictEqual(data.title, null);
  data = await (await getProfile(req('/api/account/profile', 'GET', undefined, adminCookie))).json();
  assert.strictEqual(data.roleLabel, 'CSM Manager');
  data = await (await authMe(req('/api/auth/me', 'GET', undefined, csmCookie))).json();
  assert.strictEqual(data.roleLabel, 'CSM');
  console.log(' PASS: /api/auth/me and /api/account/profile say "Tech" for a Tech and "CSM Manager" otherwise.');

  // ---------------------------------------------------------------- same permissions as a CSM Manager
  await requireAuth(req('/api/admin/clients', 'GET', undefined, tessCookie), { roles: ['admin'] });
  assert.strictEqual((await listClients(req('/api/admin/clients', 'GET', undefined, tessCookie))).status, 200, 'a Tech reaches an admin API');
  assert.strictEqual((await staffRoute.GET(req('/api/admin/staff', 'GET', undefined, tessCookie))).status, 200);
  res = await post({ name: 'Made By Tech', email: 'made.by.tech@motionz.ai', role: 'csm' }, tessCookie);
  assert.strictEqual(res.status, 200, 'a Tech can add staff, like any CSM Manager');
  assert.strictEqual(hasPermission('admin', 'portal:feature_toggle'), true);
  assert.strictEqual(roleLabel('admin'), 'CSM Manager', 'where only the role string is known (audit log actor) the name stays CSM Manager');
  console.log(' PASS: a Tech has the same access as a CSM Manager.');

  // ---------------------------------------------------------------- CSM Manager <-> Tech only changes the title
  res = await patch({ id: tessId, action: 'update', role: 'admin', title: null });
  data = await res.json();
  assert.strictEqual(res.status, 200, JSON.stringify(data));
  assert.deepStrictEqual(data.changed, ['title']);
  assert.strictEqual(data.staff.role, 'admin');
  assert.strictEqual(data.staff.roleLabel, 'CSM Manager');
  assert.deepStrictEqual(await getStaffTitles(), {});
  assert.strictEqual(lastAudit('staff.updated').details.previousTitle, 'Tech');
  assert.strictEqual(lastAudit('staff.updated').details.title, 'CSM Manager');

  res = await patch({ id: tessId, action: 'update', role: 'admin', title: 'tech' });
  data = await res.json();
  assert.deepStrictEqual(data.changed, ['title']);
  assert.strictEqual(data.staff.roleLabel, 'Tech');
  assert.strictEqual(store.users.find((u: any) => u.id === tessId).role, 'admin');

  // Saving again with nothing new changes nothing; an edit that does not mention the title keeps it.
  data = await (await patch({ id: tessId, action: 'update', role: 'admin', title: 'tech' })).json();
  assert.deepStrictEqual(data.changed, []);
  data = await (await patch({ id: tessId, action: 'update', name: 'Tess T' })).json();
  assert.deepStrictEqual(data.changed, ['name']);
  assert.strictEqual(data.staff.roleLabel, 'Tech');
  assert.strictEqual((await listed(tessId)).title, 'tech');
  console.log(' PASS: CSM Manager <-> Tech changes only the title; other edits keep it.');

  // ---------------------------------------------------------------- becoming a CSM clears the title
  res = await patch({ id: tessId, action: 'update', role: 'csm', title: null });
  data = await res.json();
  assert.strictEqual(res.status, 200, JSON.stringify(data));
  assert.deepStrictEqual([...data.changed].sort(), ['role', 'title']);
  assert.strictEqual(data.staff.roleLabel, 'CSM');
  assert.deepStrictEqual(await getStaffTitles(), {});
  // Also when the request only sends the role.
  await patch({ id: tessId, action: 'update', role: 'admin', title: 'tech' });
  assert.strictEqual((await listed(tessId)).roleLabel, 'Tech');
  await patch({ id: tessId, action: 'update', role: 'csm' });
  assert.deepStrictEqual(await getStaffTitles(), {}, 'changing to CSM clears the title even when the request does not mention it');
  assert.strictEqual((await listed(tessId)).roleLabel, 'CSM');
  console.log(' PASS: changing to CSM clears the title.');

  // ---------------------------------------------------------------- your own title is locked, like your own role
  res = await patch({ id: 'user-admin-1', action: 'update', title: 'tech' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).error, 'You cannot change your own role. Ask another CSM Manager.');

  // ---------------------------------------------------------------- deleting removes the title entry
  await patch({ id: tessId, action: 'update', role: 'admin', title: 'tech' });
  assert.deepStrictEqual(await getStaffTitles(), { [tessId]: 'tech' });
  assert.strictEqual((await del({ id: tessId })).status, 200);
  assert.deepStrictEqual(await getStaffTitles(), {}, 'the title entry goes with the person');
  assert.strictEqual(await resolveStaffTitle(tessId), null);
  console.log(' PASS: deleting a Tech removes their title entry.');

  // ---------------------------------------------------------------- a Tech counts as an admin for the "last one" rule
  res = await post({ name: 'Tom Tech', email: 'tom@motionz.ai', role: 'admin', title: 'tech' });
  const tomId = (await res.json()).staff.id as string;
  const tomCookie = createSessionToken(tomId, 'tom@motionz.ai', 'admin');
  assert.strictEqual((await staffRoute.DELETE(req('/api/admin/staff', 'DELETE', { id: 'user-admin-1' }, tomCookie))).status, 200, 'with a Tech left, the other CSM Manager can be deleted');
  const lone = await post({ name: 'Second', email: 'second@motionz.ai', role: 'admin' }, tomCookie);
  const secondId = (await lone.json()).staff.id as string;
  const secondCookie = createSessionToken(secondId, 'second@motionz.ai', 'admin');
  assert.strictEqual((await patch({ id: secondId, action: 'disable' }, tomCookie)).status, 200);
  res = await staffRoute.DELETE(req('/api/admin/staff', 'DELETE', { id: tomId }, secondCookie));
  assert.notStrictEqual(res.status, 200, 'the last active admin, a Tech, cannot be deleted');
  assert.ok(store.users.some((u: any) => u.id === tomId));
  console.log(' PASS: Tech users count as admins for the last-admin rule.');

  // ---------------------------------------------------------------- bad stored data is ignored
  store.appSettings = store.appSettings.filter((s: any) => s.key !== STAFF_TITLES_KEY);
  store.appSettings.push({ key: STAFF_TITLES_KEY, value: { a: 'tech', b: 'boss', c: 7, d: null }, updated_at: '', updated_by: 'x' });
  assert.deepStrictEqual(await getStaffTitles(), { a: 'tech' });
  store.appSettings.find((s: any) => s.key === STAFF_TITLES_KEY).value = 'nonsense';
  assert.deepStrictEqual(await getStaffTitles(), {});
  console.log(' PASS: malformed title data is dropped.');

  console.log('All Staff "Tech" Title Tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
