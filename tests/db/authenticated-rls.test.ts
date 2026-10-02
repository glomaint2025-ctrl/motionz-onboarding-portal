import assert from 'assert';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient, DEMO_TENANT_UUID } from '../../src/lib/db/supabase-client';
import { randomUUID } from 'crypto';

interface TestUserSession {
  userId: string;
  email: string;
  role: 'client' | 'client_member';
  tenantId: string;
  client: SupabaseClient;
}

export async function runAuthenticatedRlsTests() {
  console.log('--- Running Live Supabase Authenticated User RLS Tests ---');

  const adminClient = getSupabaseServiceClient();
  if (!adminClient) {
    console.log('[SKIP] Live Supabase credentials not found. Skipping live RLS test.');
    return;
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hagqtrhgetyrubvcskij.supabase.co';

  if (!anonKey) {
    console.log('[SKIP] NEXT_PUBLIC_SUPABASE_ANON_KEY not found. Skipping live RLS test.');
    return;
  }

  const testSuffix = Date.now().toString().slice(-6);
  const password = `RlsTestPass!${testSuffix}Aa1`;

  // Tenant IDs
  const tenantAId = DEMO_TENANT_UUID; // Seed ABC Roofing
  const tenantBId = randomUUID();
  const tenantBSlug = `rls-test-b-${testSuffix}`;

  const createdAuthUserIds: string[] = [];
  const sessions: Record<string, TestUserSession> = {};

  try {
    // -------------------------------------------------------------
    // Step 1: Provision Tenant B in Supabase
    // -------------------------------------------------------------
    console.log(' [1/6] Setting up Tenant B and sample isolated data...');
    const { error: tenantBErr } = await adminClient.from('tenants').insert({
      id: tenantBId,
      name: 'Summit Peak Test Roofing',
      slug: tenantBSlug,
      primary_email: `owner-b-${testSuffix}@summitpeak.test`,
      status: 'active',
    });
    if (tenantBErr) throw new Error(`Failed to create Tenant B: ${tenantBErr.message}`);

    // Insert sample leads for Tenant A and Tenant B
    const leadAId = randomUUID();
    const leadBId = randomUUID();
    await adminClient.from('leads').insert([
      {
        id: leadAId,
        tenant_id: tenantAId,
        contact_name: 'Lead A Resident',
        contact_email: 'lead.a@gmail.test',
        contact_phone: '+1 555-111-0001',
        status: 'new',
      },
      {
        id: leadBId,
        tenant_id: tenantBId,
        contact_name: 'Lead B Resident',
        contact_email: 'lead.b@gmail.test',
        contact_phone: '+1 555-222-0002',
        status: 'new',
      },
    ]);

    // Insert sample setup steps for Tenant B
    const stepBId = randomUUID();
    await adminClient.from('client_setup_steps').insert({
      id: stepBId,
      tenant_id: tenantBId,
      step_key: 'custom_b_step',
      name: 'Tenant B Secret Step',
      owner: 'client_action',
      status: 'not_started',
      what_it_is: 'Private Tenant B Step',
      right_now: 'Underway',
      unlocks: 'Progress',
      sort_order: 1,
    });

    // -------------------------------------------------------------
    // Step 2: Create Auth Users and Public Users for both tenants
    // -------------------------------------------------------------
    console.log(' [2/6] Creating real authenticated users in Supabase Auth...');
    const userConfigs = [
      { key: 'clientA', role: 'client' as const, tenantId: tenantAId, email: `client.a.${testSuffix}@abcroof.test` },
      { key: 'clientB', role: 'client' as const, tenantId: tenantBId, email: `client.b.${testSuffix}@summitpeak.test` },
      { key: 'memberA', role: 'client_member' as const, tenantId: tenantAId, email: `member.a.${testSuffix}@abcroof.test` },
      { key: 'memberB', role: 'client_member' as const, tenantId: tenantBId, email: `member.b.${testSuffix}@summitpeak.test` },
    ];

    const anonClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    for (const conf of userConfigs) {
      // Create auth user in Supabase Auth via admin api
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: conf.email,
        password,
        email_confirm: true,
      });
      if (authErr || !authUser?.user) throw new Error(`Failed to create auth user ${conf.email}: ${authErr?.message}`);
      const userId = authUser.user.id;
      createdAuthUserIds.push(userId);

      // Link in public.users
      const { error: pubUserErr } = await adminClient.from('users').insert({
        id: userId,
        tenant_id: conf.tenantId,
        email: conf.email,
        full_name: `${conf.key} Full Name`,
        role: conf.role,
      });
      if (pubUserErr) throw new Error(`Failed to create public user record ${conf.email}: ${pubUserErr.message}`);

      // Authenticate through Supabase Auth using password to get real signed JWT access token
      const { data: sessionData, error: signInErr } = await anonClient.auth.signInWithPassword({
        email: conf.email,
        password,
      });
      if (signInErr || !sessionData?.session?.access_token) {
        throw new Error(`Failed to sign in ${conf.email}: ${signInErr?.message}`);
      }

      // Create an authenticated client bound to this user's token
      const userAuthClient = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
      });

      sessions[conf.key] = {
        userId,
        email: conf.email,
        role: conf.role,
        tenantId: conf.tenantId,
        client: userAuthClient,
      };
    }
    console.log('  PASS: Authenticated 4 distinct client & client_member JWT sessions.');

    // -------------------------------------------------------------
    // Step 3: Test CLIENT A Positive Reads (Own Tenant Data)
    // -------------------------------------------------------------
    console.log(' [3/6] Testing Client A legitimate read access (Positive RLS)...');
    const { data: clientATenants, error: aTenantsErr } = await sessions.clientA.client
      .from('tenants')
      .select('id, name, slug');
    assert.ifError(aTenantsErr);
    assert(clientATenants && clientATenants.length > 0, 'Client A must see their own tenant');
    assert(clientATenants.every(t => t.id === tenantAId), 'Client A must ONLY see Tenant A in list');
    console.log('  PASS: Client A successfully reads Tenant A data.');

    // -------------------------------------------------------------
    // Step 4: Test CLIENT A Cross-Tenant Isolation (Tenant B Denial)
    // -------------------------------------------------------------
    console.log(' [4/6] Testing Client A Cross-Tenant Access Denial (Negative RLS)...');

    // 4.1 Cannot read Tenant B tenant record
    const { data: crossTenantRead } = await sessions.clientA.client
      .from('tenants')
      .select('*')
      .eq('id', tenantBId);
    assert.strictEqual(crossTenantRead?.length || 0, 0, 'RLS must return 0 rows when Client A queries Tenant B directly');

    // 4.2 Cannot read Tenant B leads
    const { data: crossLeadsRead } = await sessions.clientA.client
      .from('leads')
      .select('*')
      .eq('tenant_id', tenantBId);
    assert.strictEqual(crossLeadsRead?.length || 0, 0, 'RLS must return 0 leads when Client A queries Tenant B leads');

    // 4.3 Cannot read Tenant B setup steps
    const { data: crossStepsRead } = await sessions.clientA.client
      .from('client_setup_steps')
      .select('*')
      .eq('tenant_id', tenantBId);
    assert.strictEqual(crossStepsRead?.length || 0, 0, 'RLS must return 0 setup steps when Client A queries Tenant B steps');

    // 4.4 Cannot read Tenant B users / team members
    const { data: crossUsersRead } = await sessions.clientA.client
      .from('users')
      .select('id, email, tenant_id')
      .eq('tenant_id', tenantBId);
    assert.strictEqual(crossUsersRead?.length || 0, 0, 'RLS must return 0 team members when Client A queries Tenant B members');

    // 4.5 Cannot update Tenant B data
    const { data: crossUpdateResult } = await sessions.clientA.client
      .from('tenants')
      .update({ name: 'Hacked by Client A' })
      .eq('id', tenantBId)
      .select();
    assert.strictEqual(crossUpdateResult?.length || 0, 0, 'RLS must reject Client A update on Tenant B');

    // 4.6 Cannot delete Tenant B data
    const { data: crossDeleteResult } = await sessions.clientA.client
      .from('tenants')
      .delete()
      .eq('id', tenantBId)
      .select();
    assert.strictEqual(crossDeleteResult?.length || 0, 0, 'RLS must reject Client A delete on Tenant B');

    console.log('  PASS: Client A strictly blocked from reading, updating, or deleting Tenant B.');

    // -------------------------------------------------------------
    // Step 5: Test CLIENT MEMBER A Tenant Isolation & Privilege Escalation
    // -------------------------------------------------------------
    console.log(' [5/6] Testing Client Member A tenant isolation and role restrictions...');

    // 5.1 Member A can read Tenant A setup steps
    const { data: memberASteps } = await sessions.memberA.client
      .from('client_setup_steps')
      .select('*')
      .eq('tenant_id', tenantAId);
    assert(memberASteps && memberASteps.length > 0, 'Member A must read Tenant A setup steps');

    // 5.2 Member A cannot read Tenant B setup steps
    const { data: memberACrossSteps } = await sessions.memberA.client
      .from('client_setup_steps')
      .select('*')
      .eq('tenant_id', tenantBId);
    assert.strictEqual(memberACrossSteps?.length || 0, 0, 'Member A cannot read Tenant B setup steps');

    // 5.3 Member A cannot update Tenant details (Privilege boundary: only Client owner can update tenant)
    const { data: memberUpdateTenant } = await sessions.memberA.client
      .from('tenants')
      .update({ name: 'Modified by Member' })
      .eq('id', tenantAId)
      .select();
    assert.strictEqual(memberUpdateTenant?.length || 0, 0, 'Client Member cannot update tenant details');

    console.log('  PASS: Client Member A verified for tenant isolation and privilege boundaries.');

    // -------------------------------------------------------------
    // Step 6: Test CLIENT B Isolation (B cannot see A)
    // -------------------------------------------------------------
    console.log(' [6/6] Verifying symmetric isolation (Client B cannot read Tenant A)...');
    const { data: clientBQueryA } = await sessions.clientB.client
      .from('tenants')
      .select('id')
      .eq('id', tenantAId);
    assert.strictEqual(clientBQueryA?.length || 0, 0, 'Client B cannot view Tenant A');

    const { data: clientBLeadsA } = await sessions.clientB.client
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantAId);
    assert.strictEqual(clientBLeadsA?.length || 0, 0, 'Client B cannot view Tenant A leads');

    console.log('  PASS: Symmetric isolation confirmed between Tenant A and Tenant B.');
    console.log('\nAUTHENTICATED USER RLS VERIFICATION COMPLETED WITH 100% SUCCESS.\n');
  } finally {
    // -------------------------------------------------------------
    // Cleanup: Hard-delete test users and Tenant B records
    // -------------------------------------------------------------
    console.log('--- Cleaning up RLS Test Artifacts ---');
    for (const uid of createdAuthUserIds) {
      try {
        await adminClient.from('users').delete().eq('id', uid);
        await adminClient.auth.admin.deleteUser(uid);
      } catch {
        // best effort cleanup
      }
    }

    try {
      await adminClient.from('leads').delete().eq('tenant_id', tenantBId);
      await adminClient.from('client_setup_steps').delete().eq('tenant_id', tenantBId);
      await adminClient.from('tenants').delete().eq('id', tenantBId);
      // clean leadA
      await adminClient.from('leads').delete().eq('contact_email', 'lead.a@gmail.test');
    } catch {
      // best effort cleanup
    }
  }
}

if (require.main === module || process.argv[1]?.includes('authenticated-rls')) {
  runAuthenticatedRlsTests().catch((err) => {
    console.error('Authenticated RLS Test Failed:', err);
    process.exit(1);
  });
}
