import { NextResponse } from 'next/server';
import { contractRepository, tenantRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { validateText } from '@/lib/validation';

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
 * Admin management of a client's signed contracts.
 * GET lists them; POST/DELETE take { kind: 'contract', ... }.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const contracts = await contractRepository.listByTenant(params.id);
    return NextResponse.json({ success: true, contracts });
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

    return NextResponse.json({ error: 'Unknown record type.' }, { status: 400 });
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
    if (!id || kind !== 'contract') {
      return NextResponse.json({ error: 'kind and recordId are required.' }, { status: 400 });
    }
    const removed = await contractRepository.remove(params.id, id);
    if (!removed) return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    await audit(session!.email, params.id, 'contract.removed', id, {});
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
