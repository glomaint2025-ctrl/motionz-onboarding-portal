import assert from 'assert';
import { POST as resetPasswordHandler } from '../../src/app/api/auth/reset-password/route';
import { POST as verifyHandler } from '../../src/app/api/auth/verify/route';
import { resetStore, getStore } from '../../src/lib/db';
import { userRepository, tenantRepository, passwordResetRepository } from '../../src/lib/db/repositories';
import { createInvitation, resendInvitation, verifyInvitationToken, setAuthPassword } from '../../src/lib/auth/invitations';
import { invitationService, titleCaseFromEmail } from '../../src/lib/services/invitation.service';
import { handleAuthError } from '../../src/lib/auth/guard';
import { AppError, ValidationError, NotFoundError, ConflictError, DatabaseError } from '../../src/lib/errors';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

function makeJsonRequest(path: string, body: any): Request {
  return new Request(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `test-ip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    },
    body: JSON.stringify(body),
  });
}

/** Minimal stand-in for the Supabase admin auth API. */
function fakeAuthClient(opts: {
  usersById?: Record<string, { id: string; email: string }>;
  pages?: { id: string; email: string }[][];
  updateError?: { message: string } | null;
  createError?: { message: string } | null;
}) {
  const calls = { getUserById: 0, listUsers: [] as number[], updated: [] as string[], created: [] as any[] };
  const client = {
    auth: {
      admin: {
        getUserById: async (id: string) => {
          calls.getUserById++;
          const user = opts.usersById?.[id];
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'User not found' } };
        },
        listUsers: async ({ page }: { page: number; perPage: number }) => {
          calls.listUsers.push(page);
          return { data: { users: opts.pages?.[page - 1] || [] }, error: null };
        },
        updateUserById: async (id: string) => {
          calls.updated.push(id);
          return { data: {}, error: opts.updateError || null };
        },
        createUser: async (attrs: any) => {
          calls.created.push(attrs);
          return { data: {}, error: opts.createError || null };
        },
      },
    },
  };
  return { client, calls };
}

async function run() {
  console.log('--- Running shared auth/library audit-fix tests ---');
  resetStore();
  const store = getStore();

  const tenant = await tenantRepository.create({
    name: 'Summit Roofing',
    slug: 'summit-roofing',
    primary_email: 'owner@summitroofing.com',
    primary_contact_name: 'Maria Alvarez',
    status: 'onboarding',
  } as any);

  // ---------------------------------------------------------------- Item 1
  const restricted = ['onboarding', 'leads'];
  const original = await createInvitation({
    tenantId: tenant.id,
    email: 'restricted.member@summitroofing.com',
    role: 'client_member',
    fullName: 'Dana Whitfield',
    allowed_modules: restricted,
    notify: false,
  });
  assert.deepStrictEqual(original.invitation.allowed_modules, restricted);

  const resent = await resendInvitation({
    invitationId: original.invitation.id,
    actorEmail: 'owner@summitroofing.com',
    actorRole: 'client',
    baseUrl: BASE_URL,
  });
  assert.notStrictEqual(resent.invitation.id, original.invitation.id, 'Resend issues a new invitation');
  assert.deepStrictEqual(resent.invitation.allowed_modules, restricted, 'Resent invitation keeps module restrictions');
  assert.strictEqual(resent.invitation.full_name, 'Dana Whitfield', 'Resent invitation keeps the invitee name');

  const oldLink = await verifyInvitationToken(original.rawToken);
  assert.strictEqual(oldLink.success, false, 'Original link is revoked by the resend');

  const acceptedRestricted = await verifyInvitationToken(resent.rawToken);
  assert.strictEqual(acceptedRestricted.success, true);
  assert.deepStrictEqual(
    acceptedRestricted.user?.allowed_modules,
    restricted,
    'Accepting a resent restricted invite must NOT grant full module access'
  );
  const storedRestricted = await userRepository.findByEmail('restricted.member@summitroofing.com');
  assert.deepStrictEqual(storedRestricted?.allowed_modules, restricted);
  console.log(' PASS [1]: resend preserves allowed_modules through acceptance');

  // ---------------------------------------------------------------- Item 5
  assert.strictEqual(acceptedRestricted.user?.full_name, 'Dana Whitfield', 'fullName from the invitation is used');

  const ownerInvite = await createInvitation({
    tenantId: tenant.id,
    email: 'owner@summitroofing.com',
    role: 'client',
    notify: false,
  });
  const owner = await verifyInvitationToken(ownerInvite.rawToken);
  assert.strictEqual(owner.user?.full_name, 'Maria Alvarez', 'Account owner falls back to the tenant primary contact name');

  const memberInvite = await createInvitation({
    tenantId: tenant.id,
    email: 'john.doe_smith@summitroofing.com',
    role: 'client_member',
    notify: false,
  });
  const member = await verifyInvitationToken(memberInvite.rawToken);
  assert.strictEqual(member.user?.full_name, 'John Doe Smith', 'Fallback name is a Title-Cased email local part');
  assert.strictEqual(member.user?.allowed_modules, undefined, 'Unrestricted invite stays unrestricted');
  assert.strictEqual(titleCaseFromEmail('SARAH-jane@x.com'), 'Sarah Jane');
  console.log(' PASS [5]: invitee name used on acceptance, with sensible fallbacks');

  // ---------------------------------------------------------------- Item 6
  const expired = await createInvitation({
    tenantId: tenant.id,
    email: 'late@summitroofing.com',
    role: 'client_member',
    expiresInHours: -1,
    notify: false,
  });
  const expiredCheck = await invitationService.validateInvitation(expired.rawToken);
  assert.strictEqual(expiredCheck.error, 'This invitation link has expired. Ask for a new one.');
  const expiredAccept = await verifyInvitationToken(expired.rawToken);
  assert.strictEqual(expiredAccept.error, 'This invitation link has expired. Ask for a new one.');
  const defaultExpiry = new Date(memberInvite.invitation.expires_at).getTime() - Date.now();
  assert(Math.abs(defaultExpiry - 72 * 3600 * 1000) < 60 * 1000, 'Default expiry is still 72 hours');
  console.log(' PASS [6]: expiry wording updated, 72-hour default kept');

  // ---------------------------------------------------------------- Item 3
  const pwInvite = await createInvitation({
    tenantId: tenant.id,
    email: 'newhire@summitroofing.com',
    role: 'client_member',
    notify: false,
  });
  const findInvite = () => store.userInvitations.find((i) => i.id === pwInvite.invitation.id)!;

  for (const badPassword of [undefined, '', 'short', 1234567890, 'x'.repeat(201)]) {
    const res = await verifyHandler(makeJsonRequest('/api/auth/verify', { token: pwInvite.rawToken, password: badPassword }));
    assert.strictEqual(res.status, 400, `Password ${JSON.stringify(badPassword)?.slice(0, 20)} must be rejected with 400`);
    const body = await res.json();
    assert(/password/i.test(body.error), 'Error explains the password rule');
    assert.strictEqual(findInvite().accepted_at, undefined, 'Invitation must NOT be consumed by a rejected password');
    assert.strictEqual(res.headers.get('set-cookie'), null, 'No session issued');
  }
  assert.strictEqual(await userRepository.findByEmail('newhire@summitroofing.com'), null, 'No account created');

  const okRes = await verifyHandler(makeJsonRequest('/api/auth/verify', { token: pwInvite.rawToken, password: 'long-enough-1' }));
  assert.strictEqual(okRes.status, 200, 'Same invitation still works with a valid password');
  assert.ok(findInvite().accepted_at, 'Invitation consumed on success');
  assert.ok(okRes.headers.get('set-cookie'), 'Session issued on success');
  console.log(' PASS [3]: short/missing password -> 400 and invitation not consumed');

  // Auth-user lookup does not depend on the first page of listUsers
  {
    const id = '11111111-1111-4111-8111-111111111111';
    const direct = fakeAuthClient({ usersById: { [id]: { id, email: 'a@x.com' } } });
    assert.deepStrictEqual(await setAuthPassword({ userId: id, email: 'A@x.com', password: 'long-enough-1' }, direct.client), { ok: true });
    assert.deepStrictEqual(direct.calls.updated, [id]);
    assert.deepStrictEqual(direct.calls.listUsers, [], 'Direct id lookup needs no listing');

    const filler = Array.from({ length: 1000 }, (_, i) => ({ id: `filler-${i}`, email: `filler${i}@x.com` }));
    const paged = fakeAuthClient({ pages: [filler, [{ id: 'auth-on-page-2', email: 'deep@x.com' }]] });
    assert.deepStrictEqual(await setAuthPassword({ userId: id, email: 'deep@x.com', password: 'long-enough-1' }, paged.client), { ok: true });
    assert.deepStrictEqual(paged.calls.listUsers, [1, 2], 'Keeps paging until the user is found');
    assert.deepStrictEqual(paged.calls.updated, ['auth-on-page-2']);
    assert.strictEqual(paged.calls.created.length, 0);

    const missing = fakeAuthClient({ pages: [[]] });
    assert.deepStrictEqual(await setAuthPassword({ userId: id, email: 'new@x.com', password: 'long-enough-1' }, missing.client), { ok: true });
    assert.strictEqual(missing.calls.created.length, 1, 'Missing auth user is created');
    assert.strictEqual(missing.calls.created[0].id, id);
    assert.strictEqual(missing.calls.created[0].email, 'new@x.com');
  }
  console.log(' PASS [3]: auth user found by id, then by paging, else created');

  // ---------------------------------------------------------------- Item 2
  {
    const id = '22222222-2222-4222-8222-222222222222';
    const failing = fakeAuthClient({ usersById: { [id]: { id, email: 'b@x.com' } }, updateError: { message: 'update refused' } });
    const originalError = console.error;
    console.error = () => {};
    const failed = await setAuthPassword({ userId: id, email: 'b@x.com', password: 'long-enough-1' }, failing.client);
    const createFails = fakeAuthClient({ pages: [[]], createError: { message: 'create refused' } });
    const failedCreate = await setAuthPassword({ userId: id, email: 'c@x.com', password: 'long-enough-1' }, createFails.client);
    console.error = originalError;
    assert.strictEqual(failed.ok, false, 'A returned { error } from updateUserById is reported as failure');
    assert.strictEqual(failedCreate.ok, false, 'A returned { error } from createUser is reported as failure');
  }

  const resetToken = 'reset-token-for-audit-test';
  const resetRecord = await passwordResetRepository.create('owner@summitroofing.com', resetToken, 60);
  const findReset = () => store.passwordResetTokens.find((t) => t.id === resetRecord.id)!;

  const shortRes = await resetPasswordHandler(makeJsonRequest('/api/auth/reset-password', { token: resetToken, password: 'short' }));
  assert.strictEqual(shortRes.status, 400);
  assert.ok(!findReset().used_at, 'Reset token must NOT be marked used when the password is rejected');

  const longRes = await resetPasswordHandler(makeJsonRequest('/api/auth/reset-password', { token: resetToken, password: 'x'.repeat(201) }));
  assert.strictEqual(longRes.status, 400);
  assert.ok(!findReset().used_at);

  const goodRes = await resetPasswordHandler(makeJsonRequest('/api/auth/reset-password', { token: resetToken, password: 'long-enough-1' }));
  assert.strictEqual(goodRes.status, 200);
  assert.strictEqual((await goodRes.json()).success, true);
  assert.ok(findReset().used_at, 'Reset token is marked used only after success');

  const reuseRes = await resetPasswordHandler(makeJsonRequest('/api/auth/reset-password', { token: resetToken, password: 'long-enough-2' }));
  assert.strictEqual(reuseRes.status, 400, 'A used reset link cannot be reused');
  console.log(' PASS [2]: password save failures are reported; token spent only on success');

  // ---------------------------------------------------------------- Item 4
  const validation = handleAuthError(new ValidationError('Phone number is not valid.'));
  assert.strictEqual(validation.status, 400);
  const validationBody = await validation.json();
  assert.strictEqual(validationBody.error, 'Phone number is not valid.');
  assert.strictEqual(validationBody.code, 'VALIDATION_ERROR');

  const notFound = handleAuthError(new NotFoundError('Lead'));
  assert.strictEqual(notFound.status, 404);
  assert.strictEqual((await notFound.json()).error, 'Lead not found.');

  const conflict = handleAuthError(new ConflictError('That name is already taken.'));
  assert.strictEqual(conflict.status, 409);
  assert.strictEqual((await conflict.json()).error, 'That name is already taken.');

  for (const status of [422, 429]) {
    const res = handleAuthError(new AppError('Plain message.', status, 'SOME_CODE'));
    assert.strictEqual(res.status, status);
    assert.strictEqual((await res.json()).error, 'Plain message.');
  }

  const originalError = console.error;
  const logged: any[] = [];
  console.error = (...args: any[]) => logged.push(args);
  const dbFailure = handleAuthError(new DatabaseError('Failed to list leads: relation "leads" does not exist', { hint: 'secret' }));
  const crash = handleAuthError(new TypeError("Cannot read properties of undefined (reading 'id')"));
  const empty = handleAuthError(undefined);
  console.error = originalError;

  for (const res of [dbFailure, crash, empty]) {
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.error, 'Something went wrong. Please try again.');
    assert(!JSON.stringify(body).includes('relation') && !JSON.stringify(body).includes('undefined'), 'No internal details leak');
  }
  assert.strictEqual(logged.length, 3, 'Real errors are logged server-side');

  const unauth = handleAuthError(new AppError('Authentication required to access this resource.', 401, 'UNAUTHENTICATED'));
  assert.strictEqual(unauth.status, 401);
  assert.strictEqual((await unauth.json()).error, 'Authentication required. Please sign in.');

  const forbidden = handleAuthError(new AppError('Forbidden: Insufficient role permissions.', 403, 'FORBIDDEN'));
  assert.strictEqual(forbidden.status, 403);
  assert.strictEqual((await forbidden.json()).error, 'Forbidden: Insufficient role permissions.');

  const suspended = handleAuthError(new AppError('Your account has been suspended: test', 403, 'ACCOUNT_SUSPENDED'));
  assert.strictEqual(suspended.status, 403);
  assert.strictEqual((await suspended.json()).suspended, true);
  assert.ok(suspended.headers.get('set-cookie'), 'Suspension still clears the session cookie');
  console.log(' PASS [4]: handleAuthError surfaces client errors, hides server errors, keeps 401/403 behaviour');

  console.log('--- ALL SHARED AUDIT-FIX TESTS PASSED ---');
}

run().catch((err) => {
  console.error('FAIL: shared audit-fix tests:', err);
  process.exit(1);
});
