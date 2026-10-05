// Removes SIMULATED GoHighLevel data (made by scripts/simulate-ghl-webhooks.mjs) from the database in .env.local:
// leads and calls whose GHL ids start with "sim-", and onboarding forms sent by simulated contacts.
// Real data is never touched. Usage: node scripts/clear-simulated-ghl-data.mjs [--apply]   (dry run without --apply)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const apply = process.argv.includes('--apply');

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
