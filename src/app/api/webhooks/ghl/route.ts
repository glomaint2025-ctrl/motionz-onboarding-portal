import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { tenantRepository, leadRepository, appointmentRepository } from '@/lib/db/repositories';
import { logAuditEvent, getTenantById } from '@/lib/db';

const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET || 'motionz-ghl-webhook-secret-default';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-ghl-signature');

    // In production with a set secret, verify HMAC SHA-256 signature
    if (process.env.NODE_ENV === 'production' && process.env.GHL_WEBHOOK_SECRET) {
      const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const { type, locationId, contact, appointment } = payload;

    // Resolve target tenant from locationId
    const allTenants = await tenantRepository.list();
    const tenant = allTenants.find((t) => t.ghl_location_id === locationId) || allTenants[0];
    const tenantId = tenant ? tenant.id : 'tenant-demo-abc-roofing';

    if (type === 'ContactCreate' || type === 'ContactUpdate') {
      const contactId = contact?.id || `cnt_${Date.now()}`;
      await leadRepository.create({
        tenant_id: tenantId,
        ghl_contact_id: contactId,
        first_name: contact?.firstName || 'Inbound',
        last_name: contact?.lastName || 'Lead',
        email: contact?.email || 'newlead@example.com',
        phone: contact?.phone || '(555) 000-0000',
        status: contact?.status || 'Contacted',
        source: contact?.source || 'GoHighLevel Webhook',
      });
    } else if (type === 'AppointmentCreate') {
      const appointmentId = appointment?.id || `apt_${Date.now()}`;
      await appointmentRepository.create({
        tenant_id: tenantId,
        ghl_appointment_id: appointmentId,
        contact_name: appointment?.contactName || 'Scheduled Client',
        appointment_time: appointment?.startTime || new Date().toISOString(),
        status: appointment?.status || 'confirmed',
        notes: appointment?.notes || 'Booked via GoHighLevel Calendar Widget',
      });
    }

    await logAuditEvent({
      tenantId,
      actorEmail: 'webhook@gohighlevel.com',
      actorRole: 'webhook',
      action: `ghl.webhook.${type || 'received'}`,
      resourceType: 'webhook',
      resourceId: locationId || 'unknown',
      details: { type, locationId },
    });

    return NextResponse.json({ received: true, eventType: type, tenantId });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to process GoHighLevel webhook' },
      { status: 500 }
    );
  }
}
