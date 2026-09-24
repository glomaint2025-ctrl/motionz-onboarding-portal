import assert from 'assert';
import {
  resetStore,
  getStore,
  createTenant,
  getLeads,
  getContracts,
  getOrders,
} from '../../src/lib/db';
import { assertTenantAccess } from '../../src/lib/auth/permissions';
import { globalRateLimiter } from '../../src/lib/security/rate-limiter';
import { sanitizeHtml, sanitizeInput } from '../../src/lib/security/sanitizer';
import { recordSecurityEvent, listSecurityEvents } from '../../src/lib/security/audit';

async function runSecurityPenetrationTests() {
  console.log('Running Security Hardening & Penetration Test Suite...');
  resetStore();

  // Provision two distinct, isolated tenants
  const tenantAlpha = await createTenant({
    name: 'Alpha Roofing LLC',
    slug: 'alpha-roofing',
    primary_email: 'alpha@example.com',
  });

  const tenantBeta = await createTenant({
    name: 'Beta Roofing LLC',
    slug: 'beta-roofing',
    primary_email: 'beta@example.com',
  });

  const store = getStore();

  // Seed secret lead in Tenant Beta
  store.leads.push({
    id: 'lead-secret-beta-1',
    tenant_id: tenantBeta.id,
    ghl_contact_id: 'cnt_beta_99',
    first_name: 'Confidential',
    last_name: 'Lead',
    email: 'confidential@betalead.com',
    phone: '(555) 888-9999',
    status: 'Contacted',
    source: 'Confidential Beta Campaign',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Test 1: IDOR & Horizontal Privilege Escalation Prevention
  const alphaClientUser = {
    role: 'client' as const,
    tenantId: tenantAlpha.id,
  };

  assert.throws(() => {
    assertTenantAccess(alphaClientUser, tenantBeta.id);
  }, /Forbidden: Unauthorized cross-tenant access attempt/);
  console.log('PASS: IDOR attack blocked by assertTenantAccess');

  // Test 2: Data query boundary quarantine
  const alphaLeads = await getLeads(tenantAlpha.id);
  assert(
    !alphaLeads.some((l) => l.email === 'confidential@betalead.com'),
    'Tenant Alpha must NOT see Tenant Beta confidential lead'
  );
  console.log('PASS: Zero cross-tenant data leakage confirmed on queries');

  // Test 3: Sliding window rate limiter protection
  const testIpKey = 'ip-test-attacker-192.168.1.100';
  globalRateLimiter.reset(testIpKey);

  // Send 5 rapid requests with limit of 5
  for (let i = 0; i < 5; i++) {
    const check = globalRateLimiter.isAllowed(testIpKey, { maxRequests: 5, windowMs: 10000 });
    assert.strictEqual(check.allowed, true, `Request ${i + 1} should be permitted`);
  }

  // 6th request must be throttled
  const throttledCheck = globalRateLimiter.isAllowed(testIpKey, { maxRequests: 5, windowMs: 10000 });
  assert.strictEqual(throttledCheck.allowed, false, '6th request must be blocked by rate limiter');
  assert.strictEqual(throttledCheck.remaining, 0);
  console.log('PASS: Sliding window rate limiter throttles excessive requests');

  // Test 4: Input Sanitization and XSS Mitigation
  const xssPayload = '<script>alert("XSS")</script><img src="x" onerror="stealCookies()"/><b>Safe Text</b>';
  const sanitized = sanitizeHtml(xssPayload);
  assert(!sanitized.includes('<script>'), 'Script tags stripped');
  assert(!sanitized.includes('onerror'), 'Event handlers stripped');
  assert(sanitized.includes('Safe Text'), 'Safe HTML retained');

  const fullSanitized = sanitizeInput('<script>bad()</script>Hello & Welcome <"Motionz">');
  assert(!fullSanitized.includes('<script>'));
  assert(fullSanitized.includes('&lt;&quot;Motionz&quot;&gt;') || fullSanitized.includes('Hello &amp; Welcome'));
  console.log('PASS: XSS injection vectors sanitized and neutralized');

  // Test 5: Security event recording and intrusion audit trail
  const secEvent = await recordSecurityEvent({
    eventType: 'unauthorized_cross_tenant_access',
    severity: 'high',
    actorEmail: 'attacker@evil.com',
    ipAddress: '203.0.113.42',
    tenantId: tenantBeta.id,
    details: { targetTenant: tenantBeta.id, attemptedEndpoint: '/api/portal/beta/data' },
  });

  assert.strictEqual(secEvent.event_type, 'unauthorized_cross_tenant_access');
  assert.strictEqual(secEvent.severity, 'high');

  const events = await listSecurityEvents(tenantBeta.id);
  assert(events.some((e) => e.id === secEvent.id), 'Security event recorded in audit repository');
  console.log('PASS: Intrusion attempt logged to security_events audit trail');

  console.log('ALL SECURITY HARDENING & PENETRATION TESTS PASSED CLEANLY.');
}

runSecurityPenetrationTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
