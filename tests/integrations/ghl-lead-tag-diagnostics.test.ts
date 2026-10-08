/**
 * "The tag for qualified lead doesn't work": making it diagnosable.
 *  - a contact ignored for lacking the tag leaves an audit entry with the tags that arrived,
 *    at most 3 per location per hour;
 *  - Admin → GHL Connect → Last events reads the most recent lead messages (admin only);
 *  - marketplace ContactCreate / ContactUpdate events follow the same tag rule.
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
  'GHL_WEBHOOK_SECRET',
  'MEDIA_BUYER_EMAIL',
  'EMAIL_TEST_REDIRECT_TO',
]) {
  delete process.env[key];
}

const BASE = 'http://localhost:3000';
const DEMO_TENANT = '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f';
const DEMO_LOCATION = 'loc_ghl_demo_abc';
const SECRET = 'lead-tag-diagnostics-secret';

async function run() {
  console.log('--- Running GHL Lead Tag Diagnostics Tests ---');

  const { NextRequest } = await import('next/server');
  const { POST: ghlWebhook } = await import('../../src/app/api/webhooks/ghl/route');
  const { GET: recentEvents } = await import('../../src/app/api/admin/ghl/recent-events/route');
  const { PUT: putLeadRule } = await import('../../src/app/api/admin/settings/leads/route');
  const { getStore, resetStore, createTenant } = await import('../../src/lib/db');
  const { tenantRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { auditActionLabel } = await import('../../src/lib/utils/log-labels');

  resetStore();
  process.env.GHL_WEBHOOK_SECRET = SECRET;
  const store = () => getStore();

  const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(`${BASE}${path}`, {
      method,
      headers: new Headers({ 'content-type': 'application/json', ...headers }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const send = async (event: string, body: Record<string, any> = {}, extraCustomData: Record<string, any> = {}) => {
    const res = await ghlWebhook(req('/api/webhooks/ghl', 'POST', { ...body, customData: { event, secret: SECRET, ...extraCustomData } }));
    return { status: res.status, json: await res.json() };
  };
  /** A marketplace-format event: the type at the top level, the secret as a header. */
  const marketplace = async (type: string, body: Record<string, any>) => {
    const res = await ghlWebhook(req('/api/webhooks/ghl', 'POST', { type, ...body }, { 'x-motionz-webhook-secret': SECRET }));
    return { status: res.status, json: await res.json() };
  };
  const contact = (contactId: string, extra: Record<string, any> = {}, location = DEMO_LOCATION) => ({
    contact_id: contactId,
    first_name: 'Sim',
    last_name: `Lead ${contactId}`,
    email: `${contactId}@example.test`,
    location: { id: location },
    ...extra,
  });
  const ignored = () => store().auditLogs.filter((l) => l.action === 'ghl.webhook.ignored');
  const leadsFor = (contactId: string) => store().leads.filter((l) => l.ghl_contact_id === contactId);

  const adminCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin')}` };
  const csmCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm')}` };
  const clientCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken('user-client-1', 'john@abcroofing.com', 'client', DEMO_TENANT)}` };
  const events = async (cookie: Record<string, string> = adminCookie) => {
    const res = await recentEvents(req('/api/admin/ghl/recent-events', 'GET', undefined, cookie));
    return { status: res.status, json: await res.json() };
  };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

  // A second connected client, so the per-location limit can be seen.
  const second = await createTenant({ name: 'Second Roofing', slug: 'second-roofing-diag', primary_email: 'owner@second-roofing.test' } as any);
  await tenantRepository.update(second.id, { ghl_location_id: 'loc_second_diag' } as any);

  // ───────────── 1. The endpoint is for CSM Managers only ─────────────
  assert.strictEqual((await events({})).status, 401);
  assert.strictEqual((await events(csmCookie)).status, 403, 'a CSM cannot read the last events');
  assert.strictEqual((await events(clientCookie)).status, 403, 'a client cannot read the last events');
  console.log(' PASS: the last events are for CSM Managers only.');

  // ───────────── 2. Rule off: accepted leads carry a name, no tag details ─────────────
  await send('lead', contact('before-rule', { tags: 'hot' }), { stage: 'New Lead' });
  const acceptedOff = store().auditLogs.find((l) => l.action === 'ghl.webhook.lead')!;
  assert.strictEqual(acceptedOff.details?.leadName, 'Sim Lead before-rule');
  assert.strictEqual(acceptedOff.details?.tagsSeen, undefined, 'tags are not recorded while the rule is off');

  // Switch the rule on. Anything from before no longer counts as "since the rule was turned on".
  await pause();
  const saved = await putLeadRule(req('/api/admin/settings/leads', 'PUT', { mode: 'tag', required_tag: 'Qualified' }, adminCookie));
  assert.strictEqual(saved.status, 200);
  await pause();
  const empty = await events();
  assert.strictEqual(empty.status, 200);
  assert.strictEqual(empty.json.requiredTag, 'Qualified');
  assert.ok(empty.json.since, 'the time the rule was saved is returned');
  assert.deepStrictEqual(empty.json.events, [], 'nothing received yet since the rule was turned on');
  console.log(' PASS: with nothing received since the rule was saved, the list is empty.');

  // ───────────── 3. Ignored for lacking the tag: recorded with the tags seen, 3 per location per hour ─────────────
  const shapes: Array<[Record<string, any>, Record<string, any>, string]> = [
    [{ tags: 'hot, new' }, {}, 'hot, new'],
    [{}, {}, '(none sent)'],
    [{ tags: [{ name: 'Facebook Lead' }, { label: 'new' }], contact: { tags: 'hot' } }, {}, 'Facebook Lead, new, hot'],
  ];
  for (const [index, [body, custom, expected]] of Array.from(shapes.entries())) {
    const before = ignored().length;
    const res = await send('lead', contact(`untagged-${index}`, body), { stage: 'New Lead', ...custom });
    assert.deepStrictEqual(res.json, { received: true, ignored: true, reason: 'Contact is not tagged "Qualified" yet.' });
    assert.strictEqual(ignored().length, before + 1, `entry ${index + 1} is written`);
    const entry = ignored()[0];
    assert.strictEqual(entry.tenant_id, DEMO_TENANT);
    assert.strictEqual(entry.resource_id, DEMO_LOCATION);
    assert.strictEqual(entry.details?.reason, 'Contact is not tagged "Qualified" yet.');
    assert.strictEqual(entry.details?.location, DEMO_LOCATION);
    assert.strictEqual(entry.details?.contact, `Sim Lead untagged-${index}`);
    assert.strictEqual(entry.details?.client, 'ABC Roofing');
    assert.strictEqual(entry.details?.eventType, 'lead');
    assert.strictEqual(entry.details?.tagsSeen, expected);
    assert.strictEqual(leadsFor(`untagged-${index}`).length, 0);
  }
  assert.strictEqual(auditActionLabel('ghl.webhook.ignored', ignored()[0].details), 'GoHighLevel event ignored: Contact is not tagged "Qualified" yet.');

  // The 4th (and every later one) in the hour is answered the same way but not written.
  const afterThree = store().auditLogs.length;
  for (let i = 0; i < 6; i++) {
    const res = await send('lead', contact(`untagged-more-${i}`, { tags: 'hot' }), { stage: 'New Lead' });
    assert.strictEqual(res.json.ignored, true);
    assert.strictEqual(leadsFor(`untagged-more-${i}`).length, 0);
  }
  assert.strictEqual(store().auditLogs.length, afterThree, 'the 4th untagged contact for the same location writes nothing');

  // The limit is per location: another client still gets its own 3.
  for (let i = 0; i < 4; i++) await send('lead', contact(`second-untagged-${i}`, { tags: '' }, 'loc_second_diag'));
  const secondEntries = ignored().filter((l) => l.resource_id === 'loc_second_diag');
  assert.strictEqual(secondEntries.length, 3, 'a second location gets its own 3 entries');
  assert.strictEqual(secondEntries[0].details?.tagsSeen, '(empty)', 'an empty tags field reads "(empty)", not "(none sent)"');
  assert.strictEqual(secondEntries[0].tenant_id, second.id);

  // Other ignored events keep their own, separate limit.
  const unknownBefore = ignored().length;
  await send('lead', contact('nowhere', { tags: 'Qualified' }, 'loc_nobody_has_this'));
  assert.strictEqual(ignored().length, unknownBefore + 1, 'an unknown location is still recorded');
  console.log(' PASS: an ignored untagged contact is recorded with the tags seen: 3 written, the 4th not, per location.');

  // ───────────── 4. tagsSeen is short and safe ─────────────
  await tenantRepository.update(second.id, { ghl_location_id: 'loc_second_diag_b' } as any);
  await send('lead', contact('long-tags', { tags: Array.from({ length: 80 }, (_, i) => `tag number ${i}`) }, 'loc_second_diag_b'));
  const long = ignored()[0];
  assert.strictEqual(long.resource_id, 'loc_second_diag_b');
  assert.strictEqual(String(long.details?.tagsSeen).length, 200, 'tags seen is cut at 200 characters');
  await send('lead', contact('odd-tags', { tags: { unexpected: { deep: 'thing' } } }, 'loc_second_diag_b'));
  assert.match(String(ignored()[0].details?.tagsSeen), /^\(not readable as tags\) /);
  assert.ok(String(ignored()[0].details?.tagsSeen).length <= 200);
  assert.ok(!JSON.stringify(store().auditLogs).includes(SECRET), 'the webhook secret never reaches the audit log');
  console.log(' PASS: tags seen is cut at 200 characters and shows a little of anything unreadable.');

  // ───────────── 5. Accepted and removed leads, then the Last events list ─────────────
  await pause();
  const accepted = await send('lead', contact('3', { tags: 'Qualified' }), { stage: 'New Lead' });
  assert.strictEqual(accepted.json.matched, true);
  const acceptedEntry = store().auditLogs.find((l) => l.action === 'ghl.webhook.lead')!;
  assert.strictEqual(acceptedEntry.details?.leadName, 'Sim Lead 3');
  assert.strictEqual(acceptedEntry.details?.tagsSeen, 'Qualified');
  assert.strictEqual(acceptedEntry.details?.client, 'ABC Roofing');
  await pause();
  // A call booking is not a lead event and must not show in the list.
  await send('csm_call', { email: 'nobody@nowhere.test', calendar: { appointmentId: 'appt-diag', startTime: new Date().toISOString() } });
  await pause();
  assert.strictEqual((await send('lead_unqualified', contact('3'))).json.removed, true);

  const list = await events();
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.json.events.length, 5, 'only the 5 most recent are returned');
  const summaries = list.json.events.map((e: any) => e.summary);
  assert.strictEqual(summaries[0], 'Removed · Sim Lead 3 · tag taken off');
  assert.strictEqual(summaries[1], 'Received · Sim Lead 3 · tags: Qualified');
  assert.match(summaries[2], /^Ignored \(no Qualified tag\) · Sim Lead odd-tags · tags seen: \(not readable as tags\)/);
  assert.match(summaries[3], /^Ignored \(no Qualified tag\) · Sim Lead long-tags · tags seen: tag number 0, tag number 1/);
  assert.strictEqual(summaries[4], 'Ignored · Unknown or missing location id.');
  assert.deepStrictEqual(list.json.events.map((e: any) => e.kind), ['removed', 'received', 'ignored', 'ignored', 'ignored']);
  assert.strictEqual(list.json.events[0].client, 'ABC Roofing');
  assert.strictEqual(list.json.events[0].location, DEMO_LOCATION);
  assert.strictEqual(list.json.events[2].client, 'Second Roofing');
  assert.strictEqual(list.json.events[4].client, '', 'an unknown location has no client');
  assert.strictEqual(list.json.events[4].location, 'loc_nobody_has_this');
  assert.ok(list.json.events.every((e: any) => e.id && !Number.isNaN(new Date(e.at).getTime())));
  assert.ok(!summaries.some((s: string) => /csm|call/i.test(s)), 'call bookings are not lead events');
  assert.ok(!JSON.stringify(list.json).includes(SECRET));
  console.log(' PASS: Last events lists received, ignored (with tags seen) and removed lead messages, newest first.');

  // ───────────── 6. Marketplace ContactCreate / ContactUpdate follow the same rule ─────────────
  await tenantRepository.update(second.id, { ghl_location_id: 'loc_second_mp' } as any);
  const mpContact = (id: string, extra: Record<string, any> = {}) => ({
    locationId: 'loc_second_mp',
    contact: { id, firstName: 'Market', lastName: 'Place', email: `${id}@example.test`, ...extra },
  });

  const mpUntagged = await marketplace('ContactCreate', mpContact('mp-untagged', { tags: ['hot'] }));
  assert.strictEqual(mpUntagged.status, 200);
  assert.deepStrictEqual(mpUntagged.json, { received: true, ignored: true, reason: 'Contact is not tagged "Qualified" yet.' });
  assert.strictEqual(leadsFor('mp-untagged').length, 0, 'an untagged new marketplace contact creates no lead');
  assert.strictEqual(ignored()[0].details?.eventType, 'ContactCreate');
  assert.strictEqual(ignored()[0].details?.contact, 'Market Place');
  assert.strictEqual(ignored()[0].details?.tagsSeen, 'hot');
  assert.strictEqual((await marketplace('ContactUpdate', mpContact('mp-untagged'))).json.ignored, true, 'an update with no tags is ignored too');
  assert.strictEqual(ignored()[0].details?.tagsSeen, '(none sent)');
  assert.strictEqual(leadsFor('mp-untagged').length, 0);

  const mpTagged = await marketplace('ContactCreate', mpContact('mp-tagged', { tags: ['hot', 'qualified'] }));
  assert.deepStrictEqual(mpTagged.json, { received: true, eventType: 'ContactCreate', matched: true });
  assert.strictEqual(leadsFor('mp-tagged').length, 1, 'a tagged marketplace contact becomes a lead');
  assert.strictEqual(leadsFor('mp-tagged')[0].tenant_id, second.id);
  // Top-level contact fields (no `contact` object) with tags as objects.
  const mpFlat = await marketplace('ContactUpdate', { locationId: 'loc_second_mp', id: 'mp-flat', firstName: 'Flat', tags: [{ name: 'Qualified' }] });
  assert.strictEqual(mpFlat.json.matched, true);
  assert.strictEqual(leadsFor('mp-flat').length, 1);
  // An existing lead keeps updating when a later event has no tag.
  const mpLater = await marketplace('ContactUpdate', mpContact('mp-tagged', { lastName: 'Renamed', tags: [] }));
  assert.strictEqual(mpLater.json.matched, true);
  assert.strictEqual(leadsFor('mp-tagged').length, 1);
  assert.strictEqual(leadsFor('mp-tagged')[0].last_name, 'Renamed');
  // The marketplace lines read the same way in Last events.
  await pause();
  await marketplace('ContactUpdate', mpContact('mp-tagged', { tags: 'Qualified' }));
  assert.strictEqual((await events()).json.events[0].summary, 'Received · Market Place · tags: Qualified');

  // Rule off again: every marketplace contact is stored, as before.
  assert.strictEqual((await putLeadRule(req('/api/admin/settings/leads', 'PUT', { mode: 'opportunity' }, adminCookie))).status, 200);
  assert.strictEqual((await marketplace('ContactCreate', mpContact('mp-untagged'))).json.matched, true);
  assert.strictEqual(leadsFor('mp-untagged').length, 1, 'with the rule off an untagged marketplace contact becomes a lead');
  console.log(' PASS: marketplace contact events follow the tag rule (tagged: stored; untagged and new: ignored).');

  delete process.env.GHL_WEBHOOK_SECRET;
  console.log('--- GHL Lead Tag Diagnostics Tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
