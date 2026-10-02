import assert from 'node:assert';

console.log('--- Running Rate Limit Tests ---');

// Force the in-memory path regardless of the local environment.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const { enforceRateLimit, getClientIp } = await import('../../src/lib/auth/security-utils');
  const { getSupabaseServiceClient } = await import('../../src/lib/db/supabase-client');
  const { globalRateLimiter } = await import('../../src/lib/security/rate-limiter');

  assert.strictEqual(getSupabaseServiceClient(), null, 'Supabase must be unconfigured for the in-memory path');

  // 1. Limit reached -> not allowed
  const key = `rl_test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  globalRateLimiter.reset(key);
  const config = { maxRequests: 3, windowMs: 300 };

  for (let i = 0; i < config.maxRequests; i++) {
    const result = await enforceRateLimit(key, config);
    assert.strictEqual(result.allowed, true, `Request ${i + 1} should be allowed`);
    assert.strictEqual(result.remaining, config.maxRequests - (i + 1));
  }
  const blocked = await enforceRateLimit(key, config);
  assert.strictEqual(blocked.allowed, false, 'Request over the limit is blocked');
  assert.strictEqual(blocked.remaining, 0);
  assert.ok(blocked.resetMs > 0 && blocked.resetMs <= config.windowMs, 'resetMs is within the window');
  console.log(' PASS: in-memory limiter blocks once the limit is reached.');

  // 2. Window reset -> allowed again
  await sleep(config.windowMs + 50);
  const afterReset = await enforceRateLimit(key, config);
  assert.strictEqual(afterReset.allowed, true, 'Requests are allowed again after the window elapses');
  console.log(' PASS: in-memory limiter resets after the window.');

  // 3. Keys are independent
  const otherKey = `${key}:other`;
  assert.strictEqual((await enforceRateLimit(otherKey, config)).allowed, true, 'Different keys have separate budgets');
  console.log(' PASS: separate keys have independent limits.');

  // 4. getClientIp parsing
  const req = (headers: Record<string, string>) => new Request('http://localhost:3000/api/auth/login', { headers });

  assert.strictEqual(getClientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 1.2.3.4' })), '203.0.113.7');
  assert.strictEqual(getClientIp(req({ 'x-forwarded-for': '  198.51.100.2  ' })), '198.51.100.2');
  assert.strictEqual(
    getClientIp(req({ 'x-real-ip': '192.0.2.44', 'x-forwarded-for': 'spoofed-1, spoofed-2' })),
    '192.0.2.44',
    'x-real-ip is preferred over x-forwarded-for'
  );
  assert.strictEqual(getClientIp(req({})), 'unknown');
  assert.strictEqual(getClientIp(req({ 'x-forwarded-for': ' , 10.0.0.1' })), 'unknown', 'Empty first entry is not trusted');
  console.log(' PASS: getClientIp prefers x-real-ip and uses the first x-forwarded-for entry.');

  console.log('--- Rate Limit Tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
