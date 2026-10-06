import assert from 'node:assert';

/**
 * Exercises the SUPABASE code path of the GoHighLevel upserts (leads and appointments) against a
 * small in-memory stand-in for the Supabase REST API. No network and no real database are used:
 * the address below does not exist and global fetch is replaced for the whole test.
 *
 * It covers what the in-memory mock store cannot: older duplicate rows, and the unique-violation
 * (23505) answer the database gives once migration 20261007000003 is applied.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake-supabase.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';

type Row = Record<string, any>;

const tables: Record<string, Row[]> = { leads: [], appointments: [] };
const UNIQUE_KEY: Record<string, string> = { leads: 'ghl_contact_id', appointments: 'ghl_appointment_id' };
const calls: { method: string; table: string; query: string }[] = [];
/** Whether the unique indexes from the migration "exist" in the fake database. */
let uniqueIndex = false;
/** Number of upcoming lookups that answer "no rows", as a request racing another one would see. */
let staleLookups = 0;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function fakeSupabase(input: any, init?: any): Promise<Response> {
  // Let every request that was started together reach the "database" before any is answered.
  await new Promise((resolve) => setImmediate(resolve));
  const url = new URL(typeof input === 'string' ? input : input.url);
  const table = url.pathname.replace('/rest/v1/', '');
  const method = (init?.method || 'GET').toUpperCase();
  calls.push({ method, table, query: url.search });
  const rows = tables[table];
  assert.ok(rows, `unexpected table ${table}`);

  const matches = (row: Row) =>
    Array.from(url.searchParams.entries())
      .filter(([, value]) => value.startsWith('eq.'))
      .every(([column, value]) => String(row[column]) === value.slice(3));

  if (method === 'GET') {
    if (staleLookups > 0) {
      staleLookups--;
      return json([]);
    }
    let found = rows.filter(matches);
    const order = (url.searchParams.get('order') || '').split(',').filter(Boolean).reverse();
    for (const part of order) {
      const [column, direction] = part.split('.');
      found = [...found].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (direction === 'desc' ? -1 : 1));
    }
    const limit = Number(url.searchParams.get('limit') || found.length);
    return json(found.slice(0, limit).map((r) => ({ id: r.id })));
  }

  if (method === 'POST') {
    const row = JSON.parse(init.body);
    const key = UNIQUE_KEY[table];
    if (uniqueIndex && rows.some((r) => r.tenant_id === row.tenant_id && r[key] === row[key])) {
      return json({ code: '23505', message: `duplicate key value violates unique constraint "${table}_unique"`, details: null, hint: null }, 409);
    }
    rows.push(row);
    return json(row, 201);
  }

  if (method === 'PATCH') {
    const target = rows.find(matches);
    if (!target) return json({ code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406);
    Object.assign(target, JSON.parse(init.body));
    return json(target);
  }

  return json({ message: `unsupported ${method}` }, 500);
}

async function run() {
  console.log('--- Running GHL Upsert (Supabase path) Tests ---');
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeSupabase as typeof fetch;

  try {
    const { leadRepository } = await import('../../src/lib/db/repositories/leads.repository');
    const { appointmentRepository } = await import('../../src/lib/db/repositories/appointments.repository');
    const TENANT = 'tenant-a';
    const forKey = (table: string, value: string) => tables[table].filter((r) => r[UNIQUE_KEY[table]] === value);

    // 1. Plain insert, then update of the same row.
    const created = await leadRepository.upsertByGhlContactId(TENANT, 'c-1', { first_name: 'Ann', status: 'New Lead' });
    assert.strictEqual(created.ghl_contact_id, 'c-1');
    assert.strictEqual(created.status, 'New Lead');
    const updated = await leadRepository.upsertByGhlContactId(TENANT, 'c-1', { status: 'Contacted' });
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(forKey('leads', 'c-1').length, 1);
    assert.strictEqual(forKey('leads', 'c-1')[0].status, 'Contacted');
    assert.strictEqual((await leadRepository.upsertByGhlContactId(TENANT, 'c-default', {})).status, 'New', 'a new lead with no stage starts as New');
    const lookup = calls.find((c) => c.method === 'GET' && c.table === 'leads')!;
    assert.match(lookup.query, /limit=1/, 'the lookup asks for one row instead of assuming there is only one');
    assert.match(lookup.query, /order=updated_at\.desc/);
    console.log(' PASS: a lead is inserted once and then updated.');

    // 2. Duplicates left over from before the index: no error, the most recently updated row is kept current.
    tables.leads.push(
      { id: 'dup-old', tenant_id: TENANT, ghl_contact_id: 'c-dup', status: 'Old', updated_at: '2026-10-01T00:00:00.000Z' },
      { id: 'dup-new', tenant_id: TENANT, ghl_contact_id: 'c-dup', status: 'Newer', updated_at: '2026-10-05T00:00:00.000Z' }
    );
    const fixed = await leadRepository.upsertByGhlContactId(TENANT, 'c-dup', { status: 'Sold' });
    assert.strictEqual(fixed.id, 'dup-new', 'the most recently updated duplicate is the one updated');
    assert.strictEqual(tables.leads.find((r) => r.id === 'dup-old')!.status, 'Old');
    // The same contact id under another client is a different lead.
    await leadRepository.upsertByGhlContactId('tenant-b', 'c-dup', { status: 'Other client' });
    assert.strictEqual(tables.leads.filter((r) => r.tenant_id === 'tenant-b' && r.ghl_contact_id === 'c-dup').length, 1);
    assert.strictEqual(tables.leads.find((r) => r.id === 'dup-new')!.status, 'Sold');
    console.log(' PASS: existing duplicate rows no longer break the upsert.');

    // 3. WITHOUT the unique index, two events arriving together still insert twice.
    //    This is the race the migration closes; the application alone cannot.
    uniqueIndex = false;
    await Promise.all([
      leadRepository.upsertByGhlContactId(TENANT, 'c-race-unprotected', { status: 'A' }),
      leadRepository.upsertByGhlContactId(TENANT, 'c-race-unprotected', { status: 'B' }),
    ]);
    assert.strictEqual(forKey('leads', 'c-race-unprotected').length, 2, 'without the index the race duplicates (why the migration is required)');
    await leadRepository.upsertByGhlContactId(TENANT, 'c-race-unprotected', { status: 'Later event' });
    assert.strictEqual(forKey('leads', 'c-race-unprotected').length, 2, 'later events update one of them instead of failing');

    // 4. WITH the unique index, the loser of the race gets 23505, re-reads and updates the winner's row.
    uniqueIndex = true;
    const raced = await Promise.all([
      leadRepository.upsertByGhlContactId(TENANT, 'c-race', { first_name: 'First', status: 'A' }),
      leadRepository.upsertByGhlContactId(TENANT, 'c-race', { first_name: 'Second', status: 'B' }),
    ]);
    assert.strictEqual(forKey('leads', 'c-race').length, 1, 'with the index, simultaneous events leave exactly one lead');
    assert.strictEqual(raced[0].id, raced[1].id, 'both requests end on the same row');
    assert.strictEqual(forKey('leads', 'c-race')[0].status, 'B', 'the later write is applied to the surviving row');

    // The same when the first lookup simply missed a row that another request had just inserted.
    await leadRepository.upsertByGhlContactId(TENANT, 'c-stale', { status: 'First' });
    staleLookups = 1;
    const afterStale = await leadRepository.upsertByGhlContactId(TENANT, 'c-stale', { status: 'Second' });
    assert.strictEqual(forKey('leads', 'c-stale').length, 1);
    assert.strictEqual(afterStale.status, 'Second');
    console.log(' PASS: with the unique index a racing lead insert becomes an update (23505 handled).');

    // 5. Appointments: the same behaviour.
    uniqueIndex = false;
    const fields = (time: string, status = 'confirmed') => ({ contact_name: 'Call with your CSM', appointment_time: time, status, notes: 'csm_call' });
    const appt = await appointmentRepository.upsertByGhlAppointmentId(TENANT, 'a-1', fields('2031-01-01T10:00:00.000Z'));
    const moved = await appointmentRepository.upsertByGhlAppointmentId(TENANT, 'a-1', fields('2031-01-02T10:00:00.000Z'));
    assert.strictEqual(moved.id, appt.id);
    assert.strictEqual(forKey('appointments', 'a-1').length, 1);
    assert.strictEqual(forKey('appointments', 'a-1')[0].appointment_time, '2031-01-02T10:00:00.000Z');

    tables.appointments.push(
      { id: 'adup-old', tenant_id: TENANT, ghl_appointment_id: 'a-dup', status: 'confirmed', created_at: '2026-10-01T00:00:00.000Z' },
      { id: 'adup-new', tenant_id: TENANT, ghl_appointment_id: 'a-dup', status: 'confirmed', created_at: '2026-10-05T00:00:00.000Z' }
    );
    const cancelled = await appointmentRepository.upsertByGhlAppointmentId(TENANT, 'a-dup', fields('2031-01-03T10:00:00.000Z', 'cancelled'));
    assert.strictEqual(cancelled.id, 'adup-new', 'the newest duplicate appointment is the one updated');

    uniqueIndex = true;
    const racedCalls = await Promise.all([
      appointmentRepository.upsertByGhlAppointmentId(TENANT, 'a-race', fields('2031-02-01T10:00:00.000Z')),
      appointmentRepository.upsertByGhlAppointmentId(TENANT, 'a-race', fields('2031-02-02T10:00:00.000Z')),
    ]);
    assert.strictEqual(forKey('appointments', 'a-race').length, 1, 'with the index, simultaneous events leave exactly one appointment');
    assert.strictEqual(racedCalls[0].id, racedCalls[1].id);
    assert.strictEqual(forKey('appointments', 'a-race')[0].appointment_time, '2031-02-02T10:00:00.000Z');
    console.log(' PASS: appointments behave the same way.');

    // 6. Any other database error is still reported, never swallowed.
    globalThis.fetch = (async (input: any, init?: any) =>
      (init?.method || 'GET') === 'POST'
        ? json({ code: '23503', message: 'insert or update violates foreign key constraint', details: null, hint: null }, 409)
        : fakeSupabase(input, init)) as typeof fetch;
    await assert.rejects(() => leadRepository.upsertByGhlContactId('no-such-tenant', 'c-fk', {}), /Failed to create lead/);
    await assert.rejects(
      () => appointmentRepository.upsertByGhlAppointmentId('no-such-tenant', 'a-fk', fields('2031-01-01T10:00:00.000Z')),
      /Failed to create appointment/
    );
    console.log(' PASS: other database errors are still raised.');

    console.log('--- GHL Upsert (Supabase path) Tests: ALL PASSED ---');
  } finally {
    globalThis.fetch = realFetch;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
