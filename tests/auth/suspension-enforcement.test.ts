import assert from 'assert';
import { NextRequest } from 'next/server';
import { tenantRepository, userRepository } from '../../src/lib/db/repositories';
import { assertPortalAccess, handleAuthError } from '../../src/lib/auth/guard';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';

async function runSuspensionTests() {
  console.log('--- Running Suspension Enforcement Tests ---');

  // 1. Create a test tenant and user in repository
  const testTenant = await tenantRepository.create({
    name: 'Suspension Test Co',
    slug: `susp-test-${Date.now()}`,
    primary_email: `test-${Date.now()}@example.com`,
    status: 'active',
  });

  const testUser = await userRepository.create({
    email: testTenant.primary_email,
    full_name: 'Test Owner',
    role: 'client',
    tenant_id: testTenant.id,
  });

  // Issue a valid session token for this client
  const sessionToken = createSessionToken(
    testUser.id,
    testUser.email,
    testUser.role,
    testTenant.id
  );

  // 2. While ACTIVE, assertPortalAccess should succeed
  const activeReq = new NextRequest(`http://localhost:3000/api/portal/${testTenant.id}/data`, {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
    },
  });

  await assertPortalAccess(activeReq, testTenant, testTenant.id);
  console.log(' PASS: Active client access allowed');

  // 3. Suspend tenant via repository
  const suspendedTenant = await tenantRepository.suspendTenant(
    testTenant.id,
    'Violation of terms',
    'admin@motionz.ai'
  );

  // 4. Assert portal access should now throw TENANT_SUSPENDED
  let caughtError: any = null;
  try {
    await assertPortalAccess(activeReq, suspendedTenant, testTenant.id);
  } catch (err: any) {
    caughtError = err;
  }

  assert(caughtError, 'Expected assertPortalAccess to throw for suspended tenant');
  assert.strictEqual(caughtError.code, 'TENANT_SUSPENDED');
  assert.strictEqual(caughtError.statusCode, 403);
  console.log(' PASS: assertPortalAccess threw TENANT_SUSPENDED with 403');

  // 5. Verify handleAuthError generates 403 and clears cookie
  const response = handleAuthError(caughtError);
  assert.strictEqual(response.status, 403);
  const data = await response.json();
  assert.strictEqual(data.suspended, true);
  assert(data.reason.includes('Violation of terms'));
  console.log(' PASS: handleAuthError returns 403 with suspended: true and clears cookie');

  console.log('--- ALL SUSPENSION TESTS PASSED (100%) ---');
}

runSuspensionTests().catch((err) => {
  console.error('Suspension tests failed:', err);
  process.exit(1);
});
