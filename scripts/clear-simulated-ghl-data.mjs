// Removes SIMULATED GoHighLevel data (made by scripts/simulate-ghl-webhooks.mjs) from the database in .env.local:
// leads and calls whose GHL ids start with "sim-", and onboarding forms sent by simulated contacts.
// Real data is never touched. Usage: node scripts/clear-simulated-ghl-data.mjs [--apply]   (dry run without --apply)
// Safety: refuses to run when NODE_ENV=production and prints the database host first. It needs no
// extra confirmation flag because it can only delete rows whose GoHighLevel id starts with "sim-".
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const apply = process.argv.includes('--apply');

// Simulated data is only ever created on staging or a local portal, so there is nothing to clear in production.
if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
  console.error('Refusing to run: NODE_ENV is "production". This script is for the staging database only.');
  process.exit(1);
}
try {
  console.log(`Database: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}`);
} catch {
  console.error('No database is configured in .env.local (NEXT_PUBLIC_SUPABASE_URL).');
  process.exit(1);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function must(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

const leads = await must(db.from('leads').select('id, email').like('ghl_contact_id', 'sim-%'));
const calls = await must(db.from('appointments').select('id').like('ghl_appointment_id', 'sim-%'));
const forms = await must(db.from('onboarding_submissions').select('id, submitter_email').like('ghl_contact_id', 'sim-%'));
console.log(`Simulated leads: ${leads.length}, calls: ${calls.length}, onboarding forms: ${forms.length}`);
if (!apply) {
  console.log('Dry run only. Re-run with --apply to delete.');
  process.exit(0);
}
if (leads.length) await must(db.from('leads').delete().in('id', leads.map((l) => l.id)));
if (calls.length) await must(db.from('appointments').delete().in('id', calls.map((c) => c.id)));
if (forms.length) await must(db.from('onboarding_submissions').delete().in('id', forms.map((f) => f.id)));
console.log('Done.');
