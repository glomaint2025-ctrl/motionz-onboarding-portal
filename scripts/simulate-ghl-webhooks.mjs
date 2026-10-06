// Sends SIMULATED GoHighLevel webhooks to a portal (GHL cannot reach localhost).
// Same shape as the real workflows: secret + event in customData. Test data only (ids start with "sim-").
//
// Usage:
//   node scripts/simulate-ghl-webhooks.mjs <secret|leads|stage|call|form> --location=<id> --email=<address> [baseUrl]
//
//   --location=<id>      GoHighLevel Location ID of the TEST client that should receive the leads
//                        (or env SIM_GHL_LOCATION_ID). Never a real client's sub-account.
//   --email=<address>    Sign-in email of the TEST client the call / form belongs to (or env SIM_CLIENT_EMAIL).
//   baseUrl              Portal to send to. Default http://localhost:3001.
//   --yes-this-is-staging  Required when baseUrl is not localhost.
//
// There are no built-in defaults for the location or the email on purpose: a hardcoded id would
// put fake leads into whichever real client owns that sub-account.
// Clean up afterwards with: node scripts/clear-simulated-ghl-data.mjs
import { readFileSync } from 'node:fs';

const USAGE = `Usage: node scripts/simulate-ghl-webhooks.mjs <secret|leads|stage|call|form> --location=<id> --email=<address> [baseUrl] [--yes-this-is-staging]
  --location   Location ID of a TEST client (or env SIM_GHL_LOCATION_ID)
  --email      sign-in email of a TEST client (or env SIM_CLIENT_EMAIL)
  baseUrl      default http://localhost:3001; anything that is not localhost also needs --yes-this-is-staging`;

function fail(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3).trim();
const positional = args.filter((a) => !a.startsWith('--'));

const what = positional[0];
const baseUrl = (positional[1] || 'http://localhost:3001').replace(/\/+$/, '');
const LOCATION = flag('location') || (process.env.SIM_GHL_LOCATION_ID || '').trim();
const EMAIL = (flag('email') || (process.env.SIM_CLIENT_EMAIL || '').trim()).toLowerCase();

if (!['secret', 'leads', 'stage', 'call', 'form'].includes(what)) fail('Choose what to send: secret, leads, stage, call or form.');
if (!LOCATION) fail('Missing --location=<id>: the Location ID of the test client that should receive the leads.');
if (!/^[A-Za-z0-9_-]{6,64}$/.test(LOCATION)) fail(`"${LOCATION}" does not look like a GoHighLevel Location ID.`);
if (!EMAIL) fail('Missing --email=<address>: the sign-in email of the test client the call and form belong to.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) fail(`"${EMAIL}" is not an email address.`);

let host;
try {
  host = new URL(baseUrl).hostname;
} catch {
  fail(`"${baseUrl}" is not a valid URL.`);
}
const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
if (!isLocal && !args.includes('--yes-this-is-staging')) {
  fail(`Refusing to send simulated data to ${host}. Add --yes-this-is-staging if that is a staging portal. Never run this against production.`);
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_TARGET = `${baseUrl}/api/webhooks/ghl`;
const SECRET = env.GHL_WEBHOOK_SECRET;

console.log(`Sending "${what}" to ${URL_TARGET} (location ${LOCATION}, client email ${EMAIL})`);

const post = async (label, body) => {
  const r = await fetch(URL_TARGET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  console.log(`${label}: ${r.status} ${(await r.text()).slice(0, 120)}`);
};

if (what === 'secret') {
  await post('wrong secret', { customData: { event: 'lead', secret: 'nope' } });
}
if (what === 'leads') {
  const stages = ['New Lead', 'New Lead', 'Contacted', 'Appointment Booked', 'Appointment Booked', 'Showed', 'Sold', 'Lost'];
  for (const [i, stage] of stages.entries()) {
    await post(`lead ${i + 1} (${stage})`, {
      contact_id: `sim-contact-${i + 1}`,
      first_name: 'Sim',
      last_name: `Lead ${i + 1}`,
      email: `sim.lead${i + 1}@example.com`,
      phone: `+1 337 555 01${String(10 + i)}`,
      opportunity_source: i % 2 ? 'Facebook' : 'Website',
      location: { id: LOCATION },
      customData: { event: 'lead', secret: SECRET, stage },
    });
  }
}
if (what === 'stage') {
  await post('lead 1 -> Contacted', {
    contact_id: 'sim-contact-1', first_name: 'Sim', last_name: 'Lead 1', email: 'sim.lead1@example.com',
    location: { id: LOCATION }, customData: { event: 'lead', secret: SECRET, stage: 'Contacted' },
  });
}
if (what === 'call') {
  const start = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  start.setUTCHours(15, 0, 0, 0);
  await post('csm call', {
    email: EMAIL,
    calendar: { appointmentId: 'sim-appt-1', startTime: start.toISOString(), title: 'Motionz - Reviews Meeting', status: 'confirmed' },
    customData: { event: 'csm_call', secret: SECRET },
  });
}
if (what === 'form') {
  await post('onboarding form (client)', {
    contact_id: 'sim-contact-form',
    email: EMAIL,
    'Full Name': 'TEST ONLY - Simulated Owner',
    'DBA Business Name': 'TEST ONLY - Simulated Roofing',
    'What areas do you serve?': 'TEST ONLY - Lafayette, LA and nearby',
    customData: { event: 'onboarding_form', secret: SECRET },
  });
  await post('onboarding form (unmatched)', {
    contact_id: 'sim-contact-stranger',
    email: 'stranger@example.com',
    'Full Name': 'Unknown Sender',
    'DBA Business Name': 'TEST ONLY - Unknown Roofing',
    customData: { event: 'onboarding_form', secret: SECRET },
  });
}
