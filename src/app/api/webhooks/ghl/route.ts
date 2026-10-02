import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { tenantRepository, leadRepository, appointmentRepository } from '@/lib/db/repositories';
import { logAuditEvent } from '@/lib/db';

/**
 * GoHighLevel webhook receiver.
 *
 * GHL workflow "Webhook" actions do not sign requests, so each workflow must send the shared
 * secret (GHL_WEBHOOK_SECRET) in the `x-motionz-webhook-secret` header. Requests are rejected
 * when the secret is missing or wrong. Without a configured secret, the endpoint only accepts
 * traffic outside production (local development and tests).
 */
function isAuthorized(request: NextRequest): { ok: boolean; status?: number; error?: string } {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 503, error: 'Webhook secret is not configured.' };
    }
    return { ok: true };
  }

  const provided = request.headers.get('x-motionz-webhook-secret') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: 'Invalid webhook credentials.' };
  }
  return { ok: true };
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export async function POST(request: NextRequest) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: any;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  try {
    const type = str(payload?.type);
    const locationId = str(payload?.locationId) || str(payload?.location?.id);

    // Only accept events for a sub-account that is linked to exactly one portal.
    const tenant = locationId
      ? (await tenantRepository.list()).find((t) => t.ghl_location_id === locationId)
      : undefined;

    if (!tenant) {
      // 200 so GHL does not retry an event we will never be able to place.
      return NextResponse.json({ received: true, ignored: true, reason: 'Unknown or missing locationId.' });
    }

    if (type === 'ContactCreate' || type === 'ContactUpdate') {
      const contact = payload.contact || payload;
      const contactId = str(contact?.id);
      if (!contactId) {
        return NextResponse.json({ error: 'Contact id is required.' }, { status: 400 });
      }
      await leadRepository.upsertByGhlContactId(tenant.id, contactId, {
        first_name: str(contact.firstName),
        last_name: str(contact.lastName),
        email: str(contact.email),
        phone: str(contact.phone),
        source: str(contact.source),
        ...(str(contact.status) ? { status: str(contact.status)! } : {}),
      });
    } else if (type === 'AppointmentCreate' || type === 'AppointmentUpdate') {
      const appointment = payload.appointment || payload;
      const appointmentId = str(appointment?.id);
      const startTime = str(appointment?.startTime);
      if (!appointmentId || !startTime) {
        return NextResponse.json({ error: 'Appointment id and startTime are required.' }, { status: 400 });
      }
      await appointmentRepository.upsertByGhlAppointmentId(tenant.id, appointmentId, {
        contact_name: str(appointment.contactName) || str(appointment.title) || 'Call',
        appointment_time: startTime,
        status: str(appointment.appointmentStatus) || str(appointment.status) || 'confirmed',
        notes: str(appointment.notes),
      });
    }

    await logAuditEvent({
      tenantId: tenant.id,
      actorEmail: 'webhook@gohighlevel.com',
      actorRole: 'webhook',
      action: `ghl.webhook.${type || 'received'}`,
      resourceType: 'webhook',
      resourceId: locationId!,
      details: { type, locationId },
    });

    return NextResponse.json({ received: true, eventType: type });
  } catch (err: any) {
    console.error('[ghl-webhook] Failed to process event:', err?.message);
    return NextResponse.json({ error: 'Failed to process GoHighLevel webhook' }, { status: 500 });
  }
}
