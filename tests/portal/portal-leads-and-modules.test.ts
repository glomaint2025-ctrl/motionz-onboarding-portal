/**
 * Client portal data correctness:
 *  - the leads API pages, searches and filters on the server and reports real totals
 *  - Home gets the true lead count, not the length of a capped list
 *  - module gates on the roof, video and script routes (client switch and member access)
 *  - the profile API rejects a blank name and really clears a phone number
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById } from '../../src/lib/db';
import { createSessionToken } from '../../src/lib/auth/session';
import { leadRepository } from '../../src/lib/db/repositories/leads.repository';
import { featureToggleRepository } from '../../src/lib/db/repositories';
import { GET as leadsGet } from '../../src/app/api/portal/[clientId]/leads/route';
import { GET as dataGet } from '../../src/app/api/portal/[clientId]/data/route';
import { GET as roofGet, POST as roofPost } from '../../src/app/api/portal/[clientId]/roof-measurement/route';
import { GET as videoPrefGet, POST as videoPrefPost } from '../../src/app/api/portal/[clientId]/video-preference/route';
import { GET as scriptsGet } from '../../src/app/api/portal/[clientId]/script-templates/route';
import { PATCH as profilePatch } from '../../src/app/api/portal/[clientId]/profile/route';

for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SOLAR_API_KEY']) delete process.env[key];

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const clientId = 'abc-roofing';
const ctx = { params: { clientId } };

function req(path: string, method: string, body?: unknown, session?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (session) headers.set('cookie', `motionz_session=${session}`);
  return new NextRequest(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function run() {
  console.log('--- Portal leads and module gate tests ---');
  resetStore();

  const tenant = await getTenantById(clientId);
  assert(tenant, 'demo tenant must exist');
  const store = getStore();
  const owner = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant!.id);
  const member = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenant!.id);
  const memberUser = store.users.find((u) => u.id === 'user-member-1')!;

  // ---- Leads -------------------------------------------------------------------------------
  const seeded = store.leads.filter((l) => l.tenant_id === tenant!.id).length;
  const EXTRA = 120;
  const now = Date.now();
  for (let i = 0; i < EXTRA; i++) {
    store.leads.push({
      id: `bulk-lead-${i}`,
      tenant_id: tenant!.id,
      first_name: i === 77 ? 'Zebediah' : 'Bulk',
      last_name: i === 77 ? 'Quillfeather' : `Lead${i}`,
      email: `bulk${i}@example.com`,
      phone: `(555) 700-${String(1000 + i)}`,
      status: i % 3 === 0 ? 'Quote Sent' : 'Bulk Stage',
      source: 'Test',
      // Half arrived this week, half long ago.
      created_at: new Date(now - (i % 2 === 0 ? 1 : 30) * 24 * 60 * 60 * 1000 - i * 1000).toISOString(),
      updated_at: new Date(now).toISOString(),
    });
  }
  // A lead of another client must never be counted.
  store.leads.push({
    id: 'other-tenant-lead',
    tenant_id: 'some-other-tenant',
    first_name: 'Zebediah',
    last_name: 'Elsewhere',
    status: 'Bulk Stage',
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  });
  const total = seeded + EXTRA;
  assert(total > 100, 'the test needs more leads than any page size');

  const leadsPath = `/api/portal/${clientId}/leads`;
  const getLeadsPage = async (query = '', session = owner) => {
    const res = await leadsGet(req(`${leadsPath}${query}`, 'GET', undefined, session), ctx);
    return { status: res.status, body: await res.json() };
  };

  // Repository: a real count, not capped at the old default of 50.
  assert.strictEqual(await leadRepository.countByTenant(tenant!.id), total);

  // Default page.
  const first = await getLeadsPage();
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.leads.length, 25);
  assert.strictEqual(first.body.total, total);
  assert.strictEqual(first.body.counts.all, total);
  assert.strictEqual(first.body.page, 1);
  assert.strictEqual(first.body.pageSize, 25);
  assert.strictEqual(first.body.totalPages, Math.ceil(total / 25));
  assert.strictEqual(first.body.contracts, undefined);
  // Newest first.
  const times = first.body.leads.map((l: any) => new Date(l.created_at).getTime());
  assert.deepStrictEqual(times, [...times].sort((a: number, b: number) => b - a));
  console.log(` PASS: leads API returns page 1 of ${first.body.totalPages} with the real total (${total}).`);

  // Paging covers every lead exactly once.
  const seen = new Set<string>();
  for (let page = 1; page <= first.body.totalPages; page++) {
    const { body } = await getLeadsPage(`?page=${page}&pageSize=25`);
    body.leads.forEach((l: any) => seen.add(l.id));
  }
  assert.strictEqual(seen.size, total);
  assert(!seen.has('other-tenant-lead'));

  // Page size is capped; a page past the end falls back to the last page.
  const big = await getLeadsPage('?pageSize=5000');
  assert.strictEqual(big.body.pageSize, 100);
  assert.strictEqual(big.body.leads.length, 100);
  const beyond = await getLeadsPage('?page=999&pageSize=50');
  assert.strictEqual(beyond.body.page, beyond.body.totalPages);
  assert(beyond.body.leads.length > 0);
  const junk = await getLeadsPage('?page=abc&pageSize=-4');
  assert.strictEqual(junk.body.page, 1);
  assert.strictEqual(junk.body.pageSize, 25);
  console.log(' PASS: leads API pagination covers every lead and clamps bad input.');

  // Search runs over all leads, not just one page; totals stay unfiltered in counts.
  const search = await getLeadsPage('?search=quillfeather');
  assert.strictEqual(search.body.total, 1);
  assert.strictEqual(search.body.leads[0].id, 'bulk-lead-77');
  assert.strictEqual(search.body.counts.all, total);
  const fullName = await getLeadsPage(`?search=${encodeURIComponent('Zebediah Quillfeather')}`);
  assert.strictEqual(fullName.body.total, 1);
  const byEmail = await getLeadsPage('?search=bulk42@example.com');
  assert.strictEqual(byEmail.body.total, 1);
  const none = await getLeadsPage('?search=no-such-lead-anywhere');
  assert.strictEqual(none.body.total, 0);
  assert.deepStrictEqual(none.body.leads, []);
  const injection = await getLeadsPage(`?search=${encodeURIComponent('%,status.eq.x)')}`);
  assert.strictEqual(injection.status, 200);
  console.log(' PASS: leads API search works across all leads.');

  // Stage filter and per-stage counts.
  const quoteCount = Math.ceil(EXTRA / 3);
  const stage = await getLeadsPage(`?stage=${encodeURIComponent('Quote Sent')}&pageSize=100`);
  assert.strictEqual(stage.body.total, quoteCount);
  assert(stage.body.leads.every((l: any) => l.status === 'Quote Sent'));
  const byStage: { stage: string; count: number }[] = first.body.counts.byStage;
  assert.strictEqual(byStage.find((s) => s.stage === 'Quote Sent')!.count, quoteCount);
  assert.strictEqual(byStage.find((s) => s.stage === 'Bulk Stage')!.count, EXTRA - quoteCount);
  assert.strictEqual(byStage.reduce((sum, s) => sum + s.count, 0), total);
  assert.strictEqual(byStage[0].stage, 'Bulk Stage', 'largest stage comes first');
  const both = await getLeadsPage(`?stage=${encodeURIComponent('Quote Sent')}&search=quillfeather`);
  assert.strictEqual(both.body.total, 77 % 3 === 0 ? 1 : 0);
  assert.strictEqual((await getLeadsPage('?stage=ALL')).body.total, total);
  // "New this week" counts every recent lead, not just those on a page.
  assert(first.body.counts.newThisWeek >= EXTRA / 2);
  assert(first.body.counts.newThisWeek < total);
  console.log(' PASS: leads API stage filter and counts are correct.');

  // Home: the data API reports the true count and no longer ships the list.
  const dataPath = `/api/portal/${clientId}/data`;
  const ownerData = await (await dataGet(req(dataPath, 'GET', undefined, owner), ctx)).json();
  assert.strictEqual(ownerData.leadCount, total);
  assert.strictEqual(ownerData.leads, undefined);
  console.log(' PASS: data API returns the true lead count.');

  // ---- Module gates ------------------------------------------------------------------------
  // A member limited to Leads: the roof, video and script APIs refuse them.
  memberUser.allowed_modules = ['leads'];
  const roofPath = `/api/portal/${clientId}/roof-measurement`;
  const gated: Array<[string, () => Promise<Response>]> = [
    ['roof GET', () => roofGet(req(roofPath, 'GET', undefined, member), ctx)],
    ['roof POST', () => roofPost(req(roofPath, 'POST', { address: '1 Main St, Austin, TX' }, member), ctx)],
    ['video preference GET', () => videoPrefGet(req(`/api/portal/${clientId}/video-preference`, 'GET', undefined, member), ctx)],
    ['video preference POST', () => videoPrefPost(req(`/api/portal/${clientId}/video-preference`, 'POST', { video_preference: 'ai_video' }, member), ctx)],
    ['script templates GET', () => scriptsGet(req(`/api/portal/${clientId}/script-templates`, 'GET', undefined, member), ctx)],
  ];
  for (const [label, call] of gated) {
    const res = await call();
    assert.strictEqual(res.status, 403, `${label} must be 403 for a member without the module`);
    assert.strictEqual((await res.json()).code, 'MODULE_NOT_ALLOWED');
  }
  assert.strictEqual((await getLeadsPage('', member)).status, 200, 'the member still reaches the module they have');
  console.log(' PASS: roof, video and script routes refuse a member without the module.');

  // The data API hides every module the member was not given, even ones with no saved switch,
  // and appointments follow Book a Call (not Leads).
  store.appointments.push({
    id: 'appt-gate-test',
    tenant_id: tenant!.id,
    contact_name: 'John Smith',
    appointment_time: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    status: 'confirmed',
    created_at: new Date(now).toISOString(),
  });
  store.featureToggles = store.featureToggles.filter((t) => t.tenant_id !== tenant!.id);
  let memberData = await (await dataGet(req(dataPath, 'GET', undefined, member), ctx)).json();
  for (const key of ['onboarding', 'tracking', 'contracts', 'tools', 'roof_measurement', 'video_scripts', 'book_call', 'team']) {
    assert.strictEqual(memberData.featureToggles[key], false, `${key} must be off for this member`);
  }
  assert.notStrictEqual(memberData.featureToggles.leads, false);
  assert.strictEqual(memberData.leadCount, total);
  assert.deepStrictEqual(memberData.appointments, [], 'appointments need Book a Call, not Leads');
  assert.deepStrictEqual(memberData.contracts, []);

  memberUser.allowed_modules = ['book_call', 'roof_measurement', 'video_scripts', 'contracts'];
  memberData = await (await dataGet(req(dataPath, 'GET', undefined, member), ctx)).json();
  assert(memberData.appointments.some((a: any) => a.id === 'appt-gate-test'));
  assert.strictEqual(memberData.leadCount, 0, 'no lead count without the Leads module');
  assert.strictEqual(memberData.featureToggles.contracts, false, 'contracts stay off for team members');
  assert.strictEqual((await getLeadsPage('', member)).status, 403);
  console.log(' PASS: data API gates every module for members; appointments follow Book a Call.');

  // With the module granted the same routes work.
  const roofOk = await roofGet(req(roofPath, 'GET', undefined, member), ctx);
  assert.strictEqual(roofOk.status, 200);
  assert.strictEqual((await roofOk.json()).configured, false, 'no API key in tests');
  assert.strictEqual((await scriptsGet(req(`/api/portal/${clientId}/script-templates`, 'GET', undefined, member), ctx)).status, 200);
  assert.strictEqual((await videoPrefGet(req(`/api/portal/${clientId}/video-preference`, 'GET', undefined, member), ctx)).status, 200);

  // Switched off for the whole client: the owner is refused too, staff are not.
  await featureToggleRepository.setToggle(tenant!.id, 'roof_measurement', false);
  await featureToggleRepository.setToggle(tenant!.id, 'video_scripts', false);
  for (const call of [
    () => roofGet(req(roofPath, 'GET', undefined, owner), ctx),
    () => roofPost(req(roofPath, 'POST', { address: '1 Main St, Austin, TX' }, owner), ctx),
    () => scriptsGet(req(`/api/portal/${clientId}/script-templates`, 'GET', undefined, owner), ctx),
    () => videoPrefGet(req(`/api/portal/${clientId}/video-preference`, 'GET', undefined, owner), ctx),
  ]) {
    const res = await call();
    assert.strictEqual(res.status, 403);
    assert.strictEqual((await res.json()).code, 'MODULE_DISABLED');
  }
  const admin = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  assert.strictEqual((await roofGet(req(roofPath, 'GET', undefined, admin), ctx)).status, 200);
  console.log(' PASS: a module switched off for the client is refused for the owner, allowed for staff.');

  // ---- Profile -----------------------------------------------------------------------------
  const profilePath = `/api/portal/${clientId}/profile`;
  const nameBefore = (await getTenantById(clientId))!.name;
  for (const body of [
    { name: '', primary_contact_name: 'John Smith', phone: '+1 555 234 5678' },
    { name: '   ', primary_contact_name: 'John Smith' },
    { primary_contact_name: 'John Smith' },
    { name: 'ABC Roofing', primary_contact_name: '  ' },
    { name: 'a'.repeat(256) },
    { name: 'ABC Roofing', phone: 'call me maybe' },
  ]) {
    const res = await profilePatch(req(profilePath, 'PATCH', body, owner), ctx);
    assert.strictEqual(res.status, 400, `profile ${JSON.stringify(body).slice(0, 60)} must be 400`);
    assert(typeof (await res.json()).error === 'string');
  }
  assert.strictEqual((await getTenantById(clientId))!.name, nameBefore, 'a rejected save changes nothing');

  const withPhone = await profilePatch(
    req(profilePath, 'PATCH', { name: 'ABC Roofing Co', primary_contact_name: 'John Smith', phone: '+1 555 234 5678' }, owner),
    ctx
  );
  assert.strictEqual(withPhone.status, 200);
  const withPhoneBody = await withPhone.json();
  assert.strictEqual(withPhoneBody.tenant.name, 'ABC Roofing Co');
  assert.strictEqual(withPhoneBody.tenant.phone, '+1 555 234 5678');
  assert.strictEqual(withPhoneBody.tenant.settings, undefined);

  const cleared = await profilePatch(
    req(profilePath, 'PATCH', { name: 'ABC Roofing Co', primary_contact_name: 'John Smith', phone: '' }, owner),
    ctx
  );
  assert.strictEqual(cleared.status, 200);
  assert(!(await cleared.json()).tenant.phone, 'the response shows the phone as removed');
  assert(!(await getTenantById(clientId))!.phone, 'an emptied phone is really removed');

  const memberWrite = await profilePatch(req(profilePath, 'PATCH', { name: 'Hijacked' }, member), ctx);
  assert.strictEqual(memberWrite.status, 403);
  console.log(' PASS: profile rejects a blank name and really clears the phone.');

  console.log('All portal leads and module gate tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
