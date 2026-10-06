/**
 * "My profile": every signed-in person reads and changes only their own name, phone and picture.
 * The sign-in email is read-only here (there is no self-service email change).
 * The person always comes from the session, never from the request.
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById } from '../../src/lib/db';
import { userRepository } from '../../src/lib/db/repositories';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';
import { GET as profileGet, PUT as profilePut } from '../../src/app/api/account/profile/route';
import { POST as avatarPost, DELETE as avatarDelete } from '../../src/app/api/account/profile/avatar/route';
import { GET as meGet } from '../../src/app/api/auth/me/route';
import { getMockStoredAvatars, resetMockStoredAvatars, MAX_AVATAR_BYTES } from '../../src/lib/storage';
import { auditActionLabel } from '../../src/lib/utils/log-labels';
import { myProfileHref } from '../../src/lib/account/role-labels';

// Tests must never send real email.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY']) delete process.env[key];

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_HEADER);
  return bytes;
}

function cookieHeaders(session?: string): Headers {
  const headers = new Headers();
  if (session) headers.set('cookie', `${SESSION_COOKIE_NAME}=${session}`);
  return headers;
}

function jsonReq(path: string, method: string, session?: string, body?: unknown): NextRequest {
  const headers = cookieHeaders(session);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(`${BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function avatarReq(session: string | undefined, file?: { name: string; type: string; bytes: Uint8Array }): NextRequest {
  const form = new FormData();
  if (file) form.append('file', new Blob([file.bytes as unknown as BlobPart], { type: file.type }), file.name);
  // No explicit content-type: the multipart boundary is derived from the FormData body.
  return new NextRequest(`${BASE_URL}/api/account/profile/avatar`, { method: 'POST', headers: cookieHeaders(session), body: form });
}

const audits = (action: string) => getStore().auditLogs.filter((l) => l.action === action);

async function run() {
  console.log('--- My profile tests ---');
  resetStore();
  resetMockStoredAvatars();

  const tenant = await getTenantById('abc-roofing');
  assert(tenant, 'demo tenant must exist');
  const tenantId = tenant!.id;

  const sessions = {
    admin: createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin'),
    csm: createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm'),
    client: createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenantId),
    member: createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenantId),
  };

  // 1. Signed-out requests are refused everywhere
  assert.strictEqual((await profileGet(jsonReq('/api/account/profile', 'GET'))).status, 401);
  assert.strictEqual((await profilePut(jsonReq('/api/account/profile', 'PUT', undefined, { fullName: 'X' }))).status, 401);
  assert.strictEqual((await avatarPost(avatarReq(undefined, { name: 'a.png', type: 'image/png', bytes: pngBytes() }))).status, 401);
  assert.strictEqual((await avatarDelete(jsonReq('/api/account/profile/avatar', 'DELETE'))).status, 401);
  assert.strictEqual(getMockStoredAvatars().size, 0);
  console.log(' PASS: signed-out requests get 401 on every My profile route.');

  // 2. GET returns the caller's own details for each role
  const expected: Array<[keyof typeof sessions, string, string, string, string]> = [
    ['admin', 'admin@motionz.ai', 'Motionz Admin', 'admin', 'Admin'],
    ['csm', 'csm@motionz.ai', 'Motionz CSM', 'csm', 'CSM'],
    ['client', 'john@abcroofing.com', 'John Smith', 'client', 'Account owner'],
    ['member', 'sarah@abcroofing.com', 'Sarah Connor', 'client_member', 'Team member'],
  ];
  for (const [key, email, fullName, role, roleLabel] of expected) {
    const res = await profileGet(jsonReq('/api/account/profile', 'GET', sessions[key]));
    assert.strictEqual(res.status, 200, `${key} can read their profile`);
    assert.deepStrictEqual(await res.json(), { fullName, email, phone: '', role, roleLabel, avatarUrl: null });
  }
  console.log(' PASS: GET returns own name, email, phone, role and picture for admin, CSM, owner and team member.');

  // 3. PUT validation
  const blank = await profilePut(jsonReq('/api/account/profile', 'PUT', sessions.member, { fullName: '   ', phone: '' }));
  assert.strictEqual(blank.status, 400, 'blank name is rejected');
  const longName = await profilePut(jsonReq('/api/account/profile', 'PUT', sessions.member, { fullName: 'x'.repeat(101) }));
  assert.strictEqual(longName.status, 400, 'a name over 100 characters is rejected');
  const badPhone = await profilePut(jsonReq('/api/account/profile', 'PUT', sessions.member, { fullName: 'Sarah Connor', phone: 'call me maybe' }));
  assert.strictEqual(badPhone.status, 400, 'bad phone is rejected');
  assert.strictEqual((await userRepository.findById('user-member-1'))!.full_name, 'Sarah Connor', 'nothing saved after rejected requests');
  assert.strictEqual(audits('account.profile_updated').length, 0);

  const savedRes = await profilePut(jsonReq('/api/account/profile', 'PUT', sessions.member, { fullName: '  Sarah J. Connor ', phone: '+1 555 234 5678' }));
  assert.strictEqual(savedRes.status, 200);
  const saved = await savedRes.json();
  assert.strictEqual(saved.profile.fullName, 'Sarah J. Connor');
  assert.strictEqual(saved.profile.phone, '+1 555 234 5678');
  assert.deepStrictEqual(saved.changed, ['name', 'phone']);
  assert.strictEqual(audits('account.profile_updated').length, 1);

  const clearedRes = await profilePut(jsonReq('/api/account/profile', 'PUT', sessions.member, { fullName: 'Sarah J. Connor', phone: '' }));
  assert.strictEqual(clearedRes.status, 200);
  assert.strictEqual((await clearedRes.json()).profile.phone, '', 'an empty phone clears the saved number');
  assert(!(await userRepository.findById('user-member-1'))!.phone, 'phone removed from the user');
  console.log(' PASS: PUT rejects a blank name and a bad phone, saves valid details and clears the phone when empty.');

  // 4. No id from the client is honoured: only the session decides who is changed
  const targeted = await profilePut(
    jsonReq('/api/account/profile?userId=user-client-1&id=user-client-1', 'PUT', sessions.member, {
      id: 'user-client-1',
      userId: 'user-client-1',
      user_id: 'user-client-1',
      email: 'hijack@example.com',
      role: 'admin',
      tenant_id: 'other',
      fullName: 'Changed By Member',
    })
  );
  assert.strictEqual(targeted.status, 200);
  const owner = (await userRepository.findById('user-client-1'))!;
  assert.strictEqual(owner.full_name, 'John Smith', 'another user is never changed');
  assert.strictEqual(owner.email, 'john@abcroofing.com');
  const memberAfter = (await userRepository.findById('user-member-1'))!;
  assert.strictEqual(memberAfter.full_name, 'Changed By Member', 'the caller is the one changed');
  assert.strictEqual(memberAfter.email, 'sarah@abcroofing.com', 'email is not changed through PUT');
  assert.strictEqual(memberAfter.role, 'client_member', 'role is not changed through PUT');
  assert.strictEqual(memberAfter.tenant_id, tenantId, 'tenant is not changed through PUT');
  const tenantAfter = await getTenantById('abc-roofing');
  assert.strictEqual(tenantAfter!.primary_contact_name, tenant!.primary_contact_name, 'company contact is untouched');
  console.log(' PASS: ids, email and role sent by the browser are ignored; only the signed-in person changes.');

  // 5. Picture: wrong type, SVG, disguised content and oversized files are rejected
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const tooBig = pngBytes(MAX_AVATAR_BYTES + 1);
  const rejected: Array<[string, { name: string; type: string; bytes: Uint8Array } | undefined]> = [
    ['no file', undefined],
    ['PDF', { name: 'me.pdf', type: 'application/pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) }],
    ['GIF', { name: 'me.gif', type: 'image/gif', bytes: new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) }],
    ['SVG', { name: 'me.svg', type: 'image/svg+xml', bytes: svg }],
    ['SVG claiming to be a PNG', { name: 'me.png', type: 'image/png', bytes: svg }],
    ['PNG content sent as JPEG', { name: 'me.jpg', type: 'image/jpeg', bytes: pngBytes() }],
    ['empty file', { name: 'me.png', type: 'image/png', bytes: new Uint8Array(0) }],
    ['file over 2 MB', { name: 'me.png', type: 'image/png', bytes: tooBig }],
  ];
  for (const [label, file] of rejected) {
    const res = await avatarPost(avatarReq(sessions.client, file));
    assert.strictEqual(res.status, 400, `${label} must be rejected with 400`);
    const data = await res.json();
    assert(typeof data.error === 'string' && data.error.length > 0, `${label} must explain the problem`);
  }
  assert.strictEqual(getMockStoredAvatars().size, 0, 'rejected pictures are never stored');
  assert(!(await userRepository.findById('user-client-1'))!.avatar_path);
  console.log(' PASS: non-images, SVG, disguised files, empty files and files over 2 MB are rejected and not stored.');

  // 6. Picture: a PNG is accepted, stored under the person's own folder, and replaced/removed cleanly
  const upRes = await avatarPost(avatarReq(sessions.client, { name: '../../evil name.exe', type: 'image/png', bytes: pngBytes() }));
  assert.strictEqual(upRes.status, 200);
  const up = await upRes.json();
  assert(typeof up.avatarUrl === 'string' && up.avatarUrl.length > 0, 'a link to the picture is returned');
  const firstPath = (await userRepository.findById('user-client-1'))!.avatar_path!;
  assert(/^users\/user-client-1\/[0-9a-f-]{36}\.png$/.test(firstPath), `path is server-chosen, never the file name: ${firstPath}`);
  assert.deepStrictEqual(Array.from(getMockStoredAvatars().keys()), [firstPath]);
  assert.strictEqual(audits('account.avatar_updated').length, 1);

  const withPicture = await (await profileGet(jsonReq('/api/account/profile', 'GET', sessions.client))).json();
  assert.strictEqual(withPicture.avatarUrl, up.avatarUrl, 'GET returns the picture link');
  const me = await (await meGet(jsonReq('/api/auth/me', 'GET', sessions.client))).json();
  assert.strictEqual(me.avatarUrl, up.avatarUrl, '/api/auth/me returns the picture link for the header');
  const otherMe = await (await meGet(jsonReq('/api/auth/me', 'GET', sessions.member))).json();
  assert.strictEqual(otherMe.avatarUrl, null, "another person does not get someone else's picture");

  const jpeg = new Uint8Array(32);
  jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
  const replaceRes = await avatarPost(avatarReq(sessions.client, { name: 'me.jpg', type: 'image/jpeg', bytes: jpeg }));
  assert.strictEqual(replaceRes.status, 200);
  const secondPath = (await userRepository.findById('user-client-1'))!.avatar_path!;
  assert(secondPath.endsWith('.jpg') && secondPath !== firstPath);
  assert.deepStrictEqual(Array.from(getMockStoredAvatars().keys()), [secondPath], 'replacing removes the old picture');

  const delRes = await avatarDelete(jsonReq('/api/account/profile/avatar', 'DELETE', sessions.client));
  assert.strictEqual(delRes.status, 200);
  assert.strictEqual((await delRes.json()).avatarUrl, null);
  assert.strictEqual(getMockStoredAvatars().size, 0, 'removing deletes the stored picture');
  assert(!(await userRepository.findById('user-client-1'))!.avatar_path);
  assert.strictEqual(audits('account.avatar_removed').length, 1);
  const delAgain = await avatarDelete(jsonReq('/api/account/profile/avatar', 'DELETE', sessions.client));
  assert.strictEqual(delAgain.status, 200, 'removing when there is no picture is fine');
  assert.strictEqual(audits('account.avatar_removed').length, 1);
  console.log(' PASS: a PNG is stored under users/<id>/, shown by GET and /api/auth/me, replaced without leftovers, and removed.');

  // 7. Database without the avatar_path column: nothing breaks, pictures are simply unavailable
  const missingColumnClient = {
    from: () => ({
      update: () => ({
        eq: () => ({
          select: async () => ({
            data: null,
            error: { code: 'PGRST204', message: "Could not find the 'avatar_path' column of 'users' in the schema cache" },
          }),
        }),
      }),
    }),
  };
  assert.strictEqual(
    await userRepository.setAvatarPath('user-csm-1', 'users/user-csm-1/x.png', missingColumnClient),
    false,
    'a missing column is reported, not thrown'
  );
  // (A different person from step 5-6: picture uploads are rate limited per person.)
  const originalSetAvatarPath = userRepository.setAvatarPath;
  userRepository.setAvatarPath = async () => false;
  try {
    const res = await avatarPost(avatarReq(sessions.csm, { name: 'me.png', type: 'image/png', bytes: pngBytes() }));
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.code, 'AVATAR_UNAVAILABLE');
    assert(/not available/i.test(data.error), 'a plain message is shown');
    assert.strictEqual(getMockStoredAvatars().size, 0, 'the uploaded file is not left behind');
  } finally {
    userRepository.setAvatarPath = originalSetAvatarPath;
  }
  const noColumnGet = await profileGet(jsonReq('/api/account/profile', 'GET', sessions.csm));
  assert.strictEqual(noColumnGet.status, 200);
  assert.strictEqual((await noColumnGet.json()).avatarUrl, null, 'no saved picture is shown');
  console.log(' PASS: without the avatar_path column uploads say "not available" and the profile still loads.');

  // 8. Suspended people are refused on every route
  await userRepository.suspendUser('user-member-1', 'Left the company', 'john@abcroofing.com', 'client');
  const suspendedGet = await profileGet(jsonReq('/api/account/profile', 'GET', sessions.member));
  assert.strictEqual(suspendedGet.status, 403);
  assert.strictEqual((await suspendedGet.json()).suspended, true);
  assert.strictEqual((await profilePut(jsonReq('/api/account/profile', 'PUT', sessions.member, { fullName: 'Still Here' }))).status, 403);
  assert.strictEqual((await avatarPost(avatarReq(sessions.member, { name: 'a.png', type: 'image/png', bytes: pngBytes() }))).status, 403);
  assert.strictEqual((await avatarDelete(jsonReq('/api/account/profile/avatar', 'DELETE', sessions.member))).status, 403);
  assert.strictEqual((await userRepository.findById('user-member-1'))!.full_name, 'Changed By Member');
  assert.strictEqual(getMockStoredAvatars().size, 0);

  await userRepository.suspendUser('user-admin-1', 'Staff access disabled by an administrator.', 'other@motionz.ai', 'admin');
  assert.strictEqual((await profileGet(jsonReq('/api/account/profile', 'GET', sessions.admin))).status, 403, 'disabled staff are refused');
  await userRepository.unsuspendUser('user-admin-1');
  assert.strictEqual((await profileGet(jsonReq('/api/account/profile', 'GET', sessions.admin))).status, 200);
  console.log(' PASS: suspended team members and disabled staff are refused on every My profile route.');

  // 9. Friendly log labels and the right page for each role
  assert.strictEqual(auditActionLabel('account.profile_updated'), 'Own name or phone updated (My profile)');
  assert.strictEqual(auditActionLabel('account.avatar_updated'), 'Profile picture updated');
  assert.strictEqual(auditActionLabel('account.avatar_removed'), 'Profile picture removed');
  assert.strictEqual(myProfileHref('admin', 'abc'), '/admin/profile');
  assert.strictEqual(myProfileHref('csm', 'abc'), '/csm/profile', 'staff viewing a client still go to their staff profile');
  assert.strictEqual(myProfileHref('client', 'abc'), '/portal/abc/my-profile');
  assert.strictEqual(myProfileHref('client_member', 'abc'), '/portal/abc/my-profile');
  assert.strictEqual(myProfileHref(null, 'abc'), null);
  console.log(' PASS: log labels are plain English and each role links to its own profile page.');

  console.log('All My profile tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
