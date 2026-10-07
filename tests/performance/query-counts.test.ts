import assert from 'assert';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { getStore, resetStore } from '../../src/lib/db/mock-db';
import * as repositories from '../../src/lib/db/repositories';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';
import { fetchAllRows, PAGE_SIZE } from '../../src/lib/db/paging';
import { GET as dashboard } from '../../src/app/api/admin/dashboard/route';
import { GET as adminClients } from '../../src/app/api/admin/clients/route';
import { GET as csmClients } from '../../src/app/api/csm/clients/route';
import { GET as adminGhl } from '../../src/app/api/admin/ghl/route';
import { GET as adminStaff } from '../../src/app/api/admin/staff/route';
import { GET as portalData } from '../../src/app/api/portal/[clientId]/data/route';
import { GET as portalLeads } from '../../src/app/api/portal/[clientId]/leads/route';
import { POST as ghlWebhook } from '../../src/app/api/webhooks/ghl/route';

/**
 * Scale guard: the number of data calls a hot request makes must not grow with the number of
 * clients. Every repository method is wrapped with a counter (here, in the test only: the
 * repositories themselves carry no instrumentation), the same request is made against 30 and
 * against 300 clients, and the two counts must be identical.
 */

// ───────────────────────── call counter ─────────────────────────
const calls = new Map<string, number>();
for (const [exportName, repo] of Object.entries(repositories as Record<string, any>)) {
  if (!exportName.endsWith('Repository') || !repo || typeof repo !== 'object') continue;
  for (const method of Object.getOwnPropertyNames(Object.getPrototypeOf(repo))) {
    const original = repo[method];
    if (method === 'constructor' || typeof original !== 'function') continue;
    repo[method] = function counted(this: unknown, ...args: unknown[]) {
      const key = `${exportName}.${method}`;
      calls.set(key, (calls.get(key) || 0) + 1);
      return original.apply(this, args);
    };
  }
}
/** Private helpers that touch no data are not data calls. */
const NOT_DATA = /\.(normalizeTenant|normalizeUserWithSuspension)$/;

async function counted<T>(run: () => Promise<T>): Promise<{ result: T; total: number; byMethod: Record<string, number> }> {
  calls.clear();
  const result = await run();
  const byMethod: Record<string, number> = {};
  let total = 0;
  for (const [key, n] of Array.from(calls.entries())) {
    if (NOT_DATA.test(key)) continue;
    byMethod[key] = n;
    total += n;
  }
  return { result, total, byMethod };
}

// ───────────────────────── seeding ─────────────────────────
const CSM_IDS = ['user-csm-1', 'user-csm-2'];
const STEP_KEYS = ['google_sheet', 'ghl_a2p', 'domain_web', 'phone_system'];

interface Seeded {
  ids: string[];
  archivedIds: string[];
  firstId: string;
  ownerId: string;
}

/** `count` extra clients on top of the demo one: steps, a CSM, leads; every 10th one archived. */
function seed(count: number): Seeded {
  resetStore();
  const store = getStore();
  const ids: string[] = [];
  const archivedIds: string[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    const archived = i % 10 === 9;
    ids.push(id);
    if (archived) archivedIds.push(id);
    const created = new Date(now - (i + 1) * 60_000).toISOString();
    store.tenants.push({
      id,
      name: `Scale Client ${String(i).padStart(4, '0')}`,
      slug: `scale-client-${i}`,
      primary_email: `owner${i}@scale.test`,
      primary_contact_name: `Owner ${i}`,
      status: archived ? 'cancelled' : i % 3 === 0 ? 'onboarding' : 'active',
      ghl_location_id: `loc_scale_${i}`,
      created_at: created,
      updated_at: created,
      ...(archived ? { deleted_at: created } : {}),
    } as any);

    STEP_KEYS.forEach((key, s) => {
      store.clientSetupSteps.push({
        id: randomUUID(),
        tenant_id: id,
        step_key: key,
        name: `Step ${s + 1}`,
        owner: 'we_handle',
        // Every 4th client has finished setup; the rest are on step 3.
        status: i % 4 === 0 || s < 2 ? 'done' : 'not_started',
        sort_order: s + 1,
        updated_at: created,
      } as any);
    });

    // Two of every three clients have a CSM.
    if (i % 3 !== 2) {
      store.csmAssignments.push({ id: randomUUID(), csm_user_id: CSM_IDS[i % 2], tenant_id: id, assigned_at: created });
    }
    if (i % 2 === 0) {
      store.contracts.push({ id: randomUUID(), tenant_id: id, title: 'Agreement', document_url: '/c.pdf', created_at: created } as any);
    }
    for (let l = 0; l < 3; l++) {
      store.leads.push({
        id: randomUUID(),
        tenant_id: id,
        ghl_contact_id: `cnt_${i}_${l}`,
        first_name: 'Lead',
        last_name: `${i}-${l}`,
        status: l === 0 ? 'New' : 'Contacted',
        created_at: new Date(now - l * 3_600_000).toISOString(),
        updated_at: created,
      } as any);
    }
    // One open lead request for every 5th client, archived ones included.
    if (i % 5 === 4) {
      store.leadRequests.push({
        id: randomUUID(),
        tenant_id: id,
        lead_id: null,
        type: 'replacement',
        lead_name: 'Somebody',
        lead_phone: '(555) 000-0000',
        details: {},
        decision: 'needs_review',
        status: 'open',
        created_at: created,
        resolved_at: null,
        resolved_by: null,
      } as any);
    }
  }

  const firstId = ids[0];
  const ownerId = randomUUID();
  store.users.push({
    id: ownerId,
    email: 'owner0@scale.test',
    full_name: 'Owner Zero',
    role: 'client',
    tenant_id: firstId,
    password_hash: 'x',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);
  return { ids, archivedIds, firstId, ownerId };
}

const adminCookie = () => createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
const csmCookie = () => createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');

function get(path: string, cookie: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
}

/** Runs the same request against a small and a large number of clients and compares the data calls. */
async function sameCallsAtAnySize(
  label: string,
  maxCalls: number,
  run: (seeded: Seeded, size: number) => Promise<Record<string, number>>
): Promise<void> {
  const small = await run(seed(30), 30);
  const large = await run(seed(300), 300);
  const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  assert.deepStrictEqual(large, small, `${label}: the data calls must be the same for 30 and for 300 clients`);
  assert.ok(total(large) <= maxCalls, `${label}: ${total(large)} data calls, expected at most ${maxCalls}: ${JSON.stringify(large)}`);
  console.log(` PASS: ${label}: ${total(large)} data calls for 30 clients and for 300 clients.`);
}

async function run() {
  console.log('--- Running Scale / Query Count Tests ---');
  delete process.env.GHL_WEBHOOK_SECRET;

  // ───────────── reading more than one page from the database ─────────────
  {
    const table = Array.from({ length: 2500 }, (_, i) => ({ n: i }));
    const requests: Array<[number, number]> = [];
    const rows = await fetchAllRows<{ n: number }>(
      async (from, to) => {
        requests.push([from, to]);
        return { data: table.slice(from, to + 1), error: null, count: table.length };
      },
      (error) => {
        throw error;
      }
    );
    assert.strictEqual(rows.length, 2500, 'every row is read, not just the first 1,000');
    assert.deepStrictEqual(rows.map((r) => r.n), table.map((r) => r.n), 'rows keep their order');
    assert.strictEqual(requests.length, 3, '2,500 rows are three requests');
    assert.strictEqual(PAGE_SIZE, 1000);

    // A server that answers fewer rows per request than asked for still yields every row.
    const capped = await fetchAllRows<{ n: number }>(
      async (from, to) => ({ data: table.slice(from, Math.min(to + 1, from + 400)), error: null, count: table.length }),
      (error) => {
        throw error;
      }
    );
    assert.strictEqual(capped.length, 2500);
    console.log(' PASS: long lists are read page by page (2,500 rows, nothing cut off at 1,000).');
  }

  // ───────────── admin dashboard ─────────────
  await sameCallsAtAnySize('admin dashboard', 12, async (seeded, size) => {
    const { result, byMethod } = await counted(() => dashboard(get('/api/admin/dashboard', adminCookie())));
    assert.strictEqual(result.status, 200);
    const body = await result.json();
    const liveSeeded = size - seeded.archivedIds.length;

    assert.strictEqual(body.clients.total, size + 1, 'every client is counted (the demo client is one of them)');
    assert.strictEqual(body.clients.cancelledOrArchived, seeded.archivedIds.length);
    assert.strictEqual(body.ghl.total, liveSeeded + 1);
    // Seeded clients i % 4 !== 0 are still in setup; archived ones never count. The demo client is in setup too.
    const expectedInSetup = seeded.ids.filter((id, i) => i % 4 !== 0 && !seeded.archivedIds.includes(id)).length + 1;
    assert.strictEqual(body.inSetup, expectedInSetup);
    const expectedWithoutCsm = seeded.ids.filter((id, i) => i % 3 === 2 && !seeded.archivedIds.includes(id)).length;
    assert.strictEqual(body.withoutCsm.length, expectedWithoutCsm);
    const expectedWithoutContract = seeded.ids.filter((id, i) => i % 2 !== 0 && !seeded.archivedIds.includes(id)).length;
    assert.strictEqual(body.withoutContract.length, expectedWithoutContract);

    // Lead requests: only live clients. (i % 5 === 4 has a request; i % 10 === 9 of those are archived.)
    const archived = new Set(seeded.archivedIds);
    const expectedOpen = seeded.ids.filter((id, i) => i % 5 === 4 && !archived.has(id)).length;
    assert.strictEqual(body.leadRequests.open, expectedOpen, 'requests of archived clients are not counted');
    assert.ok(body.leadRequests.clients.every((c: any) => !archived.has(c.id)), 'no archived client is listed under lead requests');
    assert.ok(body.withoutContract.every((c: any) => !archived.has(c.id)), 'no archived client is listed under "No contract"');

    assert.ok(!byMethod['clientSetupStepRepository.listByTenant'], 'no per-client setup step read');
    assert.ok(!byMethod['csmAssignmentRepository.findByTenant'], 'no per-client CSM read');
    return byMethod;
  });

  // ───────────── admin clients list (one page) ─────────────
  await sameCallsAtAnySize('admin clients list, one page', 10, async (seeded, size) => {
    const { result, byMethod } = await counted(() => adminClients(get('/api/admin/clients?page=1&pageSize=10', adminCookie())));
    assert.strictEqual(result.status, 200);
    const body = await result.json();
    assert.strictEqual(body.tenants.length, 10);
    assert.strictEqual(body.pagination.total, size + 1);
    assert.strictEqual(body.stats.totalClients, size + 1);
    assert.strictEqual(body.stats.archivedClients, seeded.archivedIds.length);

    const row = body.tenants.find((t: any) => t.id === seeded.ids[0]);
    assert.ok(row, 'the first seeded client is on page 1');
    assert.strictEqual(row.csm_name, 'Motionz CSM');
    assert.strictEqual(row.csm_email, 'csm@motionz.ai');
    assert.strictEqual(row.total_steps, 4);
    assert.strictEqual(row.completed_steps, 4);
    assert.strictEqual(row.progress_percent, 100);
    assert.strictEqual(row.hasContract, true);
    const second = body.tenants.find((t: any) => t.id === seeded.ids[1]);
    assert.strictEqual(second.progress_percent, 50);
    assert.strictEqual(second.csm_name, 'Motionz CSM Agent');
    assert.strictEqual(second.hasContract, false);
    assert.deepStrictEqual([...body.availableCsms].sort(), ['Motionz CSM', 'Motionz CSM Agent']);

    assert.ok(!byMethod['clientSetupStepRepository.listByTenant'], 'no per-row setup step read');
    assert.ok(!byMethod['csmAssignmentRepository.findByTenant'], 'no per-row CSM assignment read');
    assert.ok(!byMethod['userRepository.findById'] || byMethod['userRepository.findById'] <= 2, 'no per-row CSM user read');
    return byMethod;
  });

  // The filters that need every row still make a fixed number of calls.
  await sameCallsAtAnySize('admin clients list, "still in setup" filter', 10, async (seeded) => {
    const { result, byMethod } = await counted(() =>
      adminClients(get('/api/admin/clients?page=1&pageSize=10&setup=in_progress', adminCookie()))
    );
    const body = await result.json();
    const archived = new Set(seeded.archivedIds);
    const expected = seeded.ids.filter((id, i) => i % 4 !== 0 && !archived.has(id)).length + 1;
    assert.strictEqual(body.pagination.total, expected, 'same number as the dashboard\'s "Still in setup"');
    assert.ok(body.tenants.every((t: any) => !(t.total_steps > 0 && t.completed_steps === t.total_steps)));
    return byMethod;
  });

  // ───────────── CSM clients list ─────────────
  await sameCallsAtAnySize('CSM clients list', 8, async (seeded, size) => {
    const { result, byMethod } = await counted(() => csmClients(get('/api/csm/clients?page=1&pageSize=10', csmCookie())));
    assert.strictEqual(result.status, 200);
    const body = await result.json();
    // user-csm-1 has the demo client plus every live seeded client with i % 3 !== 2 and i % 2 === 0.
    const archived = new Set(seeded.archivedIds);
    const mine = seeded.ids.filter((id, i) => i % 3 !== 2 && i % 2 === 0 && !archived.has(id)).length + 1;
    assert.strictEqual(body.stats.totalClients, mine, 'every assigned client is counted, also beyond the first 50');
    assert.strictEqual(body.pagination.total, mine);
    assert.strictEqual(body.tenants.length, 10);
    if (size === 300) assert.ok(mine > 50, 'the large case has more than 50 assigned clients');
    assert.ok(!byMethod['clientSetupStepRepository.listByTenant'], 'no per-row setup step read');
    assert.ok(!byMethod['tenantRepository.findById'], 'no per-row client read');
    return byMethod;
  });

  await sameCallsAtAnySize('CSM clients list, opened by an admin', 8, async (seeded, size) => {
    const { result, byMethod } = await counted(() => csmClients(get('/api/csm/clients', adminCookie())));
    const body = await result.json();
    assert.strictEqual(body.stats.totalClients, size + 1 - seeded.archivedIds.length, 'an admin sees every live client');
    return byMethod;
  });

  // ───────────── GoHighLevel webhook: a lead arrives ─────────────
  await sameCallsAtAnySize('GoHighLevel lead webhook', 6, async (seeded, size) => {
    const target = size - 2; // a client near the end of the list, not archived
    const before = getStore().leads.length;
    const { result, byMethod } = await counted(() =>
      ghlWebhook(
        new NextRequest('http://localhost:3000/api/webhooks/ghl', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            customData: { event: 'lead', stage: 'New' },
            location: { id: `loc_scale_${target}` },
            contact_id: 'cnt_new_lead',
            first_name: 'New',
            last_name: 'Lead',
          }),
        })
      )
    );
    assert.strictEqual(result.status, 200);
    const body = await result.json();
    assert.strictEqual(body.matched, true);
    assert.strictEqual(getStore().leads.length, before + 1);
    assert.strictEqual(getStore().leads.find((l) => l.ghl_contact_id === 'cnt_new_lead')?.tenant_id, seeded.ids[target]);
    assert.ok(!byMethod['tenantRepository.list'], 'the webhook does not list clients');
    assert.ok(!byMethod['tenantRepository.listAll'], 'the webhook does not list clients');
    assert.strictEqual(byMethod['tenantRepository.findByGhlLocationId'], 1, 'one lookup by Location ID');
    return byMethod;
  });

  // An archived client's Location ID matches nobody, exactly as before.
  {
    const seeded = seed(30);
    const res = await ghlWebhook(
      new NextRequest('http://localhost:3000/api/webhooks/ghl', {
        method: 'POST',
        body: JSON.stringify({ customData: { event: 'lead' }, location: { id: 'loc_scale_9' }, contact_id: 'cnt_x' }),
      })
    );
    const body = await res.json();
    assert.ok(seeded.archivedIds.includes(seeded.ids[9]));
    assert.strictEqual(body.ignored, true, 'a lead for an archived client is not stored');
    console.log(' PASS: a webhook for an archived client is still ignored.');
  }

  // ───────────── admin pages that used to ask once per client or per CSM ─────────────
  await sameCallsAtAnySize('admin GHL Connect list', 5, async (seeded, size) => {
    const { result, byMethod } = await counted(() => adminGhl(get('/api/admin/ghl', adminCookie())));
    const body = await result.json();
    assert.strictEqual(body.counts.total, size + 1 - seeded.archivedIds.length);
    const row = body.connected.find((r: any) => r.id === seeded.ids[0]);
    assert.ok(row?.lastLeadAt, 'the newest lead time is filled in');
    assert.ok(!byMethod['leadRepository.listByTenant'], 'no per-client lead read');
    return byMethod;
  });

  await sameCallsAtAnySize('admin Staff list', 7, async (seeded) => {
    const { result, byMethod } = await counted(() => adminStaff(get('/api/admin/staff', adminCookie())));
    const body = await result.json();
    const csm = body.staff.find((s: any) => s.id === 'user-csm-1');
    // Archived clients keep their assignment, as before.
    const expected = seeded.ids.filter((_, i) => i % 3 !== 2 && i % 2 === 0).length + 1;
    assert.strictEqual(csm.assignedClients, expected);
    assert.ok(!byMethod['csmAssignmentRepository.listByCsm'], 'no per-CSM assignment read');
    return byMethod;
  });

  // ───────────── client portal ─────────────
  await sameCallsAtAnySize('client portal /data', 16, async (seeded) => {
    const cookie = createSessionToken(seeded.ownerId, 'owner0@scale.test', 'client', seeded.firstId);
    const { result, byMethod } = await counted(() =>
      portalData(get(`/api/portal/${seeded.firstId}/data`, cookie), { params: { clientId: seeded.firstId } })
    );
    assert.strictEqual(result.status, 200);
    const body = await result.json();
    assert.strictEqual(body.tenant.id, seeded.firstId);
    assert.strictEqual(body.leadCount, 3);
    assert.strictEqual(body.setupSteps.length, 4);
    assert.strictEqual(body.csm?.email, 'csm@motionz.ai');
    assert.strictEqual(body.viewer.full_name, 'Owner Zero');
    // The client is read by the route and by the access check: twice, not once per section.
    assert.ok((byMethod['tenantRepository.findById'] || 0) <= 2, `client read ${byMethod['tenantRepository.findById']} times`);
    // The signed-in person once, the CSM once.
    assert.ok((byMethod['userRepository.findById'] || 0) <= 2, `user read ${byMethod['userRepository.findById']} times`);
    return byMethod;
  });

  await sameCallsAtAnySize('client portal /leads', 10, async (seeded) => {
    const cookie = createSessionToken(seeded.ownerId, 'owner0@scale.test', 'client', seeded.firstId);
    const { result, byMethod } = await counted(() =>
      portalLeads(get(`/api/portal/${seeded.firstId}/leads?page=1`, cookie), { params: { clientId: seeded.firstId } })
    );
    assert.strictEqual(result.status, 200);
    const body = await result.json();
    assert.strictEqual(body.counts.all, 3);
    assert.strictEqual(body.total, 3);
    assert.deepStrictEqual(body.counts.byStage, [
      { stage: 'Contacted', count: 2 },
      { stage: 'New', count: 1 },
    ]);
    assert.ok((byMethod['tenantRepository.findById'] || 0) <= 2, `client read ${byMethod['tenantRepository.findById']} times`);
    assert.ok((byMethod['userRepository.findById'] || 0) <= 1, 'the signed-in person is read once');
    return byMethod;
  });

  // ───────────── 1,500 clients ─────────────
  {
    const seeded = seed(1500);
    const started = Date.now();
    const dash = await (await dashboard(get('/api/admin/dashboard', adminCookie()))).json();
    assert.strictEqual(dash.clients.total, 1501);
    const list = await (await adminClients(get('/api/admin/clients?page=151&pageSize=10', adminCookie()))).json();
    assert.strictEqual(list.pagination.total, 1501);
    assert.strictEqual(list.stats.totalClients, 1501);
    assert.strictEqual(list.tenants.length, 1, 'the last page holds the 1,501st client');
    const all = await (await adminClients(get('/api/admin/clients', adminCookie()))).json();
    assert.strictEqual(all.tenants.length, 1501, 'the unpaged list holds every client');
    const search = await (await adminClients(get('/api/admin/clients?page=1&pageSize=10&search=Scale%20Client%201499', adminCookie()))).json();
    assert.strictEqual(search.tenants.length, 1);
    assert.strictEqual(search.tenants[0].id, seeded.ids[1499]);
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 5000, `dashboard and three client lists for 1,500 clients took ${elapsed} ms`);
    console.log(` PASS: dashboard and admin client list are complete for 1,500 clients (${elapsed} ms in memory).`);
  }

  resetStore();
  console.log('--- Scale / Query Count Tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
