/**
 * Fixes from the client portal end-to-end test:
 *  - ghlConnected is reported by the leads and data APIs (and is never false while leads exist)
 *  - a team member must be given at least one page (invite and change access)
 *  - the team list is closed to members who cannot open the Team page
 *  - the name typed on the invite is stored on the invitation
 *  - the data API and /api/auth/me say who is signed in
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById } from '../../src/lib/db';
import { createSessionToken } from '../../src/lib/auth/session';
import { GET as leadsGet } from '../../src/app/api/portal/[clientId]/leads/route';
import { GET as dataGet } from '../../src/app/api/portal/[clientId]/data/route';
import { GET as teamGet, POST as teamPost, PUT as teamPut } from '../../src/app/api/portal/[clientId]/team/route';
import { GET as meGet } from '../../src/app/api/auth/me/route';
import { getNavGroups, roleHomeHref } from '../../src/components/layout/nav-config';

// Tests must never send real email.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY']) delete process.env[key];

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const clientId = 'abc-roofing';
const ctx = { params: { clientId } };
const NO_PAGES = 'Choose at least one page this person can see.';

function req(path: string, method: string, body?: unknown, session?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (session) headers.set('cookie', `motionz_session=${session}`);
  return new NextRequest(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const leadsPath = `/api/portal/${clientId}/leads`;
const dataPath = `/api/portal/${clientId}/data`;
const teamPath = `/api/portal/${clientId}/team`;

async function run() {
  console.log('--- Portal end-to-end fix tests ---');
  resetStore();

  const tenant = await getTenantById(clientId);
  assert(tenant, 'demo tenant must exist');
  const store = getStore();
  const owner = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant!.id);
  const member = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenant!.id);
  const csm = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');

  const leads = async () => (await leadsGet(req(leadsPath, 'GET', undefined, owner), ctx)).json();
  const data = async (session = owner) => (await dataGet(req(dataPath, 'GET', undefined, session), ctx)).json();

  // 1. ghlConnected: true for a connected client, and the location id itself is never sent.
  const connectedLeads = await leads();
  assert.strictEqual(connectedLeads.ghlConnected, true);
  const connectedData = await data();
  assert.strictEqual(connectedData.ghlConnected, true);
  assert.strictEqual(connectedData.tenant.ghl_location_id, undefined);

  // Leads exist but the location is not saved anywhere: still connected (leads only come from GHL).
  const storedTenant = store.tenants.find((t) => t.id === tenant!.id)!;
  const savedLocation = storedTenant.ghl_location_id;
  const savedIntegrations = store.integrationConfigs;
  storedTenant.ghl_location_id = undefined;
  store.integrationConfigs = savedIntegrations.filter((i) => !(i.tenant_id === tenant!.id && i.integration_type === 'ghl'));
  assert(store.leads.some((l) => l.tenant_id === tenant!.id), 'the demo client has leads');
  assert.strictEqual((await leads()).ghlConnected, true, 'a client with leads is never shown as not connected');
  assert.strictEqual((await data()).ghlConnected, true);

  // No location, no integration and no leads: not connected.
  const savedLeads = store.leads;
  store.leads = savedLeads.filter((l) => l.tenant_id !== tenant!.id);
  const emptyLeads = await leads();
  assert.strictEqual(emptyLeads.ghlConnected, false);
  assert.strictEqual(emptyLeads.counts.all, 0);
  assert.strictEqual((await data()).ghlConnected, false);

  // The location saved on the client alone is enough.
  storedTenant.ghl_location_id = 'loc_only_on_tenant';
  assert.strictEqual((await leads()).ghlConnected, true);
  assert.strictEqual((await data()).ghlConnected, true);

  storedTenant.ghl_location_id = savedLocation;
  store.integrationConfigs = savedIntegrations;
  store.leads = savedLeads;
  console.log(' PASS: ghlConnected is true when connected or when leads exist, false otherwise.');

  // 2. A team member must be given at least one page.
  const invite = (body: Record<string, unknown>) =>
    teamPost(req(teamPath, 'POST', { phone: '+1 555 234 5678', ...body }, owner), ctx);

  for (const allowed_modules of [[], ['contracts', 'team'], ['not_a_module_at_all_but_filtered', 42].slice(1)]) {
    const res = await invite({ email: 'nopages@abcroofing.com', allowed_modules });
    assert.strictEqual(res.status, 400, `invite with pages ${JSON.stringify(allowed_modules)} must be 400`);
    assert.strictEqual((await res.json()).error, NO_PAGES);
  }
  assert(!store.userInvitations.some((i) => i.email === 'nopages@abcroofing.com'), 'no invitation is created');

  for (const allowed_modules of [[], ['contracts', 'team']]) {
    const res = await teamPut(
      req(teamPath, 'PUT', { action: 'update_permissions', memberId: 'user-member-1', allowed_modules }, owner),
      ctx
    );
    assert.strictEqual(res.status, 400, 'saving a member with no pages must be 400');
    assert.strictEqual((await res.json()).error, NO_PAGES);
  }
  const sarah = store.users.find((u) => u.id === 'user-member-1')!;
  assert(Array.isArray(sarah.allowed_modules) && sarah.allowed_modules.length > 0, 'the member keeps their pages');
  console.log(' PASS: an empty page list is rejected on invite and on change access.');

  // 3. The team list is closed to a member without the Team page; owner and staff are unaffected.
  sarah.allowed_modules = ['leads', 'tools'];
  const memberTeam = await teamGet(req(teamPath, 'GET', undefined, member), ctx);
  assert.strictEqual(memberTeam.status, 403);
  const memberTeamBody = await memberTeam.json();
  assert.strictEqual(memberTeamBody.members, undefined);
  assert.strictEqual(memberTeamBody.invitations, undefined);

  for (const [label, session] of [['owner', owner], ['assigned CSM', csm]] as const) {
    const res = await teamGet(req(teamPath, 'GET', undefined, session), ctx);
    assert.strictEqual(res.status, 200, `${label} can read the team list`);
    assert((await res.json()).members.length > 0);
  }

  // The data API gives that member only their own entry, not their colleagues.
  const memberData = await data(member);
  assert.deepStrictEqual(memberData.teamMembers.map((m: any) => m.email), ['sarah@abcroofing.com']);
  assert((await data()).teamMembers.length > 1, 'the owner still gets everyone');
  console.log(' PASS: a member without the Team page gets 403 from the team list.');

  // 4. The name typed on the invite is stored (trimmed, capped at 100 characters).
  const named = await invite({ email: 'heshan.t@abcroofing.com', fullName: '  Heshan   Tharushka ', allowed_modules: ['leads'] });
  assert.strictEqual(named.status, 200);
  assert.strictEqual((await named.json()).invitation.full_name, 'Heshan Tharushka');
  assert.strictEqual(store.userInvitations.find((i) => i.email === 'heshan.t@abcroofing.com')!.full_name, 'Heshan Tharushka');

  const long = await invite({ email: 'long.name@abcroofing.com', fullName: 'A'.repeat(300), allowed_modules: ['leads'] });
  assert.strictEqual(long.status, 200);
  assert.strictEqual(store.userInvitations.find((i) => i.email === 'long.name@abcroofing.com')!.full_name!.length, 100);

  const unnamed = await invite({ email: 'no.name@abcroofing.com', fullName: '   ', allowed_modules: ['leads'] });
  assert.strictEqual(unnamed.status, 200);
  assert(!store.userInvitations.find((i) => i.email === 'no.name@abcroofing.com')!.full_name, 'a blank name is not stored');
  console.log(' PASS: the invite stores the name that was typed.');

  // 5. Identity: the data API and /api/auth/me report the signed-in person, not the account owner.
  assert.strictEqual(memberData.viewer.full_name, 'Sarah Connor');
  assert.strictEqual(memberData.viewer.role, 'client_member');
  const staffView = await data(csm);
  assert.strictEqual(staffView.viewer.role, 'csm');
  const csmUser = store.users.find((u) => u.id === 'user-csm-1')!;
  assert.strictEqual(staffView.viewer.full_name, csmUser.full_name, 'staff viewing a client are shown as themselves');

  const me = await meGet(req('/api/auth/me', 'GET', undefined, csm));
  assert.strictEqual(me.status, 200);
  const meBody = await me.json();
  assert.deepStrictEqual(Object.keys(meBody).sort(), ['email', 'fullName', 'role']);
  assert.strictEqual(meBody.fullName, csmUser.full_name);
  assert.strictEqual(meBody.role, 'csm');
  assert.strictEqual((await meGet(req('/api/auth/me', 'GET'))).status, 401);
  console.log(' PASS: the signed-in person is reported for the greeting and the header.');

  // 6. CSM navigation is "My Clients" only.
  const csmItems = getNavGroups('csm', 'demo').flatMap((g) => g.items);
  assert.deepStrictEqual(csmItems.map((i) => i.label), ['My Clients']);
  assert.strictEqual(roleHomeHref('csm', 'demo'), '/csm/clients');
  console.log(' PASS: CSM navigation has no Dashboard entry.');

  console.log('All portal end-to-end fix tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
