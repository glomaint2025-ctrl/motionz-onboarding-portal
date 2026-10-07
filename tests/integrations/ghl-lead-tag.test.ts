import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { POST as ghlWebhook } from '../../src/app/api/webhooks/ghl/route';
import { GET as getLeadRule, PUT as putLeadRule } from '../../src/app/api/admin/settings/leads/route';
import { getStore, resetStore } from '../../src/lib/db';
import { getLeadSettings, setLeadSettings } from '../../src/lib/db/repositories/app-settings.repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';
import { auditActionLabel, detailChips } from '../../src/lib/utils/log-labels';

// Tests must never send real email, call Google or use a real webhook secret.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SHEETS_SCRIPT_URL', 'GOOGLE_SHEETS_SCRIPT_SECRET', 'GHL_WEBHOOK_SECRET', 'MEDIA_BUYER_EMAIL', 'EMAIL_TEST_REDIRECT_TO']) {
  delete process.env[key];
}

console.log('--- Running GHL Lead Tag Tests ---');

const BASE = 'http://localhost:3000';
const DEMO_TENANT = '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f';
const DEMO_LOCATION = 'loc_ghl_demo_abc';
const SECRET = 'lead-tag-test-secret-value';

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Posts one webhook event with the shared secret in customData, the way GHL workflows send it. */
async function send(event: string, body: Record<string, any> = {}, extraCustomData: Record<string, any> = {}) {
  const res = await ghlWebhook(req('/api/webhooks/ghl', 'POST', { ...body, customData: { event, secret: SECRET, ...extraCustomData } }));
  return { status: res.status, json: await res.json() };
}

const store = () => getStore();
const audits = (action: string) => store().auditLogs.filter((l) => l.action === action);
const leadsFor = (contactId: string) => store().leads.filter((l) => l.ghl_contact_id === contactId);
const contact = (contactId: string, extra: Record<string, any> = {}) => ({
  contact_id: contactId,
  first_name: 'Tess',
  last_name: 'Tagged',
  email: `${contactId}@example.test`,
  location: { id: DEMO_LOCATION },
  ...extra,
});

async function run() {
  resetStore();
  process.env.GHL_WEBHOOK_SECRET = SECRET;

  const adminCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin')}` };
  const csmCookie = { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm')}` };
  const save = (body: unknown, cookie: Record<string, string> = adminCookie) => putLeadRule(req('/api/admin/settings/leads', 'PUT', body, cookie));

  // ───────────── 1. No tag set (the default): exactly today's behaviour ─────────────
  assert.deepStrictEqual(await getLeadSettings(), { required_tag: '' }, 'no tag is needed by default');
  const untaggedDefault = await send('lead', contact('tag-default-1'), { stage: 'New Lead' });
  assert.strictEqual(untaggedDefault.status, 200);
  assert.deepStrictEqual(untaggedDefault.json, { received: true, eventType: 'lead', matched: true }, 'the reply is unchanged');
  assert.strictEqual(leadsFor('tag-default-1').length, 1, 'an untagged contact becomes a lead when no tag is set');
  assert.strictEqual(leadsFor('tag-default-1')[0].status, 'New Lead');
  assert.strictEqual((await send('lead', contact('tag-default-2', { tags: 'something else' }))).status, 200);
  assert.strictEqual(leadsFor('tag-default-2').length, 1, 'tags are not looked at when no tag is set');
  // The tag-removed event does nothing while the rule is off.
  const offRemoval = await send('lead_unqualified', contact('tag-default-1'));
  assert.strictEqual(offRemoval.json.ignored, true);
  assert.match(offRemoval.json.reason, /switched off/);
  assert.strictEqual(leadsFor('tag-default-1').length, 1, 'with the rule off, lead_unqualified removes nothing');
  console.log(' PASS: with no tag set, every contact becomes a lead as before and lead_unqualified removes nothing.');

  // ───────────── 2. Settings API ─────────────
  assert.strictEqual((await getLeadRule(req('/api/admin/settings/leads', 'GET'))).status, 401, 'signed-out callers cannot read the rule');
  assert.strictEqual((await getLeadRule(req('/api/admin/settings/leads', 'GET', undefined, csmCookie))).status, 403, 'a CSM cannot read the rule');
  assert.strictEqual((await save({ mode: 'tag', required_tag: 'Qualified' }, {})).status, 401);
  assert.strictEqual((await save({ mode: 'tag', required_tag: 'Qualified' }, csmCookie)).status, 403, 'a CSM cannot change the rule');
  const initial = await getLeadRule(req('/api/admin/settings/leads', 'GET', undefined, adminCookie));
  assert.strictEqual(initial.status, 200);
  assert.deepStrictEqual((await initial.json()).leads, { required_tag: '' });

  const emptyTag = await save({ mode: 'tag', required_tag: '   ' });
  assert.strictEqual(emptyTag.status, 400);
  const emptyTagJson = await emptyTag.json();
  assert.strictEqual(emptyTagJson.error, 'Type the tag name.');
  assert.strictEqual(emptyTagJson.field, 'required_tag');
  assert.strictEqual((await save({ mode: 'tag' })).status, 400, 'a missing tag is refused');
  assert.strictEqual((await save({ mode: 'tag', required_tag: 42 })).status, 400, 'a tag that is not text is refused');
  assert.strictEqual((await save({ mode: 'tag', required_tag: 'x'.repeat(61) })).status, 400, 'more than 60 characters is refused');
  assert.strictEqual((await save({ mode: 'tag', required_tag: 'hot, qualified' })).status, 400, 'a list of tags is refused');
  assert.strictEqual((await save({ required_tag: 'Qualified' })).status, 400, 'a choice must be made');
  assert.strictEqual((await save({ mode: 'sometimes', required_tag: 'Qualified' })).status, 400);
  assert.deepStrictEqual(await getLeadSettings(), { required_tag: '' }, 'refused requests change nothing');
  assert.strictEqual(audits('settings.leads_updated').length, 0, 'refused requests are not audited');

  const saved = await save({ mode: 'tag', required_tag: '  Qualified  ' });
  assert.strictEqual(saved.status, 200);
  assert.deepStrictEqual((await saved.json()).leads, { required_tag: 'Qualified' }, 'the tag is trimmed');
  assert.deepStrictEqual(await getLeadSettings(), { required_tag: 'Qualified' });
  assert.strictEqual((await save({ mode: 'tag', required_tag: 'x'.repeat(60) })).status, 200, 'exactly 60 characters is allowed');
  assert.strictEqual((await save({ mode: 'tag', required_tag: 'Qualified' })).status, 200);
  const ruleAudit = audits('settings.leads_updated')[0];
  assert.strictEqual(audits('settings.leads_updated').length, 3);
  assert.strictEqual(ruleAudit.actor_email, 'admin@motionz.ai');
  assert.strictEqual(ruleAudit.resource_id, 'leads');
  assert.strictEqual(ruleAudit.details?.required_tag, 'Qualified');
  assert.strictEqual(ruleAudit.details?.previous_tag, 'x'.repeat(60), 'the audit entry holds the old and the new value');
  assert.strictEqual(auditActionLabel('settings.leads_updated'), 'Lead rule updated (when a contact counts as a lead)');
  assert.ok(detailChips(ruleAudit.details).some((c) => c.label === 'Lead tag' && c.value === 'Qualified'));

  // Back to the default: the typed tag is dropped, and "(none)" is what the audit log shows.
  const backToDefault = await save({ mode: 'opportunity', required_tag: 'ignored' });
  assert.strictEqual(backToDefault.status, 200);
  assert.deepStrictEqual(await getLeadSettings(), { required_tag: '' });
  assert.strictEqual(audits('settings.leads_updated')[0].details?.required_tag, '(none)');
  assert.strictEqual(audits('settings.leads_updated')[0].details?.previous_tag, 'Qualified');
  // A stored value that is not a usable tag reads as "no tag needed".
  await setLeadSettings({ required_tag: 42 as any }, 'test');
  assert.deepStrictEqual(await getLeadSettings(), { required_tag: '' });
  console.log(' PASS: the lead rule is admin only, validated, trimmed and audited with the old and new value.');

  // ───────────── 3. Tag "Qualified" set: untagged new contacts are ignored, quietly ─────────────
  assert.strictEqual((await save({ mode: 'tag', required_tag: 'Qualified' })).status, 200);
  const auditCount = () => store().auditLogs.length;
  const untaggedShapes: [string, Record<string, any>, Record<string, any>][] = [
    ['no tags field at all', {}, {}],
    ['an empty tags string', { tags: '' }, {}],
    ['an empty tags array', { tags: [] }, {}],
    ['other tags only', { tags: 'hot, facebook, not qualified' }, {}],
    ['a tag that only contains the word', { tags: ['Qualified Later', 'Unqualified'] }, {}],
    ['other tags on the contact', { contact: { tags: ['new'] } }, {}],
    ['a tags value that is not text', { tags: { name: 'Qualified' } }, {}],
  ];
  for (const [index, [what, body, custom]] of Array.from(untaggedShapes.entries())) {
    const contactId = `tag-untagged-${index}`;
    const before = auditCount();
    const res = await send('lead', contact(contactId, body), { stage: 'New Lead', ...custom });
    assert.strictEqual(res.status, 200, what);
    assert.deepStrictEqual(res.json, { received: true, ignored: true, reason: 'Contact is not tagged "Qualified" yet.' }, what);
    assert.strictEqual(leadsFor(contactId).length, 0, `${what}: no lead is created`);
    assert.strictEqual(auditCount(), before, `${what}: nothing is written to the audit log`);
  }
  console.log(' PASS: with a tag set, an untagged new contact is ignored with no lead and no audit entry.');

  // ───────────── 4. Tagged contacts become leads, in every shape GoHighLevel may send ─────────────
  const taggedShapes: [string, Record<string, any>, Record<string, any>][] = [
    ['tags as a comma-separated string', { tags: 'hot, Qualified, facebook' }, {}],
    ['tags as the only value of a string', { tags: 'Qualified' }, {}],
    ['tags as an array', { tags: ['hot', 'Qualified'] }, {}],
    ['contact.tags as an array', { contact: { tags: ['Qualified'] } }, {}],
    ['contact.tags as a string', { contact: { tags: 'hot,Qualified' } }, {}],
    ['customData.tags as a string', {}, { tags: 'hot, Qualified' }],
    ['customData.tags as an array', {}, { tags: ['Qualified'] }],
    ['a different letter case', { tags: 'hot, QUALIFIED' }, {}],
    ['extra spaces around the tag', { tags: ['  qualified  '] }, {}],
    ['the tag only on the contact while the top-level list has others', { tags: 'hot', contact: { tags: ['qualified'] } }, {}],
  ];
  for (const [index, [what, body, custom]] of Array.from(taggedShapes.entries())) {
    const contactId = `tag-tagged-${index}`;
    const res = await send('lead', contact(contactId, body), { stage: 'Inspection Booked', ...custom });
    assert.strictEqual(res.status, 200, what);
    assert.deepStrictEqual(res.json, { received: true, eventType: 'lead', matched: true }, what);
    assert.strictEqual(leadsFor(contactId).length, 1, `${what}: the lead is created`);
    assert.strictEqual(leadsFor(contactId)[0].tenant_id, DEMO_TENANT);
    assert.strictEqual(leadsFor(contactId)[0].status, 'Inspection Booked', `${what}: with the stage GoHighLevel sent`);
  }
  // No stage in the event (a Contact Tag trigger has no opportunity): the lead starts as New.
  await send('lead', contact('tag-no-stage', { tags: 'Qualified' }));
  assert.strictEqual(leadsFor('tag-no-stage')[0].status, 'New');
  // The rule compares with the saved tag whatever its letter case.
  await setLeadSettings({ required_tag: '  quaLIFied ' }, 'test');
  await send('lead', contact('tag-setting-case', { tags: 'Qualified' }));
  assert.strictEqual(leadsFor('tag-setting-case').length, 1);
  // A tag made of several words.
  await setLeadSettings({ required_tag: 'Hot Lead' }, 'test');
  assert.strictEqual((await send('lead', contact('tag-two-words', { tags: 'new, hot  lead' }))).json.matched, true);
  assert.strictEqual((await send('lead', contact('tag-two-words-miss', { tags: 'hot, lead' }))).json.ignored, true);
  await setLeadSettings({ required_tag: 'Qualified' }, 'test');
  console.log(' PASS: a tagged contact becomes a lead (string, array, contact.tags, customData.tags, any case or spacing).');

  // ───────────── 5. An existing lead is updated even when a later event has no tag ─────────────
  const existingId = leadsFor('tag-tagged-0')[0].id;
  const laterStage = await send('lead', contact('tag-tagged-0', { first_name: 'Renamed', phone: '+1 555 010 2222' }), { stage: 'Sold' });
  assert.strictEqual(laterStage.json.ignored, undefined, 'an untagged event for an existing lead is not ignored');
  assert.strictEqual(leadsFor('tag-tagged-0').length, 1);
  assert.strictEqual(leadsFor('tag-tagged-0')[0].id, existingId, 'the same row is updated');
  assert.strictEqual(leadsFor('tag-tagged-0')[0].status, 'Sold');
  assert.strictEqual(leadsFor('tag-tagged-0')[0].first_name, 'Renamed');
  assert.strictEqual(leadsFor('tag-tagged-0')[0].phone, '+1 555 010 2222');
  // Leads created before the rule was switched on stay and keep updating.
  await send('lead', contact('tag-default-1', { tags: 'other' }), { stage: 'Contacted' });
  assert.strictEqual(leadsFor('tag-default-1')[0].status, 'Contacted', 'a lead from before the rule keeps updating');
  // The same contact id under another location is a different lead: still needs the tag.
  assert.strictEqual((await send('lead', { ...contact('tag-tagged-0'), location: { id: 'loc_nobody_has_this' } })).json.reason, 'Unknown or missing location id.');
  console.log(' PASS: a lead that already exists is updated by an untagged stage change and is never removed by it.');

  // ───────────── 6. lead_unqualified removes the lead; Lost still wins ─────────────
  const removedBefore = audits('ghl.webhook.lead_removed').length;
  const unqualified = await send('lead_unqualified', contact('tag-tagged-1', { tags: 'hot' }));
  assert.strictEqual(unqualified.status, 200);
  assert.strictEqual(unqualified.json.removed, true);
  assert.strictEqual(leadsFor('tag-tagged-1').length, 0, 'the lead is removed when the tag is taken off');
  assert.strictEqual(audits('ghl.webhook.lead_removed').length, removedBefore + 1);
  const removalAudit = audits('ghl.webhook.lead_removed')[0];
  assert.strictEqual(removalAudit.tenant_id, DEMO_TENANT);
  assert.strictEqual(removalAudit.details?.reason, 'tag removed');
  assert.strictEqual(removalAudit.details?.leadName, 'Tess Tagged');
  assert.strictEqual(removalAudit.details?.client, 'ABC Roofing');
  assert.strictEqual(removalAudit.details?.event, 'lead_unqualified');
  assert.strictEqual(auditActionLabel('ghl.webhook.lead_removed', removalAudit.details), 'Lead removed (tag taken off in GoHighLevel)');
  assert.strictEqual(auditActionLabel('ghl.webhook.lead_removed'), 'Lead removed (marked lost in GoHighLevel)');

  // Again, or for a contact the portal never had: ignored, and this one IS recorded.
  const ignoredBefore = audits('ghl.webhook.ignored').length;
  const again = await send('lead_unqualified', contact('tag-tagged-1'));
  assert.strictEqual(again.json.ignored, true);
  assert.match(again.json.reason, /not in the portal/);
  assert.strictEqual(audits('ghl.webhook.ignored').length, ignoredBefore + 1);
  assert.strictEqual((await send('lead_unqualified', { location: { id: DEMO_LOCATION } })).status, 400, 'lead_unqualified without contact_id is rejected');
  // Tagged again later: the lead comes back.
  await send('lead', contact('tag-tagged-1', { tags: 'Qualified' }), { stage: 'New Lead' });
  assert.strictEqual(leadsFor('tag-tagged-1').length, 1, 'tagged again, the lead is back');

  // Lost / Abandoned is unchanged and wins over the tag.
  const lost = await send('lead', contact('tag-tagged-2', { tags: 'Qualified' }), { status: 'lost' });
  assert.strictEqual(lost.json.removed, true, 'a tagged lead marked Lost is still removed');
  assert.strictEqual(leadsFor('tag-tagged-2').length, 0);
  assert.strictEqual(audits('ghl.webhook.lead_removed')[0].details?.reason, undefined, 'a lost lead is not recorded as a removed tag');
  assert.strictEqual((await send('lead_lost', contact('tag-tagged-3'))).json.removed, true);
  assert.strictEqual((await send('lead', contact('tag-tagged-4', { tags: 'Qualified' }), { stage: 'Abandoned' })).json.removed, true);
  // A lost event for an untagged contact the portal never had is still recorded as before.
  const lostUnknown = await send('lead_lost', contact('tag-never-seen'));
  assert.match(lostUnknown.json.reason, /marked lost/);
  assert.strictEqual(audits('ghl.webhook.ignored')[0].details?.eventType, 'lead_lost');
  assert.ok(!JSON.stringify(store().auditLogs).includes(SECRET), 'the webhook secret never reaches the audit log');
  console.log(' PASS: lead_unqualified removes the lead and is audited as "tag removed"; Lost still removes and wins.');

  delete process.env.GHL_WEBHOOK_SECRET;
  console.log('--- GHL Lead Tag Tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
