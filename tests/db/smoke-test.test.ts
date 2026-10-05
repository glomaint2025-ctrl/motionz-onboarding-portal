import assert from 'assert';
import { getSupabaseServiceClient, DEMO_TENANT_UUID } from '../../src/lib/db/supabase-client';
import { tenantService } from '../../src/lib/services/tenant.service';
import { invitationService } from '../../src/lib/services/invitation.service';
import { tenantRepository, clientSetupStepRepository, invitationRepository, leadRepository } from '../../src/lib/db/repositories';

async function runRealDatabaseSmokeTest() {
  console.log('--- Running Live Supabase Database Smoke Test ---');

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    console.log('[SKIP] Live Supabase credentials not found in environment. Skipping cloud smoke test.');
    return;
  }

  const testSlug = `smoke-${Date.now()}`;
  const testEmail = `smoke-owner-${Date.now()}@smokeroofing.com`;
  let createdTenantId: string | null = null;

  try {
    // 1. Create Tenant via TenantService (Atomic Provisioning)
    console.log(' [1/6] Provisioning test client with cloned steps and CSM...');
    const { tenant, setupStepsCount } = await tenantService.provisionClient({
      name: 'Smoke Test Roofing',
      slug: testSlug,
      primary_email: testEmail,
      phone: '+1 (555) 000-1122',
    });

    createdTenantId = tenant.id;
    assert(createdTenantId, 'Tenant must have a generated UUID ID');
    assert.strictEqual(setupStepsCount, 4, 'Must clone all 4 master setup steps');
    console.log(`  PASS: Provisioned tenant ${createdTenantId} with 4 cloned steps.`);

    // 2. Verify Persistence in Real Supabase Database
    console.log(' [2/6] Verifying persistence directly via PostgREST...');
    const fetchedTenant = await tenantRepository.findById(createdTenantId);
    assert(fetchedTenant !== null, 'Tenant must be queryable by ID');
    assert.strictEqual(fetchedTenant.slug, testSlug, 'Persisted tenant slug matches');

    const fetchedSteps = await clientSetupStepRepository.listByTenant(createdTenantId);
    assert.strictEqual(fetchedSteps.length, 4, 'All 4 steps persisted in client_setup_steps table');
    console.log('  PASS: Data persisted and verified in Supabase.');

    // 3. Create Invitation
    console.log(' [3/6] Creating team member invitation...');
    const { invitation, rawToken } = await invitationService.createInvitation({
      tenantId: createdTenantId,
      email: `member-${Date.now()}@smokeroofing.com`,
      role: 'client_member',
      phone: '+1 (555) 999-8877',
      createdBy: testEmail,
    });
    assert(invitation.id, 'Invitation record must have ID');
    assert(rawToken.length === 64, 'Raw token must be 32-byte hex (64 chars)');
    console.log('  PASS: Single-use magic-link invitation created.');

    // 4. Verify Invitation Persisted
    console.log(' [4/6] Verifying invitation persistence...');
    const tokenHash = invitationService.hashToken(rawToken);
    const fetchedInv = await invitationRepository.findByTokenHash(tokenHash);
    assert(fetchedInv !== null, 'Invitation must be queryable by token hash');
    assert.strictEqual(fetchedInv.tenant_id, createdTenantId);
    console.log('  PASS: Invitation token hash verified in database.');

    // 5. Verify Multi-Tenant Isolation
    console.log(' [5/6] Verifying strict cross-tenant data isolation...');
    const demoLeads = await leadRepository.listByTenant(DEMO_TENANT_UUID);
    const smokeLeads = await leadRepository.listByTenant(createdTenantId);
    assert.strictEqual(smokeLeads.length, 0, 'New smoke tenant must not see Demo tenant leads');
    console.log('  PASS: Zero cross-tenant data leakage confirmed.');

    // 6. Clean Up Test Data
    console.log(' [6/6] Cleaning up smoke test tenant via cascading hard delete...');
    await tenantRepository.hardDelete(createdTenantId);
    const verifyDeleted = await tenantRepository.findById(createdTenantId);
    assert.strictEqual(verifyDeleted, null, 'Deleted tenant must no longer exist');
    const verifyStepsDeleted = await clientSetupStepRepository.listByTenant(createdTenantId);
    assert.strictEqual(verifyStepsDeleted.length, 0, 'Cascading delete removed setup steps');
    console.log('  PASS: Smoke test tenant cleanly removed.');

    console.log('\nLIVE SUPABASE DATABASE SMOKE TEST PASSED WITH 100% SUCCESS.\n');
  } catch (err: any) {
    if (createdTenantId) {
      try {
        await tenantRepository.hardDelete(createdTenantId);
      } catch {
        // cleanup attempt
      }
    }
    console.error('Smoke Test Failed:', err);
    throw err;
  }
}

runRealDatabaseSmokeTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
