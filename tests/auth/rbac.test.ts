import assert from 'assert';
import { getStore, resetStore } from '../../src/lib/db';
import { authenticateStaff, isStaffEmail } from '../../src/lib/auth/staff';
import { createInvitation, verifyInvitationToken, revokeInvitation } from '../../src/lib/auth/invitations';
import { createSessionToken, verifySession } from '../../src/lib/auth/session';
import { hasPermission, assertPermission, assertTenantAccess } from '../../src/lib/auth/permissions';
import { sanitizeRedirectUrl } from '../../src/lib/auth/security-utils';
import { invitationService } from '../../src/lib/services/invitation.service';
import { requireAuth } from '../../src/lib/auth/guard';
import { NextRequest } from 'next/server';

async function runAuthAndRbacTests() {
  console.log('--- Running Comprehensive Auth and RBAC Production Test Matrix ---');
  resetStore();

  const demoTenantId = 'tenant-demo-abc-roofing';

  // ==========================================================
  // SECTION 1: STAFF AUTHENTICATION & DOMAIN POLICY
  // ==========================================================
  console.log('\n[1/7] Testing Staff Authentication & Domain Policy...');

  // 1.1: Valid @motionz.ai emails
  assert.strictEqual(isStaffEmail('sarah@motionz.ai'), true, 'Valid @motionz.ai email must pass domain check');
  assert.strictEqual(isStaffEmail('steve@motionz.ai'), true, 'Valid @motionz.ai email must pass domain check');

  // 1.2: External emails attempting staff login
  assert.strictEqual(isStaffEmail('sarah@gmail.com'), false, 'Non-staff email must fail domain check');
  assert.strictEqual(isStaffEmail('hacker@abcroofing.com'), false, 'Client email cannot pass staff domain check');
  assert.strictEqual(isStaffEmail('admin@notmotionz.ai'), false, 'Lookalike domain must fail');

  // 1.2b: STAFF_EXTRA_EMAILS allows exact addresses only (staging test staff)
  const previousExtra = process.env.STAFF_EXTRA_EMAILS;
  process.env.STAFF_EXTRA_EMAILS = ' Tester+CSM@gmail.com , not-an-email ';
  assert.strictEqual(isStaffEmail('tester+csm@gmail.com'), true, 'Listed extra address is staff');
  assert.strictEqual(isStaffEmail('tester@gmail.com'), false, 'Only the exact listed address is staff');
  assert.strictEqual(isStaffEmail('not-an-email'), false, 'Malformed entries are ignored');
  if (previousExtra === undefined) delete process.env.STAFF_EXTRA_EMAILS;
  else process.env.STAFF_EXTRA_EMAILS = previousExtra;
  assert.strictEqual(isStaffEmail('tester+csm@gmail.com'), false, 'Without the setting, the address is not staff');

  // 1.3: Staff authentication: Admin
  const adminAuth = await authenticateStaff('admin@motionz.ai', 'admin');
  assert.strictEqual(adminAuth.success, true, 'Designated admin authentication succeeds');
  assert.strictEqual(adminAuth.user?.role, 'admin');

  // 1.4: Staff authentication: CSM
  const csmAuth = await authenticateStaff('csm.agent@motionz.ai', 'csm');
  assert.strictEqual(csmAuth.success, true, 'Staff CSM authentication succeeds');
  assert.strictEqual(csmAuth.user?.role, 'csm');

  // 1.5: External user attempting Admin or CSM
  const externalAdmin = await authenticateStaff('intruder@external.com', 'admin');
  assert.strictEqual(externalAdmin.success, false, 'External user attempting admin is rejected');
  assert(externalAdmin.error?.includes('restricted to verified @motionz.ai'), 'Clear error on domain restriction');

  const externalCsm = await authenticateStaff('intruder@external.com', 'csm');
  assert.strictEqual(externalCsm.success, false, 'External user attempting CSM is rejected');

  // 1.6: Security alert verification for domain violation
  const store = getStore();
  const domainAlerts = store.securityEvents.filter((e) => e.event_type === 'unauthorized_staff_domain_access');
  assert(domainAlerts.length >= 2, 'Unauthorized staff attempts must be logged to security_events');

  // 1.7: Role tampering prevention: non-designated staff attempting to self-promote to admin
  const unauthorizedAdminAttempt = await authenticateStaff('newhire@motionz.ai', 'admin');
  assert.strictEqual(unauthorizedAdminAttempt.success, false, 'Non-designated staff member cannot self-promote to admin');
  assert(
    store.securityEvents.some((e) => e.event_type === 'staff_privilege_escalation_attempt'),
    'Staff privilege escalation attempt must record a security alert'
  );

  console.log(' PASS: Staff domain restriction, role authorization, and intrusion defense verified');

  // ==========================================================
  // SECTION 2: CLIENT MAGIC-LINK INVITATION LIFECYCLE
  // ==========================================================
  console.log('\n[2/7] Testing Client Magic Link Lifecycle...');

  // 2.1: Valid client invitation creation
  const { rawToken, invitation } = await createInvitation({
    tenantId: demoTenantId,
    email: 'client.owner@abcroofing.com',
    role: 'client',
  });
  assert.ok(rawToken && rawToken.length >= 32, 'Raw token must be cryptographically random (at least 32 bytes)');
  assert.notStrictEqual(invitation.token_hash, rawToken, 'Only the token hash may be stored in database');

  // 2.2: Verification of valid token
  const verifySuccess = await verifyInvitationToken(rawToken);
  assert.strictEqual(verifySuccess.success, true, 'Valid magic link token must verify');
  assert.strictEqual(verifySuccess.user?.email, 'client.owner@abcroofing.com');
  assert.strictEqual(verifySuccess.user?.role, 'client');
  assert.strictEqual(verifySuccess.tenantId, demoTenantId);

  // 2.3: Single-use enforcement: reused token rejection
  const verifyReuse = await verifyInvitationToken(rawToken);
  assert.strictEqual(verifyReuse.success, false, 'Used magic link token must be rejected');
  assert(verifyReuse.error?.includes('already been used'), 'Single-use exhaustion reported');

  // 2.4: Revocation enforcement
  const { rawToken: tokenToRevoke, invitation: invToRevoke } = await createInvitation({
    tenantId: demoTenantId,
    email: 'revoked.client@abcroofing.com',
    role: 'client',
  });
  await revokeInvitation(invToRevoke.id, 'admin@motionz.ai');
  const verifyRevoked = await verifyInvitationToken(tokenToRevoke);
  assert.strictEqual(verifyRevoked.success, false, 'Revoked token must be rejected');
  assert(verifyRevoked.error?.includes('cancelled'), 'Cancellation reason reported');

  // 2.5: Expiration enforcement
  const { rawToken: expiredToken } = await createInvitation({
    tenantId: demoTenantId,
    email: 'expired.client@abcroofing.com',
    role: 'client',
    expiresInHours: -1, // Expired 1 hour ago
  });
  const verifyExpired = await verifyInvitationToken(expiredToken);
  assert.strictEqual(verifyExpired.success, false, 'Expired token must be rejected');
  assert(verifyExpired.error?.includes('expired'), 'Expiration window enforcement reported');

  // 2.6: Modified / tampered token
  const tamperedToken = rawToken.slice(0, -4) + 'abcd';
  const verifyTampered = await verifyInvitationToken(tamperedToken);
  assert.strictEqual(verifyTampered.success, false, 'Tampered token must fail lookup');

  // 2.7: Safe resend policy: creating a second invitation revokes previous pending
  const { rawToken: resend1, invitation: inv1 } = await createInvitation({
    tenantId: demoTenantId,
    email: 'resend.test@abcroofing.com',
    role: 'client',
  });
  const { rawToken: resend2, invitation: inv2 } = await createInvitation({
    tenantId: demoTenantId,
    email: 'resend.test@abcroofing.com',
    role: 'client',
  });
  // Older invitation must be revoked
  const verifyResend1 = await verifyInvitationToken(resend1);
  assert.strictEqual(verifyResend1.success, false, 'Prior pending invitation must be superseded and revoked');
  // Newer invitation must succeed
  const verifyResend2 = await verifyInvitationToken(resend2);
  assert.strictEqual(verifyResend2.success, true, 'Newest invitation succeeds on resend');

  console.log(' PASS: Complete magic-link invitation lifecycle (create, verify, single-use, revoke, expire, resend) verified');

  // ==========================================================
  // SECTION 3: CLIENT MEMBER AUTHENTICATION & BOUNDARIES
  // ==========================================================
  console.log('\n[3/7] Testing Client Member Authentication & Boundaries...');

  // 3.1: Invitation with only Email + Phone (no other required fields)
  const memberEmail = 'installer.dan@abcroofing.com';
  const memberPhone = '+1 (555) 444-9999';
  const { rawToken: memberToken, invitation: memberInv } = await createInvitation({
    tenantId: demoTenantId,
    email: memberEmail,
    phone: memberPhone,
    role: 'client_member',
  });
  assert.strictEqual(memberInv.email, memberEmail);
  assert.strictEqual(memberInv.phone, memberPhone);
  assert.strictEqual(memberInv.role, 'client_member');

  // 3.2: Member acceptance & identity assignment
  const memberAccept = await verifyInvitationToken(memberToken);
  assert.strictEqual(memberAccept.success, true);
  assert.strictEqual(memberAccept.user?.email, memberEmail);
  assert.strictEqual(memberAccept.user?.role, 'client_member', 'Role strictly assigned to client_member');
  assert.strictEqual(memberAccept.tenantId, demoTenantId, 'Tenant strictly tied to inviting client');

  console.log(' PASS: Client Member invitation requires only email + phone, enforces client_member role & tenant');

  // ==========================================================
  // SECTION 4: CENTRALIZED RBAC & CAPABILITY GUARDS
  // ==========================================================
  console.log('\n[4/7] Testing Centralized RBAC & Capabilities...');

  // 4.1: Admin capabilities
  assert.strictEqual(hasPermission('admin', 'platform:analytics'), true);
  assert.strictEqual(hasPermission('admin', 'portal:delete'), true);
  assert.strictEqual(hasPermission('admin', 'portal:feature_toggle'), true);
  assert.strictEqual(hasPermission('admin', 'onboarding:update_status'), true);

  // 4.2: CSM capabilities and boundaries
  assert.strictEqual(hasPermission('csm', 'onboarding:update_status'), true, 'CSM can update onboarding steps');
  assert.strictEqual(hasPermission('csm', 'onboarding:view_guidance'), true, 'CSM can view guidance');
  assert.strictEqual(hasPermission('csm', 'portal:delete'), false, 'CSM cannot delete client portals');
  assert.strictEqual(hasPermission('csm', 'portal:feature_toggle'), false, 'CSM cannot modify feature toggles');
  assert.strictEqual(hasPermission('csm', 'platform:analytics'), false, 'CSM cannot view platform analytics');

  // 4.3: Client capabilities and boundaries
  assert.strictEqual(hasPermission('client', 'client:view_contract'), true);
  assert.strictEqual(hasPermission('client', 'team:invite'), true);
  assert.strictEqual(hasPermission('client', 'profile:update'), true);
  assert.strictEqual(hasPermission('client', 'portal:delete'), false);
  assert.strictEqual(hasPermission('client', 'onboarding:update_status'), false, 'Client cannot override step status');

  // 4.4: Client Member capabilities and boundaries
  assert.strictEqual(hasPermission('client_member', 'client:view_leads'), true);
  assert.strictEqual(hasPermission('client_member', 'client:use_tools'), true);
  assert.strictEqual(hasPermission('client_member', 'team:invite'), false, 'Client Member cannot invite users');
  assert.strictEqual(hasPermission('client_member', 'profile:update'), false, 'Client Member cannot edit profile');
  assert.strictEqual(hasPermission('client_member', 'client:view_contract'), false, 'Client Member cannot view contracts');

  // 4.5: assertPermission helper throws on disallowed capability
  assert.throws(() => {
    assertPermission('client_member', 'team:invite');
  }, /Unauthorized/);

  console.log(' PASS: Granular capability guards strictly enforce role boundaries');

  // ==========================================================
  // SECTION 5: TENANT ISOLATION
  // ==========================================================
  console.log('\n[5/7] Testing Tenant Isolation Boundaries...');

  const tenantA = 'tenant-a-11111111';
  const tenantB = 'tenant-b-22222222';

  // 5.1: Client A accessing Tenant A (allowed)
  assert.doesNotThrow(() => {
    assertTenantAccess({ role: 'client', tenantId: tenantA }, tenantA);
  }, 'Client accessing own tenant succeeds');

  // 5.2: Client A accessing Tenant B (denied)
  assert.throws(() => {
    assertTenantAccess({ role: 'client', tenantId: tenantA }, tenantB);
  }, /Forbidden/, 'Client A accessing Tenant B is strictly denied');

  // 5.3: Client Member A accessing Tenant B (denied)
  assert.throws(() => {
    assertTenantAccess({ role: 'client_member', tenantId: tenantA }, tenantB);
  }, /Forbidden/, 'Client Member A accessing Tenant B is strictly denied');

  // 5.4: Staff accessing any tenant (allowed)
  assert.doesNotThrow(() => {
    assertTenantAccess({ role: 'admin' }, tenantB);
    assertTenantAccess({ role: 'csm' }, tenantB);
  }, 'Staff accessing tenant is authorized');

  console.log(' PASS: Tenant isolation strictly protects cross-tenant boundaries');

  // ==========================================================
  // SECTION 6: SESSION CRYPTOGRAPHY, LOGOUT & OPEN REDIRECT
  // ==========================================================
  console.log('\n[6/7] Testing Session Security, Logout, and Open Redirect Defense...');

  // 6.1: Valid session token
  const token = createSessionToken('usr-admin', 'admin@motionz.ai', 'admin');
  const verified = verifySession(token);
  assert.ok(verified);
  assert.strictEqual(verified.email, 'admin@motionz.ai');
  assert.strictEqual(verified.role, 'admin');

  // 6.2: Tampered payload
  const tamperedPayload = 'eyJ1c2VySWQiOiJ1c3ItYWRtaW4iLCJlbWFpbCI6ImhhY2tlckBldmlsLmNvbSJ9.' + token.split('.')[1];
  assert.strictEqual(verifySession(tamperedPayload), null, 'Tampered session payload must be rejected');

  // 6.3: Malformed tokens
  assert.strictEqual(verifySession(''), null);
  assert.strictEqual(verifySession('not.a.valid.jwt.token'), null);
  assert.strictEqual(verifySession('singleparttoken'), null);

  // 6.4: Expired session token
  const expiredSessionToken = createSessionToken('usr-old', 'csm@motionz.ai', 'csm', undefined, -1);
  assert.strictEqual(verifySession(expiredSessionToken), null, 'Expired session token must be rejected');

  // 6.5: Open redirect sanitization
  assert.strictEqual(sanitizeRedirectUrl('/portal/abc', '/fallback'), '/portal/abc', 'Valid relative path accepted');
  assert.strictEqual(sanitizeRedirectUrl('/admin', '/fallback'), '/admin', 'Valid relative path accepted');
  assert.strictEqual(sanitizeRedirectUrl('https://attacker.example.com', '/fallback'), '/fallback', 'Absolute external URL blocked');
  assert.strictEqual(sanitizeRedirectUrl('http://attacker.example.com', '/fallback'), '/fallback', 'Insecure external URL blocked');
  assert.strictEqual(sanitizeRedirectUrl('//attacker.example.com/portal', '/fallback'), '/fallback', 'Protocol-relative URL blocked');
  assert.strictEqual(sanitizeRedirectUrl('/\\attacker.example.com', '/fallback'), '/fallback', 'Backslash transition URL blocked');
  assert.strictEqual(sanitizeRedirectUrl('javascript:alert(1)', '/fallback'), '/fallback', 'JavaScript URI scheme blocked');

  console.log(' PASS: Session verification, signature integrity, and open redirect defense verified');

  // ==========================================================
  // SECTION 7: CONCURRENCY & RACE-CONDITION PROTECTION
  // ==========================================================
  console.log('\n[7/7] Testing Concurrency & Race-Condition Protection...');

  const { rawToken: raceToken } = await createInvitation({
    tenantId: demoTenantId,
    email: 'racer@abcroofing.com',
    role: 'client',
  });

  // Simulate two concurrent acceptance requests firing simultaneously
  const [attempt1, attempt2] = await Promise.allSettled([
    invitationService.verifyAndAccept(raceToken),
    invitationService.verifyAndAccept(raceToken),
  ]);

  const successCount = [attempt1, attempt2].filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = [attempt1, attempt2].filter((r) => r.status === 'rejected').length;

  assert.strictEqual(successCount, 1, 'Exactly one concurrent verification request may claim the token');
  assert.strictEqual(rejectedCount, 1, 'The competing concurrent request must be rejected');

  console.log(' PASS: Atomic invitation claim prevents concurrent double-acceptance race conditions');

  console.log('\n================================================================');
  console.log(' ALL AUTH AND RBAC PRODUCTION TEST MATRIX SUITES PASSED CLEANLY ');
  console.log('================================================================\n');
}

runAuthAndRbacTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
