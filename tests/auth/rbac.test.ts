import assert from 'assert';
import { getStore, resetStore } from '../../src/lib/db';
import { authenticateStaff, isStaffEmail } from '../../src/lib/auth/staff';
import { createInvitation, verifyInvitationToken, revokeInvitation } from '../../src/lib/auth/invitations';
import { createSessionToken, verifySession } from '../../src/lib/auth/session';
import { hasPermission, assertPermission, assertTenantAccess } from '../../src/lib/auth/permissions';

async function runAuthAndRbacTests() {
  console.log('Running Auth and RBAC Integration Tests...');
  resetStore();

  // Test 1: Staff Email Domain Restriction
  assert.strictEqual(isStaffEmail('sarah@motionz.ai'), true, 'Valid @motionz.ai email must pass');
  assert.strictEqual(isStaffEmail('sarah@gmail.com'), false, 'Non-staff email must fail domain check');
  assert.strictEqual(isStaffEmail('hacker@abcroofing.com'), false, 'Client email cannot be staff email');

  const staffSuccess = await authenticateStaff('steve@motionz.ai', 'admin');
  assert.strictEqual(staffSuccess.success, true, 'Verified staff authentication succeeds');

  const staffReject = await authenticateStaff('attacker@evil.com', 'admin');
  assert.strictEqual(staffReject.success, false, 'Non-staff domain rejected');
  const store = getStore();
  assert(
    store.securityEvents.some((e) => e.event_type === 'unauthorized_staff_domain_access'),
    'Unauthorized staff login attempt must record a security alert'
  );
  console.log('PASS: Staff domain restriction and intrusion alert verified');

  // Test 2: Magic Link Token Creation and Successful Verification
  const demoTenantId = 'tenant-demo-abc-roofing';
  const { rawToken } = await createInvitation({
    tenantId: demoTenantId,
    email: 'newowner@abcroofing.com',
    role: 'client',
  });

  const verifySuccess = await verifyInvitationToken(rawToken);
  assert.strictEqual(verifySuccess.success, true, 'Valid magic link token must verify');
  assert.strictEqual(verifySuccess.user?.email, 'newowner@abcroofing.com');
  console.log('PASS: Magic link created and successfully verified');

  // Test 3: Single-Use Guarantee (Reused Token Rejection)
  const verifyReuse = await verifyInvitationToken(rawToken);
  assert.strictEqual(verifyReuse.success, false, 'Used magic link token must be rejected');
  assert(verifyReuse.error?.includes('already been used'), 'Error specifies single-use token exhaustion');
  console.log('PASS: Single-use token enforcement verified');

  // Test 4: Revocation Enforcement
  const { rawToken: tokenToRevoke, invitation } = await createInvitation({
    tenantId: demoTenantId,
    email: 'revoked@abcroofing.com',
    role: 'client_member',
  });
  await revokeInvitation(invitation.id, 'admin@motionz.ai');
  const verifyRevoked = await verifyInvitationToken(tokenToRevoke);
  assert.strictEqual(verifyRevoked.success, false, 'Revoked token must be rejected');
  assert(verifyRevoked.error?.includes('revoked'), 'Error specifies token revocation');
  console.log('PASS: Immediate token revocation verified');

  // Test 5: Expiration Enforcement
  const { rawToken: expiredToken } = await createInvitation({
    tenantId: demoTenantId,
    email: 'expired@abcroofing.com',
    role: 'client',
    expiresInHours: -1, // Expired 1 hour ago
  });
  const verifyExpired = await verifyInvitationToken(expiredToken);
  assert.strictEqual(verifyExpired.success, false, 'Expired token must be rejected');
  assert(verifyExpired.error?.includes('expired'), 'Error specifies token expiration');
  console.log('PASS: Token expiration enforcement verified');

  // Test 6: HMAC Signed Session Management & Tampering Prevention
  const sessionToken = createSessionToken('usr-1', 'admin@motionz.ai', 'admin');
  const sessionValid = verifySession(sessionToken);
  assert(sessionValid !== null, 'Valid session token must verify');
  assert.strictEqual(sessionValid?.email, 'admin@motionz.ai');

  // Tampered token test (manipulating payload)
  const tamperedToken = 'eyJ1c2VySWQiOiJ1c3ItMSIsInJvbGUiOiJhZG1pbiJ9.' + sessionToken.split('.')[1];
  const sessionTampered = verifySession(tamperedToken);
  assert.strictEqual(sessionTampered, null, 'Tampered session token must fail HMAC validation');
  console.log('PASS: Session signing and cryptographic tampering detection verified');

  // Test 7: Role Capability Matrix Guard
  assert.strictEqual(hasPermission('admin', 'portal:delete'), true, 'Admin has portal deletion rights');
  assert.strictEqual(hasPermission('csm', 'portal:delete'), false, 'CSM strictly lacks portal deletion rights');
  assert.strictEqual(hasPermission('csm', 'portal:feature_toggle'), false, 'CSM strictly lacks admin feature toggle rights');
  assert.strictEqual(hasPermission('csm', 'onboarding:update_status'), true, 'CSM has onboarding status update capability');
  assert.strictEqual(hasPermission('client', 'onboarding:update_status'), false, 'Client cannot override setup status');
  assert.strictEqual(hasPermission('client', 'client:view_contract'), true, 'Client can view signed contract');
  assert.strictEqual(hasPermission('client_member', 'team:invite'), false, 'Client Member cannot invite users');
  console.log('PASS: Granular capability guards verified against role definitions');

  // Test 8: Tenant Isolation Boundary Assertion
  assert.doesNotThrow(() => {
    assertTenantAccess({ role: 'client', tenantId: 'tenant-a' }, 'tenant-a');
  }, 'Client accessing own tenant succeeds');

  assert.throws(() => {
    assertTenantAccess({ role: 'client', tenantId: 'tenant-a' }, 'tenant-b');
  }, /Forbidden/, 'Client A attempting to access Client B throws Forbidden error');

  assert.doesNotThrow(() => {
    assertTenantAccess({ role: 'admin' }, 'tenant-b');
  }, 'Admin accessing tenant-b is authorized');
  console.log('PASS: Tenant access boundary guard verified');

  console.log('ALL AUTH AND RBAC INTEGRATION TESTS PASSED CLEANLY.');
}

runAuthAndRbacTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
