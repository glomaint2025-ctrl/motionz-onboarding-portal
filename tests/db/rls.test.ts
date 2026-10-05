import assert from 'assert';
import {
  resetStore,
  getStore,
  createTenant,
  getTenantById,
  getClientSetupSteps,
  updateClientSetupStep,
  listTenants,
} from '../../src/lib/db';

async function runRlsDatabaseTests() {
  console.log('Running Database RLS Policy Isolation Tests...');
  resetStore();

  const tenantA = await createTenant({
    name: 'Tenant A Roofing',
    slug: 'tenant-a',
    primary_email: 'a@roofing.com',
  });

  const tenantB = await createTenant({
    name: 'Tenant B Roofing',
    slug: 'tenant-b',
    primary_email: 'b@roofing.com',
  });

  // Test 1: Setup steps isolated per tenant
  const stepsA = await getClientSetupSteps(tenantA.id);
  const stepsB = await getClientSetupSteps(tenantB.id);

  assert.strictEqual(stepsA.length, 4);
  assert.strictEqual(stepsB.length, 4);
  assert.notStrictEqual(stepsA[0].id, stepsB[0].id, 'Cloned step IDs must be unique');

  // Test 2: Mutation on Tenant A does not touch Tenant B
  await updateClientSetupStep(tenantA.id, 'google_sheet', { status: 'done' });
  const updatedStepsA = await getClientSetupSteps(tenantA.id);
  const updatedStepsB = await getClientSetupSteps(tenantB.id);

  const stepA = updatedStepsA.find((s) => s.step_key === 'google_sheet');
  const stepB = updatedStepsB.find((s) => s.step_key === 'google_sheet');

  assert.strictEqual(stepA?.status, 'done', 'Tenant A step is marked done');
  assert.strictEqual(stepB?.status, 'not_started', 'Tenant B step remains untouched');
  console.log('PASS: Independent tenant setup step state verified');

  // Test 3: Soft delete filtering
  const store = getStore();
  const target = store.tenants.find((t) => t.id === tenantA.id);
  if (target) {
    target.deleted_at = new Date().toISOString();
  }

  const activeList = await listTenants();
  assert(!activeList.some((t) => t.id === tenantA.id), 'Soft-deleted tenant excluded from active roster');
  console.log('PASS: Soft-delete tenant isolation verified');

  console.log('ALL DATABASE RLS POLICY TESTS PASSED CLEANLY.');
}

runRlsDatabaseTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
