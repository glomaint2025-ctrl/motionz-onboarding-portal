import assert from 'assert';
import { hasPermission, assertPermission, Capability } from '../../src/lib/auth/permissions';
import { isStaffEmail } from '../../src/lib/auth/staff';
import { signSession, verifySession } from '../../src/lib/auth/session';

async function runApiGuardsIntegrationTests() {
  console.log('Running API & Capability Guards Integration Tests...');

  // Capability matrix verification
  const adminOnlyCaps: Capability[] = [
    'platform:analytics',
    'platform:integrations',
    'platform:audit_logs',
    'platform:manage_staff',
    'portal:create',
    'portal:delete',
    'portal:feature_toggle',
    'portal:assign_csm',
  ];

  adminOnlyCaps.forEach((cap) => {
    assert.strictEqual(hasPermission('admin', cap), true, `Admin should have ${cap}`);
    assert.strictEqual(hasPermission('csm', cap), false, `CSM should NOT have ${cap}`);
    assert.strictEqual(hasPermission('client', cap), false, `Client should NOT have ${cap}`);
    assert.strictEqual(hasPermission('client_member', cap), false, `Member should NOT have ${cap}`);
  });

  // Client vs Client Member capabilities
  assert.strictEqual(hasPermission('client', 'team:invite'), true);
  assert.strictEqual(hasPermission('client', 'profile:update'), true);
  assert.strictEqual(hasPermission('client_member', 'team:invite'), false);
  assert.strictEqual(hasPermission('client_member', 'profile:update'), false);
  assert.strictEqual(hasPermission('client_member', 'client:view_leads'), true);

  // AssertPermission throws on violation
  assert.throws(() => {
    assertPermission('client', 'portal:delete');
  }, /Unauthorized: Role 'client' lacks capability 'portal:delete'/);

  // Staff domain check
  assert.strictEqual(isStaffEmail('admin@motionz.ai'), true);
  assert.strictEqual(isStaffEmail('csm@motionz.ai'), true);
  assert.strictEqual(isStaffEmail('attacker@gmail.com'), false);
  assert.strictEqual(isStaffEmail('fake@motionz.ai.evil.com'), false);

  // Cryptographic session signing & tampering detection
  const sessionToken = signSession({
    userId: 'user-admin-1',
    email: 'admin@motionz.ai',
    role: 'admin',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  });

  const verified = verifySession(sessionToken);
  assert(verified !== null);
  assert.strictEqual(verified?.email, 'admin@motionz.ai');

  // Tamper with payload
  const parts = sessionToken.split('.');
  const tamperedToken = `${parts[0]}tampered.${parts[1]}`;
  const tamperedVerify = verifySession(tamperedToken);
  assert.strictEqual(tamperedVerify, null, 'Tampered session token must be rejected');

  console.log('ALL API & CAPABILITY GUARDS INTEGRATION TESTS PASSED CLEANLY.');
}

runApiGuardsIntegrationTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
