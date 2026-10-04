import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running CSM Booking Calendar Tests (per-CSM calendar, default, portal data API)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { csmAssignmentRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { PORTAL_LINKS } = await import('../../src/lib/portal-links');
  const { GET: getStaff, PATCH: patchStaff } = await import('../../src/app/api/admin/staff/route');
  const { GET: getPortalData } = await import('../../src/app/api/portal/[clientId]/data/route');

  resetStore();
  const store = getStore();

  const BUILT_IN_DEFAULT = PORTAL_LINKS.csmBookingCalendarId;
  const CSM1_CALENDAR = 'Csm1CalendarAbc123XYZ';
  const NEW_DEFAULT = 'NewDefault_Cal-456789';

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
  const patch = (body: unknown, cookie: string | null = adminCookie) =>
    patchStaff(req('/api/admin/staff', 'PATCH', body, cookie ?? undefined));
  const staffList = async () => (await getStaff(req('/api/admin/staff', 'GET', undefined, adminCookie))).json();
  async function bookingCalendar(tenantId: string, cookie: string = adminCookie): Promise<string> {
    const res = await getPortalData(req(`/api/portal/${tenantId}/data`, 'GET', undefined, cookie), {
      params: { clientId: tenantId },
    });
    assert.strictEqual(res.status, 200, `portal data for ${tenantId} loads`);
    return (await res.json()).bookingCalendarId;
  }

  // The newest audit entry, whichever end the store adds to.
  const seenAudit = new Set<string>();
  function newestAudit(): any {
    const fresh = store.auditLogs.filter((l) => !seenAudit.has(l.id));
    assert.ok(fresh.length >= 1, 'an audit entry was written');
    return fresh[fresh.length - 1];
  }
  const markAuditSeen = () => store.auditLogs.forEach((l) => seenAudit.add(l.id));

  // Three clients: one with CSM 1 (seeded), one with CSM 2, one with no CSM.
  const clientA = store.tenants.find((t) => t.slug === 'abc-roofing')!.id;
  const clientCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', clientA);
  const clientB = (await createTenant({ name: 'Beta Roofing', slug: 'beta-roofing', primary_email: 'owner@betaroofing.com' })).id;
  const clientC = (await createTenant({ name: 'Gamma Roofing', slug: 'gamma-roofing', primary_email: 'owner@gammaroofing.com' })).id;
  await csmAssignmentRepository.setForTenant(clientB, 'user-csm-2');
  await csmAssignmentRepository.setForTenant(clientC, null);
  assert.strictEqual((await csmAssignmentRepository.findByTenant(clientA))?.csm_user_id, 'user-csm-1');

  // ---------------------------------------------------------------- default
  assert.strictEqual(await bookingCalendar(clientA), BUILT_IN_DEFAULT);
  assert.strictEqual(await bookingCalendar(clientB), BUILT_IN_DEFAULT);
  assert.strictEqual(await bookingCalendar(clientC), BUILT_IN_DEFAULT, 'a client with no CSM still gets a calendar');
  assert.strictEqual(await bookingCalendar(clientA, clientCookie), BUILT_IN_DEFAULT, 'the client themselves see it too');

  let list = await staffList();
  assert.strictEqual(list.defaultCalendarId, BUILT_IN_DEFAULT);
  for (const member of list.staff) assert.strictEqual(member.calendarId, null, `${member.email} starts on the default calendar`);
  console.log(' PASS: default calendar is used when none is set.');

  // ---------------------------------------------------------------- access
  assert.strictEqual((await patch({ id: 'user-csm-1', action: 'update', calendar_id: CSM1_CALENDAR }, null)).status, 401);
  assert.strictEqual((await patch({ id: 'user-csm-1', action: 'update', calendar_id: CSM1_CALENDAR }, csmCookie)).status, 403);
  assert.strictEqual((await patch({ action: 'set_default_calendar', calendar_id: NEW_DEFAULT }, csmCookie)).status, 403);
  assert.strictEqual((await patch({ action: 'set_default_calendar', calendar_id: NEW_DEFAULT }, clientCookie)).status, 403);
  assert.strictEqual(await bookingCalendar(clientA), BUILT_IN_DEFAULT, 'rejected requests change nothing');
  assert.strictEqual(store.appSettings.length, 0);
  console.log(' PASS: non-admins cannot change calendars.');

  // ---------------------------------------------------------------- validation
  for (const bad of ['short', 'has spaces in the id', 'https://api.leadconnectorhq.com/widget/booking/abc', 'x'.repeat(41), 'bad/id<script>', 12345]) {
    const res = await patch({ id: 'user-csm-1', action: 'update', calendar_id: bad });
    assert.strictEqual(res.status, 400, `calendar id ${JSON.stringify(bad)} is rejected`);
    assert.ok((await res.json()).error);
  }
  assert.strictEqual((await patch({ action: 'set_default_calendar', calendar_id: 'nope' })).status, 400);
  assert.strictEqual((await patch({ action: 'set_default_calendar', calendar_id: '' })).status, 400, 'the default cannot be empty');
  assert.strictEqual((await patch({ action: 'set_default_calendar' })).status, 400);
  assert.strictEqual(
    (await patch({ id: 'user-admin-1', action: 'update', calendar_id: CSM1_CALENDAR })).status,
    400,
    'admins have no booking calendar'
  );
  assert.strictEqual(store.appSettings.length, 0, 'invalid ids are never stored');
  console.log(' PASS: invalid calendar ids are rejected with 400.');

  // ---------------------------------------------------------------- per-CSM calendar
  const auditBefore = store.auditLogs.length;
  markAuditSeen();
  let res = await patch({ id: 'user-csm-1', action: 'update', calendar_id: `  ${CSM1_CALENDAR}  ` });
  assert.strictEqual(res.status, 200);
  let data = await res.json();
  assert.deepStrictEqual(data.changed, ['calendar']);
  assert.strictEqual(data.staff.calendarId, CSM1_CALENDAR, 'surrounding whitespace is trimmed');

  assert.strictEqual(await bookingCalendar(clientA), CSM1_CALENDAR, "CSM 1's client gets CSM 1's calendar");
  assert.strictEqual(await bookingCalendar(clientA, clientCookie), CSM1_CALENDAR);
  assert.strictEqual(await bookingCalendar(clientB), BUILT_IN_DEFAULT, "CSM 2's client is unaffected");
  assert.strictEqual(await bookingCalendar(clientC), BUILT_IN_DEFAULT, 'the client with no CSM is unaffected');

  list = await staffList();
  assert.strictEqual(list.staff.find((m: any) => m.id === 'user-csm-1').calendarId, CSM1_CALENDAR);
  assert.strictEqual(list.staff.find((m: any) => m.id === 'user-csm-2').calendarId, null);
  assert.strictEqual(list.defaultCalendarId, BUILT_IN_DEFAULT);

  const audit = newestAudit();
  assert.strictEqual(store.auditLogs.length, auditBefore + 1);
  assert.strictEqual(audit.action, 'staff.updated');
  assert.strictEqual(audit.actor_email, 'admin@motionz.ai');
  assert.deepStrictEqual(audit.details?.changed, ['calendar']);
  assert.strictEqual(audit.details?.previousCalendarId, null);
  assert.strictEqual(audit.details?.calendarId, CSM1_CALENDAR);

  // Saving the same id again is a no-op, and other edits leave the calendar alone.
  data = await (await patch({ id: 'user-csm-1', action: 'update', calendar_id: CSM1_CALENDAR })).json();
  assert.deepStrictEqual(data.changed, []);
  data = await (await patch({ id: 'user-csm-1', action: 'update', name: 'Renamed CSM' })).json();
  assert.deepStrictEqual(data.changed, ['name']);
  assert.strictEqual(data.staff.calendarId, CSM1_CALENDAR);
  assert.strictEqual(await bookingCalendar(clientA), CSM1_CALENDAR);

  // Reassigning the client moves it to the new CSM's calendar (here: the default).
  await csmAssignmentRepository.setForTenant(clientA, 'user-csm-2');
  assert.strictEqual(await bookingCalendar(clientA), BUILT_IN_DEFAULT);
  await csmAssignmentRepository.setForTenant(clientA, 'user-csm-1');
  assert.strictEqual(await bookingCalendar(clientA), CSM1_CALENDAR);
  console.log(' PASS: a CSM calendar applies to that CSM\'s clients only, and is audit-logged.');

  // ---------------------------------------------------------------- default calendar
  markAuditSeen();
  res = await patch({ action: 'set_default_calendar', calendar_id: NEW_DEFAULT });
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.strictEqual(data.defaultCalendarId, NEW_DEFAULT);
  assert.strictEqual(data.changed, true);
  assert.strictEqual(newestAudit().action, 'staff.default_calendar_changed');
  assert.strictEqual(newestAudit().details?.previousCalendarId, BUILT_IN_DEFAULT);

  assert.strictEqual(await bookingCalendar(clientB), NEW_DEFAULT);
  assert.strictEqual(await bookingCalendar(clientC), NEW_DEFAULT);
  assert.strictEqual(await bookingCalendar(clientA), CSM1_CALENDAR, "a CSM's own calendar wins over the default");
  assert.strictEqual((await staffList()).defaultCalendarId, NEW_DEFAULT);
  console.log(' PASS: the default calendar can be changed and is audit-logged.');

  // ---------------------------------------------------------------- clearing
  markAuditSeen();
  res = await patch({ id: 'user-csm-1', action: 'update', calendar_id: '' });
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.deepStrictEqual(data.changed, ['calendar']);
  assert.strictEqual(data.staff.calendarId, null);
  assert.strictEqual(await bookingCalendar(clientA), NEW_DEFAULT, 'clearing falls back to the default');
  assert.strictEqual((await staffList()).staff.find((m: any) => m.id === 'user-csm-1').calendarId, null);
  assert.strictEqual(newestAudit().details?.previousCalendarId, CSM1_CALENDAR);
  assert.strictEqual(newestAudit().details?.calendarId, null);

  // A CSM promoted to admin stops having a calendar.
  await patch({ id: 'user-csm-2', action: 'update', calendar_id: CSM1_CALENDAR });
  assert.strictEqual(await bookingCalendar(clientB), CSM1_CALENDAR);
  data = await (await patch({ id: 'user-csm-2', action: 'update', role: 'admin' })).json();
  assert.deepStrictEqual(data.changed, ['role', 'calendar']);
  assert.strictEqual(await bookingCalendar(clientB), NEW_DEFAULT);

  // A malformed stored value is never served to clients.
  store.appSettings.find((s) => s.key === 'csm_calendars')!.value = {
    default_calendar_id: 'not valid!',
    by_user: { 'user-csm-1': 'javascript:alert(1)' },
  };
  assert.strictEqual(await bookingCalendar(clientA), BUILT_IN_DEFAULT);
  console.log(' PASS: clearing a calendar falls back to the default; bad stored values are ignored.');

  console.log('CSM Booking Calendar Tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
