import { NextResponse } from 'next/server';
import { contractRepository, tenantRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { validateText } from '@/lib/validation';
import {
  ContractFileError,
  contractDriveFileId,
  driveStoragePath,
  trashContractFile,
  uploadContractFile,
  validateContractFile,
  MAX_CONTRACT_FILE_BYTES,
} from '@/lib/integrations/sheets/contract-files';
import { driveSyncWarning, syncClientDriveAccess } from '@/lib/integrations/sheets/access';
import type { Contract } from '@/lib/db/schema';

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

/** Adds `drive_file_id` for contracts whose file was uploaded to the client's Drive folder. */
const present = (contract: Contract) => {
  const driveFileId = contractDriveFileId(contract);
  return driveFileId ? { ...contract, drive_file_id: driveFileId } : contract;
};

/**
 * Admin management of a client's signed contracts.
 * GET lists them; POST/DELETE take { kind: 'contract', ... }.
 *
 * A contract is attached in one of two ways:
 * - a link (JSON body with `document_url`), for DocuSign and similar;
 * - a file (multipart form with `file`), which is saved in the client's Google Drive folder
 *   and shared with the client owner as viewer.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const contracts = await contractRepository.listByTenant(params.id);
    return NextResponse.json({ success: true, contracts: contracts.map(present) });
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

    const isUpload = (request.headers.get('content-type') || '').toLowerCase().includes('multipart/form-data');
    let body: Record<string, any> = {};
    let file: File | null = null;
    if (isUpload) {
      // Refuse an oversized upload before reading it into memory (the form adds a little on top of the file).
      if (Number(request.headers.get('content-length') || 0) > MAX_CONTRACT_FILE_BYTES + 200 * 1024) {
        return NextResponse.json(
          { error: 'That file is larger than 4 MB. Upload a smaller file, or paste a link instead.' },
          { status: 400 }
        );
      }
      const form = await request.formData().catch(() => null);
      if (!form) return NextResponse.json({ error: 'The upload could not be read. Please try again.' }, { status: 400 });
      const field = (key: string) => {
        const value = form.get(key);
        return typeof value === 'string' ? value : undefined;
      };
      body = { kind: field('kind'), title: field('title'), signed_at: field('signed_at') };
      const entry = form.get('file');
      file = entry && typeof entry !== 'string' ? (entry as File) : null;
    } else {
      body = (await request.json().catch(() => ({}))) || {};
    }

    if (body.kind === 'contract') {
      const signedAt = body.signed_at ? new Date(body.signed_at) : null;
      if (signedAt && isNaN(signedAt.getTime())) {
        return NextResponse.json({ error: 'Signed date is not a valid date.' }, { status: 400 });
      }
      // One day of leeway covers admins whose local date is ahead of the server's.
      if (signedAt && signedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'The signed date cannot be in the future.' }, { status: 400 });
      }
      const title = validateText(body.title, 'Contract title', { required: true, max: 255 })!;

      // Upload a file: it goes into the client's Drive folder, then the owner is given viewer access.
      if (isUpload) {
        if (!file) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
        const bytes = new Uint8Array(await file.arrayBuffer());
        const checked = validateContractFile({ name: file.name, type: file.type, size: file.size, bytes });
        const uploaded = await uploadContractFile({
          tenantId: tenant.id,
          name: checked.name,
          contentType: checked.contentType,
          bytes,
        });
        if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: uploaded.status });

        let contract: Contract;
        try {
          contract = await contractRepository.create({
            tenant_id: tenant.id,
            title,
            document_url: uploaded.url,
            storage_path: driveStoragePath(uploaded.fileId),
            signed_at: signedAt ? signedAt.toISOString() : undefined,
          });
        } catch (err) {
          await trashContractFile(uploaded.fileId); // do not leave a file nobody can find
          throw err;
        }
        await audit(session!.email, tenant.id, 'contract.added', contract.id, {
          title: contract.title,
          uploaded: true,
          file: checked.name,
        });

        const access = await syncClientDriveAccess(tenant.id, { actorEmail: session!.email, actorRole: 'admin' });
        const driveAccessWarning = driveSyncWarning(access);
        return NextResponse.json({
          success: true,
          contract: present(contract),
          ...(driveAccessWarning ? { driveAccessWarning } : {}),
        });
      }

      // Paste a link.
      const contract = await contractRepository.create({
        tenant_id: tenant.id,
        title,
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
    // Looked up before removing, to know whether a file in Google Drive goes with it.
    const existing = (await contractRepository.listByTenant(params.id)).find((c) => c.id === id);
    const removed = await contractRepository.remove(params.id, id);
    if (!removed) return NextResponse.json({ error: 'Record not found.' }, { status: 404 });

    // An uploaded contract's file goes to the bin in Drive (the script takes its viewers off first).
    const driveFileId = contractDriveFileId(existing);
    let driveWarning: string | undefined;
    if (driveFileId) {
      const binned = await trashContractFile(driveFileId);
      if (!binned.ok) {
        driveWarning = `The contract was removed from the portal, but its file is still in Google Drive: ${
          binned.error || 'Google Drive did not answer.'
        }`;
      }
    }
    await audit(session!.email, params.id, 'contract.removed', id, {
      ...(existing ? { title: existing.title } : {}),
      ...(driveFileId ? { driveFileBinned: !driveWarning } : {}),
    });
    return NextResponse.json({ success: true, ...(driveWarning ? { driveWarning } : {}) });
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
  if (err instanceof ContractFileError || err.statusCode === 400 || err.name === 'ValidationError') {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'Failed to save the record.' }, { status: 500 });
}
