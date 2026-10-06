import assert from 'node:assert';
import { validateEnv, getSanitizedEnv } from '../../src/lib/env';
import { loadMigrations } from '../../scripts/migrate';
import { ROLLBACK_OPERATIONS } from '../../scripts/rollback';
import { GET as healthHandler } from '../../src/app/api/health/route';

console.log('--- Starting Phase 13: Deployment & Multi-Environment Tests ---');

// 1. Environment Variable Validation
console.log('Testing Environment Variable Validation...');
const validDev = validateEnv({
  NODE_ENV: 'development',
  SESSION_SECRET: 'dev-secret-key-that-is-at-least-32-characters-long',
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'https://portal.motionz.ai',
});
assert.strictEqual(validDev.valid, true, 'Valid dev config should pass');

// Test Production Session Secret requirement
const invalidProdSecret = validateEnv({
  NODE_ENV: 'production',
  SESSION_SECRET: 'short',
  NEXTAUTH_URL: 'https://portal.motionz.ai',
});
assert.strictEqual(invalidProdSecret.valid, false, 'Short session secret in production should fail');
assert.ok(invalidProdSecret.errors.some(e => e.includes('at least 32 characters')), 'Error should mention 32 chars');

// Test Invalid URL
const invalidUrl = validateEnv({
  NODE_ENV: 'development',
  NEXTAUTH_URL: 'not-a-valid-url',
});
assert.strictEqual(invalidUrl.valid, false, 'Invalid NEXTAUTH_URL should fail');

// Test Redacted Environment
const sanitized = getSanitizedEnv();
assert.strictEqual(typeof sanitized.HAS_SESSION_SECRET, 'boolean');
assert.strictEqual((sanitized as any).SESSION_SECRET, undefined, 'Sensitive session secret must not be exposed');
console.log(' Environment variable validation passed.');

// 2. Migration Scripts Verification
console.log('Testing Migration Files & Sequencing...');
const migrations = loadMigrations();
assert.ok(migrations.length >= 4, 'Must have at least 4 migration files');

for (let i = 0; i < migrations.length; i++) {
  const m = migrations[i];
  assert.ok(m.filename.endsWith('.sql'), 'Migration must be .sql');
  assert.ok(m.sql.length > 50, `Migration ${m.filename} must contain SQL statements`);
}
console.log(` Migrations verified (${migrations.length} files in sequence).`);

// 3. Rollback Operations
console.log('Testing Rollback Operations...');
assert.ok(ROLLBACK_OPERATIONS.length >= 3, 'Must have rollback definitions');
assert.ok(ROLLBACK_OPERATIONS[0].sql.includes('DROP INDEX'), 'First rollback step should drop performance indexes');
assert.ok(ROLLBACK_OPERATIONS[ROLLBACK_OPERATIONS.length - 1].sql.includes('DROP TABLE'), 'Last rollback step should drop tables');
console.log(' Rollback operations verified.');

// 4. Health Check API Endpoint
console.log('Testing Health Check Endpoint...');
async function testHealthEndpoint() {
  const response = await healthHandler();
  assert.strictEqual(response.status, 200, 'Health check should return HTTP 200');
  
  const body = await response.json();
  assert.strictEqual(body.status, 'healthy', 'Health status should be healthy');
  assert.ok(body.timestamp, 'Timestamp must be present');
  assert.ok(typeof body.uptimeSeconds === 'number', 'Uptime must be a number');
  assert.strictEqual(body.database.healthy, true, 'Database check must be healthy');
  assert.strictEqual(body.version, '1.0.0', 'Version should match');
  
  // Security verification: no sensitive secrets in health payload
  const jsonStr = JSON.stringify(body);
  assert.strictEqual(jsonStr.includes('postgrespassword'), false, 'Database password must not leak');
  assert.strictEqual(jsonStr.includes('motionz-super-secure'), false, 'Session secret must not leak');
  
  console.log(' Health check endpoint verified without security leaks.');
}

testHealthEndpoint().then(() => {
  console.log('--- Phase 13 Deployment Tests Succeeded (100% Passed) ---');
}).catch(err => {
  console.error('Phase 13 tests failed:', err);
  process.exit(1);
});
