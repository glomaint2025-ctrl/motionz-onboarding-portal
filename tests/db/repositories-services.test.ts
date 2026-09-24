import assert from 'assert';
import {
  tenantRepository,
  userRepository,
  invitationRepository,
  clientSetupStepRepository,
  featureToggleRepository,
  leadRepository,
} from '../../src/lib/db/repositories';
import {
  tenantService,
  onboardingService,
  invitationService,
  leadService,
} from '../../src/lib/services';
import { validateTenantPayload, validateSetupStatus, parsePaginationParams } from '../../src/lib/validation';
import { ValidationError, NotFoundError } from '../../src/lib/errors';

async function runRepositoryAndServiceTests() {
  console.log('--- Running Phase 01: Production Database & Backend Foundation Tests ---');

  // Test 1: Tenant Repository & Service Creation
  console.log('[1/7] Testing Tenant Repository and Service atomic provisioning...');
  const provisionResult = await tenantService.provisionClient({
    name: 'Pinnacle Roofing Solutions',
    primary_email: 'dan@pinnacleroofing.com',
    primary_contact_name: 'Dan Pinnacle',
    phone: '(555) 987-6543',
    csm_user_id: 'user-csm-1',
    feature_overrides: {
      roof_measurement: true,
      orders: false,
    },
  });

  assert(provisionResult.tenant.id, 'Provisioned tenant should have an ID');
  assert.strictEqual(provisionResult.tenant.name, 'Pinnacle Roofing Solutions');
  assert.strictEqual(provisionResult.setupStepsCount, 5, 'Should have cloned all 5 setup steps');

  // Verify setup steps exist in repository
  const steps = await clientSetupStepRepository.listByTenant(provisionResult.tenant.id);
  assert.strictEqual(steps.length, 5, 'Should find 5 cloned steps in repository');

  // Verify feature toggles
  const toggles = await featureToggleRepository.getTogglesForTenant(provisionResult.tenant.id);
  assert.strictEqual(toggles.roof_measurement, true);
  assert.strictEqual(toggles.orders, false);
  console.log(' PASS: Atomic tenant provisioning with cloned steps and feature toggles verified.');

  // Test 2: Onboarding Service Updates & Progress Calculation
  console.log('[2/7] Testing Onboarding Service step guidance and dynamic progress calculation...');
  const stepUpdateResult = await onboardingService.updateStepGuidance({
    tenantId: provisionResult.tenant.id,
    stepKey: 'google_sheet',
    status: 'done',
    right_now: 'Tracking sheet live and verified.',
  });

  assert.strictEqual(stepUpdateResult.updatedStep.status, 'done');
  assert.strictEqual(stepUpdateResult.progressPercent, 20, '1 of 5 steps completed = 20%');

  const stepUpdateResult2 = await onboardingService.updateStepGuidance({
    tenantId: provisionResult.tenant.id,
    stepKey: 'ghl_a2p',
    status: 'done',
    right_now: 'A2P verified with carrier.',
  });
  assert.strictEqual(stepUpdateResult2.progressPercent, 40, '2 of 5 steps completed = 40%');
  console.log(' PASS: Onboarding step updating and progress calculation verified.');

  // Test 3: User & Invitation Service
  console.log('[3/7] Testing Invitation Service token generation, hashing, and acceptance...');
  const inviteResult = await invitationService.createInvitation({
    tenantId: provisionResult.tenant.id,
    email: 'member@pinnacleroofing.com',
    role: 'client_member',
    phone: '(555) 123-4567',
  });

  assert(inviteResult.rawToken, 'Should produce a raw unhashed token');
  assert(inviteResult.magicLinkUrl.includes('token='), 'Magic link URL should include token query parameter');

  // Verify and accept invitation
  const acceptResult = await invitationService.verifyAndAccept(inviteResult.rawToken);
  assert.strictEqual(acceptResult.user.email, 'member@pinnacleroofing.com');
  assert.strictEqual(acceptResult.user.role, 'client_member');
  assert.strictEqual(acceptResult.tenantId, provisionResult.tenant.id);

  // Single-use token enforcement: Re-accepting should throw an AppError
  let doubleAcceptError = false;
  try {
    await invitationService.verifyAndAccept(inviteResult.rawToken);
  } catch (err: any) {
    doubleAcceptError = true;
  }
  assert(doubleAcceptError, 'Re-using an accepted token must fail');
  console.log(' PASS: Single-use token generation, hashing, and verification verified.');

  // Test 4: Lead Service Bounded Pagination
  console.log('[4/7] Testing Lead Service pagination and bounded queries...');
  // Seed leads
  for (let i = 1; i <= 10; i++) {
    await leadRepository.create({
      tenant_id: provisionResult.tenant.id,
      first_name: `Lead${i}`,
      last_name: 'Test',
      email: `lead${i}@test.com`,
      phone: `(555) 000-000${i}`,
      status: i % 2 === 0 ? 'Closed' : 'Contacted',
    });
  }

  const pagedLeads = await leadService.getTenantLeads(provisionResult.tenant.id, {
    limit: 5,
    offset: 0,
  });
  assert.strictEqual(pagedLeads.leads.length, 5, 'Should return exactly 5 leads in page 1');

  const pagedLeadsPage2 = await leadService.getTenantLeads(provisionResult.tenant.id, {
    limit: 5,
    offset: 5,
  });
  assert.strictEqual(pagedLeadsPage2.leads.length, 5, 'Should return exactly 5 leads in page 2');
  assert.notStrictEqual(pagedLeads.leads[0].id, pagedLeadsPage2.leads[0].id, 'Page 1 and Page 2 should have different items');
  console.log(' PASS: Bounded pagination and deterministic slicing verified.');

  // Test 5: Validation Logic
  console.log('[5/7] Testing Input Validation schemas...');
  assert.throws(
    () => validateTenantPayload({ name: '', primary_email: 'test@example.com' }),
    ValidationError,
    'Empty name must throw ValidationError'
  );
  assert.throws(
    () => validateTenantPayload({ name: 'Valid', primary_email: 'invalid-email' }),
    ValidationError,
    'Invalid email must throw ValidationError'
  );
  assert.throws(
    () => validateSetupStatus('invalid_status'),
    ValidationError,
    'Invalid setup status must throw ValidationError'
  );

  const pagination = parsePaginationParams({ limit: '1000', offset: '10', maxLimit: 100 });
  assert.strictEqual(pagination.limit, 100, 'Limit should be clamped to maxLimit');
  assert.strictEqual(pagination.offset, 10);
  console.log(' PASS: Validation schemas properly reject malformed inputs and clamp bounds.');

  // Test 6: Compensating Rollback on Failure
  console.log('[6/7] Testing Tenant Service transaction rollback on failure...');
  let failedProvisioning = false;
  try {
    // Attempt provisioning with a template_id that does not exist or will fail
    // We can simulate an error by passing invalid data
    await tenantService.provisionClient({
      name: 'Failing Tenant',
      primary_email: 'invalid-email-will-throw',
    });
  } catch (err) {
    failedProvisioning = true;
  }
  assert(failedProvisioning, 'Should throw error when input is invalid');

  // Verify that no tenant with name "Failing Tenant" was persisted
  const allTenants = await tenantRepository.list();
  const orphanedTenant = allTenants.find((t) => t.name === 'Failing Tenant');
  assert.strictEqual(orphanedTenant, undefined, 'No orphaned tenant should remain after failed provisioning');
  console.log(' PASS: Transaction rollback cleans up partial records.');

  // Test 7: Soft Delete / Archival
  console.log('[7/7] Testing Tenant Archival...');
  await tenantService.archiveClient(provisionResult.tenant.id, 'admin@motionz.ai');
  const archivedTenant = await tenantRepository.findById(provisionResult.tenant.id);
  assert.strictEqual(archivedTenant, null, 'Soft-deleted tenant should not be returned by findById');
  console.log(' PASS: Tenant archival / soft-delete verified.');

  console.log('--- ALL PHASE 01 REPOSITORY & SERVICE TESTS PASSED CLEANLY ---');
}

runRepositoryAndServiceTests().catch((err) => {
  console.error('Phase 01 Test Suite Failed:', err);
  process.exit(1);
});
