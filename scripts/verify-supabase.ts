import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hagqtrhgetyrubvcskij.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('[ERROR] SUPABASE_SERVICE_ROLE_KEY environment variable is required.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function verifyDatabase() {
  console.log('--- Verifying Supabase Database Tables ---');
  const tables = [
    'portal_templates',
    'template_steps',
    'tenants',
    'users',
    'csm_assignments',
    'user_invitations',
    'client_setup_steps',
    'feature_toggles',
    'integration_configs',
    'contracts',
    'orders',
    'client_script_preferences',
    'roof_measurements',
    'leads',
    'appointments',
    'audit_logs',
    'security_events'
  ];

  for (const table of tables) {
    try {
      const { error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`[FAIL] Table "${table}": ${error.message} (code: ${error.code})`);
      } else {
        console.log(`[OK] Table "${table}" exists. Row count: ${count}`);
      }
    } catch (err: any) {
      console.log(`[ERROR] Table "${table}": ${err.message}`);
    }
  }

  // Check demo tenant
  console.log('\n--- Checking demo tenants ---');
  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, slug');
  if (tenantErr) {
    console.log('Tenants error:', tenantErr.message);
  } else {
    console.log('Tenants in DB:', tenants);
  }
}

verifyDatabase().catch(console.error);
