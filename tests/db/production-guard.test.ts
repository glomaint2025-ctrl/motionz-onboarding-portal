import assert from 'assert';
import { getStore } from '../../src/lib/db/mock-db';
import { assertProductionDatabase, isProduction, isMockFallbackAllowed } from '../../src/lib/db/guard';

async function runProductionGuardTests() {
  console.log('--- Running Production Database Guard & Mock Isolation Tests ---');

  const originalEnv = process.env.NODE_ENV;

  try {
    // 1. In Test/Dev: Mock fallback allowed
    (process.env as any).NODE_ENV = 'test';
    assert.strictEqual(isProduction(), false, 'Test environment is not production');
    assert.strictEqual(isMockFallbackAllowed(), true, 'Mock fallback allowed in test environment');
    const store = getStore();
    assert(store !== null, 'getStore() returns valid mock store in test environment');
    console.log(' [1/3] PASS: Development/Test environment allows controlled mock datastore access.');

    // 2. In Production: Mock access throws critical error
    (process.env as any).NODE_ENV = 'production';
    assert.strictEqual(isProduction(), true, 'Production environment detected correctly');
    assert.strictEqual(isMockFallbackAllowed(), false, 'Mock fallback forbidden in production environment');

    let threwError = false;
    try {
      getStore();
    } catch (err: any) {
      threwError = true;
      assert(err.message.includes('CRITICAL DATABASE FAULT') || err.message.includes('mock datastore in PRODUCTION'), 'Error must specify production mock prohibition');
    }
    assert.strictEqual(threwError, true, 'getStore() must throw in production');
    console.log(' [2/3] PASS: Production environment strictly prohibits getStore() mock datastore access.');

    // 3. assertProductionDatabase throws if credentials missing
    const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    let threwProdGuard = false;
    try {
      assertProductionDatabase();
    } catch (err: any) {
      threwProdGuard = true;
      assert(err.message.includes('CRITICAL DATABASE FAULT') || err.message.includes('Production environment requires a valid Supabase connection'));
    }
    assert.strictEqual(threwProdGuard, true, 'assertProductionDatabase must throw when Supabase is missing in production');
    console.log(' [3/3] PASS: assertProductionDatabase() throws clear fatal error when database credentials missing in production.');

    if (origUrl) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    }
  } finally {
    (process.env as any).NODE_ENV = originalEnv;
  }

  console.log('ALL PRODUCTION GUARD TESTS PASSED CLEANLY.\n');
}

runProductionGuardTests().catch((err) => {
  console.error('Production Guard Test Failed:', err);
  process.exit(1);
});
