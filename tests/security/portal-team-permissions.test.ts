/**
 * Client portal team security: only the account owner (and assigned Motionz staff) can invite
 * people or change their access, nobody can change their own access, and team members never
 * receive pending invitations or server-only fields.
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById } from '../../src/lib/db';
import { createSessionToken } from '../../src/lib/auth/session';
import { hasPermission } from '../../src/lib/auth/permissions';
import { PORTAL_MODULES, MEMBER_SELECTABLE_MODULES } from '../../src/lib/portal-modules';
import { GET as teamGet, POST as teamPost, PUT as teamPut } from '../../src/app/api/portal/[clientId]/team/route';
import { GET as dataGet } from '../../src/app/api/portal/[clientId]/data/route';

// Tests must never send real email.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY']) delete process.env[key];

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

const teamPath = `/api/portal/${clientId}/team`;
const SERVER_ONLY_USER_FIELDS = ['password_hash', 'suspended_reason', 'suspended_by', 'suspended_by_role', 'tenant_id'];

async function run() {
  console.log('--- Portal team permission tests ---');
  resetStore();

  const tenant = await getTenantById(clientId);
  assert(tenant, 'demo tenant must exist');
  const store = getStore();

  // A second team member, so one member can try to act on another.
  store.users.push({
    id: 'user-member-2',
    email: 'mike@abcroofing.com',
    full_name: 'Mike Field',
    role: 'client_member',
    tenant_id: tenant!.id,
    password_hash: 'password',
    allowed_modules: ['leads'],
    created_at: '2026-09-13T00:00:00Z',
    updated_at: '2026-09-13T00:00:00Z',
  });

  const owner = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant!.id);
  const member = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenant!.id);
  const csm = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');

  // 1. A team member cannot disable a colleague, re-enable anyone, or widen anyone's access.
  const memberAttempts: Array<[string, Record<string, unknown>]> = [
    ['suspend a colleague', { action: 'suspend', memberId: 'user-member-2', reason: 'x' }],
    ['unsuspend a colleague', { action: 'unsuspend', memberId: 'user-member-2' }],
    ['widen own access', { action: 'update_permissions', memberId: 'user-member-1', allowed_modules: PORTAL_MODULES.map((m) => m.key) }],
    ['widen a colleague\'s access', { action: 'update_permissions', memberId: 'user-member-2', allowed_modules: ['leads', 'tools'] }],
  ];
  for (const [label, body] of memberAttempts) {
    const res = await teamPut(req(teamPath, 'PUT', body, member), ctx);
    assert.strictEqual(res.status, 403, `team member must not ${label}`);
    assert.strictEqual((await res.json()).error, 'Only the account owner can do this.');
  }
  assert.notStrictEqual(store.users.find((u) => u.id === 'user-member-2')!.status, 'suspended');
  assert.deepStrictEqual(store.users.find((u) => u.id === 'user-member-2')!.allowed_modules, ['leads']);
  console.log(' PASS: team members cannot suspend, unsuspend or change access.');

  // 2. Nobody can act on their own account.
  for (const body of [
    { action: 'suspend', memberId: 'user-client-1', reason: 'x' },
    { action: 'update_permissions', memberId: 'user-client-1', allowed_modules: [] },
  ]) {
    const res = await teamPut(req(teamPath, 'PUT', body, owner), ctx);
    assert.strictEqual(res.status, 403, 'owner must not change their own access');
    assert.strictEqual((await res.json()).error, 'You cannot change your own access.');
  }
  console.log(' PASS: acting on yourself is rejected.');

  // 3. The owner can manage members; the response never carries server-only fields.
  const suspendRes = await teamPut(req(teamPath, 'PUT', { action: 'suspend', memberId: 'user-member-2', reason: 'Left the company' }, owner), ctx);
  assert.strictEqual(suspendRes.status, 200);
  const suspendBody = await suspendRes.json();
  assert.strictEqual(suspendBody.user.status, 'suspended');
  for (const field of SERVER_ONLY_USER_FIELDS) assert.strictEqual(suspendBody.user[field], undefined, `${field} must not be returned`);

  const unsuspendRes = await teamPut(req(teamPath, 'PUT', { action: 'unsuspend', memberId: 'user-member-2' }, owner), ctx);
  assert.strictEqual(unsuspendRes.status, 200);
  console.log(' PASS: the account owner can turn a member\'s access off and on.');

  // 4. Owner-only sections can never be granted to a team member.
  assert(!MEMBER_SELECTABLE_MODULES.some((m) => m.key === 'contracts' || m.key === 'team'));
  const permRes = await teamPut(
    req(teamPath, 'PUT', { action: 'update_permissions', memberId: 'user-member-2', allowed_modules: ['leads', 'tools', 'contracts', 'team', 42] }, owner),
    ctx
  );
  assert.strictEqual(permRes.status, 200);
  assert.deepStrictEqual((await permRes.json()).user.allowed_modules, ['leads', 'tools']);
  console.log(' PASS: contract and team sections are stripped from a member\'s access.');

  // 5. An assigned CSM can manage the client's team; an unassigned CSM cannot reach the portal.
  assert(hasPermission('csm', 'team:remove'));
  const csmRes = await teamPut(req(teamPath, 'PUT', { action: 'suspend', memberId: 'user-member-2', reason: 'Requested by owner' }, csm), ctx);
  assert.strictEqual(csmRes.status, 200);
  await teamPut(req(teamPath, 'PUT', { action: 'unsuspend', memberId: 'user-member-2' }, csm), ctx);
  const otherCsm = createSessionToken('user-csm-2', 'csm.agent@motionz.ai', 'csm');
  const otherCsmRes = await teamPut(req(teamPath, 'PUT', { action: 'suspend', memberId: 'user-member-2' }, otherCsm), ctx);
  assert.strictEqual(otherCsmRes.status, 403);
  console.log(' PASS: only the assigned CSM can manage a client\'s team.');

  // 6. Invites: a bad email is a 400 with a clear message; members cannot invite.
  for (const email of ['not-an-email', 'a@b', '', 123, null, { a: 1 }]) {
    const res = await teamPost(req(teamPath, 'POST', { email, phone: '+1 555 234 5678' }, owner), ctx);
    assert.strictEqual(res.status, 400, `invite with email ${JSON.stringify(email)} must be 400`);
    const body = await res.json();
    assert(typeof body.error === 'string' && /email/i.test(body.error), 'the error must mention the email');
  }
  const memberInvite = await teamPost(req(teamPath, 'POST', { email: 'new@abcroofing.com', phone: '+1 555 234 5678' }, member), ctx);
  assert.strictEqual(memberInvite.status, 403);
  assert.strictEqual((await memberInvite.json()).error, 'Only the account owner can do this.');
  console.log(' PASS: invalid invite emails return 400; members cannot invite.');

  // 7. A good invite says whether the email was delivered and never returns the token hash.
  const inviteRes = await teamPost(
    req(teamPath, 'POST', { email: 'Crew.Lead@abcroofing.com', phone: '+1 555 234 5678', allowed_modules: ['leads', 'contracts', 'team'] }, owner),
    ctx
  );
  assert.strictEqual(inviteRes.status, 200);
  const inviteBody = await inviteRes.json();
  assert.strictEqual(typeof inviteBody.emailDelivered, 'boolean');
  assert.strictEqual(typeof inviteBody.message, 'string');
  assert.strictEqual(inviteBody.invitation.email, 'crew.lead@abcroofing.com');
  assert.strictEqual(inviteBody.invitation.token_hash, undefined);
  assert.deepStrictEqual(inviteBody.invitation.allowed_modules, ['leads'], 'owner-only sections are not granted to an invited member');
  console.log(' PASS: invite reports email delivery and hides the token hash.');

  // 8. Pending invitations: visible to the owner, hidden from team members (team and data APIs).
  const ownerTeam = await (await teamGet(req(teamPath, 'GET', undefined, owner), ctx)).json();
  assert(ownerTeam.invitations.some((i: any) => i.email === 'crew.lead@abcroofing.com'));
  assert(ownerTeam.invitations.every((i: any) => i.token_hash === undefined));
  assert.strictEqual(ownerTeam.viewer.role, 'client');
  for (const m of ownerTeam.members) {
    for (const field of SERVER_ONLY_USER_FIELDS) assert.strictEqual(m[field], undefined, `${field} must not be returned`);
  }

  // A member whose pages do not include Team cannot read the team list at all.
  const member2 = createSessionToken('user-member-2', 'mike@abcroofing.com', 'client_member', tenant!.id);
  const blockedTeam = await teamGet(req(teamPath, 'GET', undefined, member2), ctx);
  assert.strictEqual(blockedTeam.status, 403, 'a member without the Team page must not get the member list');
  assert.strictEqual((await blockedTeam.json()).members, undefined);

  // A member whose (older) page list still includes Team sees people, never invitations.
  const memberTeam = await (await teamGet(req(teamPath, 'GET', undefined, member), ctx)).json();
  assert.deepStrictEqual(memberTeam.invitations, []);
  assert.strictEqual(memberTeam.viewer.role, 'client_member');

  const dataPath = `/api/portal/${clientId}/data`;
  const memberData = await (await dataGet(req(dataPath, 'GET', undefined, member), ctx)).json();
  assert.deepStrictEqual(memberData.invitations, []);
  const ownerData = await (await dataGet(req(dataPath, 'GET', undefined, owner), ctx)).json();
  assert(ownerData.invitations.length > 0);
  assert(ownerData.invitations.every((i: any) => i.token_hash === undefined));
  console.log(' PASS: pending invitations are hidden from team members.');

  // 9. The data API only sends the client and team fields the browser needs.
  for (const data of [memberData, ownerData]) {
    for (const field of ['settings', 'template_id', 'suspended_at', 'suspended_reason', 'suspended_by', 'ghl_location_id']) {
      assert.strictEqual(data.tenant[field], undefined, `tenant.${field} must not be sent to the browser`);
    }
    assert.strictEqual(data.tenant.name, tenant!.name);
    assert(data.teamMembers.length > 0);
    for (const m of data.teamMembers) {
      assert.deepStrictEqual(
        Object.keys(m).filter((k) => m[k] !== undefined).sort(),
        Object.keys(m).filter((k) => ['id', 'full_name', 'email', 'phone', 'role', 'status', 'created_at', 'allowed_modules'].includes(k) && m[k] !== undefined).sort()
      );
    }
  }
  console.log(' PASS: data API whitelists client and team member fields.');

  console.log('All portal team permission tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
