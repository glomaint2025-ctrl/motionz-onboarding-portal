import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { POST as forgotPasswordHandler } from '../../src/app/api/auth/forgot-password/route';
import { POST as loginHandler } from '../../src/app/api/auth/login/route';
import { POST as ghlWebhookHandler } from '../../src/app/api/webhooks/ghl/route';
import { PUT as portalProfileHandler } from '../../src/app/api/portal/[clientId]/profile/route';
import { leadRepository } from '../../src/lib/db/repositories';
import { GET as csmClientsHandler } from '../../src/app/api/csm/clients/route';
import { GET as csmSetupHandler } from '../../src/app/api/csm/clients/[id]/setup/route';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';

console.log('--- Running Auth & Webhook Hardening Tests ---');

const BASE_URL = 'http://localhost:3000';
const DEMO_TENANT = '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f';
const DEMO_LOCATION = 'loc_ghl_demo_abc';

function jsonRequest(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    method,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: body ? JSON.stringify(body) : undefined,
  });
}

function withNodeEnv<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = value;
  return fn().finally(() => {
    env.NODE_ENV = previous;
  });
}

async function run() {
  // 1. Forgot password never reveals whether an account exists
  const unknown = await forgotPasswordHandler(jsonRequest('/api/auth/forgot-password', 'POST', { email: 'nobody@nowhere.test' }));
  const known = await forgotPasswordHandler(jsonRequest('/api/auth/forgot-password', 'POST', { email: 'john@abcroofing.com' }));
  assert.strictEqual(unknown.status, 200);
  assert.strictEqual(known.status, 200);
  const unknownBody = await unknown.json();
  const knownBody = await known.json();
  assert.strictEqual(unknownBody.message, knownBody.message, 'Same message for unknown and known accounts');
  assert.strictEqual(unknownBody.resetUrl, undefined, 'No link for unknown accounts');
  console.log(' PASS: forgot-password responds identically for unknown and known emails.');

  // 2. Reset and magic links are never returned in production responses
  const prodReset = await withNodeEnv('production', () =>
    forgotPasswordHandler(jsonRequest('/api/auth/forgot-password', 'POST', { email: 'sarah@abcroofing.com' }))
  );
  assert.strictEqual((await prodReset.json()).resetUrl, undefined, 'resetUrl must not be exposed in production');

  const prodMagic = await withNodeEnv('production', () =>
    loginHandler(jsonRequest('/api/auth/login', 'POST', { email: 'john@abcroofing.com', action: 'magic_link' }, { 'x-forwarded-for': '10.0.0.9' }))
  );
  assert.strictEqual((await prodMagic.json()).demoMagicLink, undefined, 'demoMagicLink must not be exposed in production');
  console.log(' PASS: reset and magic links are withheld from API responses in production.');

  // 3. Client password login does not reveal unknown accounts
  const badLogin = await loginHandler(
    jsonRequest('/api/auth/login', 'POST', { email: 'ghost@nowhere.test', password: 'anything', action: 'client_login' }, { 'x-forwarded-for': '10.0.0.10' })
  );
  assert.strictEqual(badLogin.status, 403);
  assert.match((await badLogin.json()).error, /Incorrect email or password/);
  console.log(' PASS: client login uses a generic error for unknown emails.');

  // 4. GHL webhook authentication and tenant routing
  const previousSecret = process.env.GHL_WEBHOOK_SECRET;
  process.env.GHL_WEBHOOK_SECRET = 'test-webhook-secret-value';
  try {
    const event = (contactExtra: Record<string, string> = {}) => ({
      type: 'ContactCreate',
      locationId: DEMO_LOCATION,
      contact: { id: 'ghl-hardening-contact-1', firstName: 'Pat', email: 'pat@example.test', ...contactExtra },
    });

    const noSecret = await ghlWebhookHandler(jsonRequest('/api/webhooks/ghl', 'POST', event()));
    assert.strictEqual(noSecret.status, 401, 'Missing secret rejected');

    const wrongSecret = await ghlWebhookHandler(
      jsonRequest('/api/webhooks/ghl', 'POST', event(), { 'x-motionz-webhook-secret': 'wrong-webhook-secret-value' })
    );
    assert.strictEqual(wrongSecret.status, 401, 'Wrong secret rejected');

    const auth = { 'x-motionz-webhook-secret': 'test-webhook-secret-value' };
    const unknownLocation = await ghlWebhookHandler(
      jsonRequest('/api/webhooks/ghl', 'POST', { ...event(), locationId: 'loc-not-linked' }, auth)
    );
    assert.strictEqual((await unknownLocation.json()).ignored, true, 'Unknown location is ignored, not assigned to another tenant');

    await ghlWebhookHandler(jsonRequest('/api/webhooks/ghl', 'POST', event(), auth));
    await ghlWebhookHandler(
      jsonRequest('/api/webhooks/ghl', 'POST', { ...event({ lastName: 'Updated' }), type: 'ContactUpdate' }, auth)
    );
    const leads = (await leadRepository.listByTenant(DEMO_TENANT, { limit: 500 })).filter(
      (l) => l.ghl_contact_id === 'ghl-hardening-contact-1'
    );
    assert.strictEqual(leads.length, 1, 'Create + update produce a single lead');
    assert.strictEqual(leads[0].last_name, 'Updated');
    console.log(' PASS: webhook requires the shared secret, ignores unknown locations, and upserts leads.');
  } finally {
    if (previousSecret === undefined) delete process.env.GHL_WEBHOOK_SECRET;
    else process.env.GHL_WEBHOOK_SECRET = previousSecret;
  }

  const prodWebhook = await withNodeEnv('production', () =>
    ghlWebhookHandler(jsonRequest('/api/webhooks/ghl', 'POST', { type: 'ContactCreate', locationId: DEMO_LOCATION }))
  );
  assert.strictEqual(prodWebhook.status, 503, 'Production without a webhook secret fails closed');
  console.log(' PASS: webhook fails closed in production without a secret.');

  // 5. The demo tenant cannot be modified anonymously
  const anonWrite = await portalProfileHandler(
    jsonRequest('/api/portal/demo/profile', 'PUT', { name: 'Hijacked' }),
    { params: { clientId: 'demo' } } as any
  );
  assert.ok(anonWrite.status === 401 || anonWrite.status === 403, `Anonymous demo write rejected (got ${anonWrite.status})`);
  console.log(' PASS: anonymous writes to the demo tenant are rejected.');

  // 6. CSMs only reach clients assigned to them
  const asCsm = (userId: string, email: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${createSessionToken(userId, email, 'csm')}` });
  const assignedList = await (await csmClientsHandler(jsonRequest('/api/csm/clients', 'GET', undefined, asCsm('user-csm-1', 'csm@motionz.ai')))).json();
  assert.ok(assignedList.clients.some((c: any) => c.id === DEMO_TENANT), 'Assigned CSM sees the demo client');
  const otherList = await (await csmClientsHandler(jsonRequest('/api/csm/clients', 'GET', undefined, asCsm('user-csm-2', 'csm.agent@motionz.ai')))).json();
  assert.strictEqual(otherList.clients.length, 0, 'Unassigned CSM sees no clients');
  const otherSetup = await csmSetupHandler(
    jsonRequest(`/api/csm/clients/${DEMO_TENANT}/setup`, 'GET', undefined, asCsm('user-csm-2', 'csm.agent@motionz.ai')),
    { params: { id: DEMO_TENANT } }
  );
  assert.strictEqual(otherSetup.status, 403, 'Unassigned CSM cannot open the setup roadmap');
  console.log(' PASS: CSMs are scoped to their assigned clients.');

  console.log('--- Auth & Webhook Hardening Tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
