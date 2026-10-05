// Sends SIMULATED GoHighLevel webhooks to a portal (GHL cannot reach localhost).
// Usage: node scripts/simulate-ghl-webhooks.mjs <secret|leads|stage|call|form> [baseUrl=http://localhost:3001]
// Same shape as the real workflows: secret + event in customData. Test data only (@example.com).
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL = `${process.argv[3] || 'http://localhost:3001'}/api/webhooks/ghl`;
const SECRET = env.GHL_WEBHOOK_SECRET;
const LOCATION = 'TG1QAGQkANvoJ3UdmZRZ';
const post = async (label, body) => {
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  console.log(`${label}: ${r.status} ${(await r.text()).slice(0, 120)}`);
};
const what = process.argv[2];
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
    email: 'heshantharushka2002@gmail.com',
    calendar: { appointmentId: 'sim-appt-1', startTime: start.toISOString(), title: 'Motionz - Reviews Meeting', status: 'confirmed' },
    customData: { event: 'csm_call', secret: SECRET },
  });
}
if (what === 'form') {
  await post('onboarding form (client)', {
    contact_id: 'sim-contact-form',
    email: 'heshantharushka2002@gmail.com',
    'Full Name': 'Heshan Tharushka',
    'DBA Business Name': 'Zydeco Roof Revival',
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
