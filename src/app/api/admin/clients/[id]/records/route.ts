import { NextResponse } from 'next/server';
import { contractRepository, orderRepository, tenantRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { validateText } from '@/lib/validation';
import type { OrderStage } from '@/lib/db/schema';

const ORDER_STAGES: OrderStage[] = ['ordered', 'packaged', 'shipped', 'delivered', 'issue'];

function httpsUrl(value: unknown, field: string): string | undefined {
  const text = validateText(value, field, { max: 2000 });
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    throw Object.assign(new Error(`${field} must be a full https:// link.`), { statusCode: 400 });
  }
}

/**
 * Admin management of a client's signed contracts and physical orders.
 * GET lists both; POST/PATCH/DELETE take { kind: 'contract' | 'order', ... }.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const [contracts, orders] = await Promise.all([
      contractRepository.listByTenant(params.id),
      orderRepository.listByTenant(params.id),
    ]);
    return NextResponse.json({ success: true, contracts, orders });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load records.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const tenant = await tenantRepository.findById(params.id);
    if (!tenant) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    const body = await request.json().catch(() => ({}));

    if (body.kind === 'contract') {
      const signedAt = body.signed_at ? new Date(body.signed_at) : null;
      if (signedAt && isNaN(signedAt.getTime())) {
        return NextResponse.json({ error: 'Signed date is not a valid date.' }, { status: 400 });
      }
      const contract = await contractRepository.create({
        tenant_id: tenant.id,
        title: validateText(body.title, 'Contract title', { required: true, max: 255 })!,
        document_url: httpsUrl(body.document_url, 'Document link'),
        signed_at: signedAt ? signedAt.toISOString() : undefined,
      });
      await audit(session!.email, tenant.id, 'contract.added', contract.id, { title: contract.title });
      return NextResponse.json({ success: true, contract });
    }

    if (body.kind === 'order') {
      const stage = (body.stage || 'ordered') as OrderStage;
      if (!ORDER_STAGES.includes(stage)) return NextResponse.json({ error: 'Invalid order stage.' }, { status: 400 });
      const order = await orderRepository.create({
        tenant_id: tenant.id,
        order_number: validateText(body.order_number, 'Order number', { max: 100 }) || `ORD-${Date.now().toString(36).toUpperCase()}`,
        label: validateText(body.label, 'Order description', { required: true, max: 255 })!,
        stage,
        carrier: validateText(body.carrier, 'Carrier', { max: 100 }),
        tracking_number: validateText(body.tracking_number, 'Tracking number', { max: 255 }),
        tracking_url: httpsUrl(body.tracking_url, 'Tracking link'),
        issue_notes: validateText(body.issue_notes, 'Issue notes', { max: 2000 }),
      });
      await audit(session!.email, tenant.id, 'order.added', order.id, { label: order.label, stage });
      return NextResponse.json({ success: true, order });
    }

    return NextResponse.json({ error: 'Unknown record type.' }, { status: 400 });
  } catch (err: any) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));
    if (body.kind !== 'order' || !body.id) {
      return NextResponse.json({ error: 'Only orders can be updated.' }, { status: 400 });
    }
    if (body.stage && !ORDER_STAGES.includes(body.stage)) {
      return NextResponse.json({ error: 'Invalid order stage.' }, { status: 400 });
    }
    const order = await orderRepository.update(params.id, String(body.id), {
      ...(body.stage ? { stage: body.stage } : {}),
      ...(body.carrier !== undefined ? { carrier: validateText(body.carrier, 'Carrier', { max: 100 }) } : {}),
      ...(body.tracking_number !== undefined ? { tracking_number: validateText(body.tracking_number, 'Tracking number', { max: 255 }) } : {}),
      ...(body.tracking_url !== undefined ? { tracking_url: httpsUrl(body.tracking_url, 'Tracking link') } : {}),
      ...(body.issue_notes !== undefined ? { issue_notes: validateText(body.issue_notes, 'Issue notes', { max: 2000 }) } : {}),
    });
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    await audit(session!.email, params.id, 'order.updated', order.id, { stage: order.stage });
    return NextResponse.json({ success: true, order });
  } catch (err: any) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get('kind');
    const id = searchParams.get('recordId');
    if (!id || (kind !== 'contract' && kind !== 'order')) {
      return NextResponse.json({ error: 'kind and recordId are required.' }, { status: 400 });
    }
    const removed =
      kind === 'contract' ? await contractRepository.remove(params.id, id) : await orderRepository.remove(params.id, id);
    if (!removed) return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    await audit(session!.email, params.id, `${kind}.removed`, id, {});
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return errorResponse(err);
  }
}

async function audit(actorEmail: string, tenantId: string, action: string, resourceId: string, details: Record<string, any>) {
  await auditLogRepository.create({
    tenant_id: tenantId,
    actor_email: actorEmail,
    actor_role: 'admin',
    action,
    resource_type: action.split('.')[0],
    resource_id: resourceId,
    details,
  });
}

function errorResponse(err: any) {
  if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
  if (err.statusCode === 400 || err.name === 'ValidationError') {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'Failed to save the record.' }, { status: 500 });
}
