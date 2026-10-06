'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, Modal } from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import { Notice } from '@/components/admin/Notice';

/** Today as YYYY-MM-DD in the viewer's own timezone, for the date picker's upper limit. */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Same limits as the server (src/lib/integrations/sheets/contract-files.ts).
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const FILE_ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg';
const FILE_TYPES = /\.(pdf|docx|png|jpe?g)$/i;

type AttachMode = 'upload' | 'link';

interface ContractRow {
  id: string;
  title: string;
  document_url?: string;
  signed_at?: string;
  /** Set when the file was uploaded to the client's Google Drive folder. */
  drive_file_id?: string;
}

/** Admin panel to attach signed contracts for one client: upload the file, or paste a link. */
export const ClientRecords: React.FC<{ clientId: string; clientName?: string }> = ({ clientId, clientName }) => {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<ContractRow | null>(null);

  const [mode, setMode] = useState<AttachMode>('upload');
  const [contractTitle, setContractTitle] = useState('');
  const [contractUrl, setContractUrl] = useState('');
  const [contractFile, setContractFile] = useState<File | null>(null);
  // A file input cannot be cleared from code; a new key gives a fresh, empty one.
  const [fileInputKey, setFileInputKey] = useState(0);
  const [contractSigned, setContractSigned] = useState('');

  const api = `/api/admin/clients/${clientId}/records`;

  const load = async () => {
    setLoadError('');
    try {
      const res = await fetch(api);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setContracts(data.contracts || []);
      } else {
        setLoadError(data.error || 'Could not load this client’s contracts.');
      }
    } catch {
      setLoadError('Could not reach the server, so contracts could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  /** Sends JSON, or a form with a file. Returns the server's answer when it saved, else null. */
  const send = async (method: string, body?: Record<string, unknown> | FormData, query = ''): Promise<Record<string, any> | null> => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
      const res = await fetch(api + query, {
        method,
        // For a form the browser sets the content type itself (it carries the file boundary).
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setError(
          data.error ||
            (res.status === 413
              ? 'That file is too large to upload. Use a file up to 4 MB, or paste a link instead.'
              : 'That did not save. Please try again.')
        );
        return null;
      }
      await load();
      return data;
    } catch {
      setError('Could not reach the server. Nothing was changed.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addContract = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (contractSigned && contractSigned > todayIso()) {
      setError('The signed date cannot be in the future.');
      return;
    }

    let saved: Record<string, any> | null;
    if (mode === 'upload') {
      if (!contractFile) {
        setError('Choose the contract file to upload.');
        return;
      }
      if (!FILE_TYPES.test(contractFile.name)) {
        setError('Upload a PDF, DOCX, PNG or JPG file.');
        return;
      }
      if (contractFile.size > MAX_FILE_BYTES) {
        setError('That file is larger than 4 MB. Upload a smaller file, or paste a link instead.');
        return;
      }
      const form = new FormData();
      form.append('kind', 'contract');
      form.append('title', contractTitle);
      if (contractSigned) form.append('signed_at', contractSigned);
      form.append('file', contractFile);
      saved = await send('POST', form);
    } else {
      saved = await send('POST', {
        kind: 'contract',
        title: contractTitle,
        document_url: contractUrl,
        signed_at: contractSigned || undefined,
      });
    }

    if (saved) {
      setContractTitle('');
      setContractUrl('');
      setContractFile(null);
      setFileInputKey((k) => k + 1);
      setContractSigned('');
      if (mode === 'upload') {
        setNotice(
          saved.driveAccessWarning
            ? `The contract was uploaded, but the client may not be able to open it yet. ${saved.driveAccessWarning}`
            : `Contract uploaded to ${clientName || 'the client'}’s Google Drive folder. Only Motionz staff and the account owner can open it.`
        );
      }
    }
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
    padding: 'var(--space-3)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
  };

  const choiceStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--font-size-sm)',
    cursor: busy ? 'default' : 'pointer',
  };

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader title="Contract" subtitle="What the client sees on their Contract page." />

      {error && <Notice style={{ marginBottom: 'var(--space-3)' }}>{error}</Notice>}
      {notice && (
        <Notice tone="info" style={{ marginBottom: 'var(--space-3)' }}>
          {notice}
        </Notice>
      )}
      {loadError && (
        <Notice onRetry={load} style={{ marginBottom: 'var(--space-3)' }}>
          {loadError}
        </Notice>
      )}

      {/* Staff-only reminder, shown until a contract is attached. */}
      {!loading && !loadError && contracts.length === 0 && !notice && (
        <Notice tone="info" style={{ marginBottom: 'var(--space-3)' }}>
          No contract attached yet. Upload the signed contract or paste its link below so {clientName || 'the client'} can see it on their Contract page.
        </Notice>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {loading && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Loading contracts...</span>}
        {contracts.map((c) => (
          <div key={c.id} style={rowStyle}>
            <div>
              <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{c.title}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {c.signed_at ? `Signed ${formatDate(c.signed_at)}` : 'Not signed yet'}
                {' · '}
                {c.drive_file_id ? 'Uploaded file in Google Drive' : c.document_url ? 'Link' : 'No document'}
                {c.document_url && (
                  <>
                    {' · '}
                    <a href={c.document_url} target="_blank" rel="noopener noreferrer">
                      Open
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRemoveTarget(c)}>
              Remove
            </Button>
          </div>
        ))}
      </div>

      <form onSubmit={addContract}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: '0 0 var(--space-3) 0', minWidth: 0 }}>
          <legend className="ui-label" style={{ padding: 0 }}>
            How do you want to attach the contract?
          </legend>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <label style={choiceStyle}>
              <input type="radio" name={`contract-mode-${clientId}`} checked={mode === 'upload'} onChange={() => setMode('upload')} />
              Upload a file
            </label>
            <label style={choiceStyle}>
              <input type="radio" name={`contract-mode-${clientId}`} checked={mode === 'link'} onChange={() => setMode('link')} />
              Paste a link
            </label>
          </div>
        </fieldset>

        <div style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'start' }}>
          <Input label="Title" value={contractTitle} onChange={(e) => setContractTitle(e.target.value)} placeholder="Service Agreement" maxLength={200} required />
          {mode === 'upload' ? (
            <Input
              key={fileInputKey}
              id={`contract-file-${clientId}`}
              label="Contract file"
              type="file"
              accept={FILE_ACCEPT}
              onChange={(e) => setContractFile(e.target.files?.[0] || null)}
              helperText="PDF, DOCX, PNG or JPG, up to 4 MB."
              required
            />
          ) : (
            <Input
              label="Document link"
              type="url"
              value={contractUrl}
              onChange={(e) => setContractUrl(e.target.value)}
              placeholder="https://..."
              maxLength={2000}
              helperText="For example a DocuSign link."
            />
          )}
          <Input label="Signed on" type="date" max={todayIso()} value={contractSigned} onChange={(e) => setContractSigned(e.target.value)} />
        </div>

        <p style={{ margin: 'var(--space-2) 0 var(--space-3) 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {mode === 'upload'
            ? 'The file is saved in this client’s Google Drive folder. It is never public: only Motionz staff and the account owner can open it, signed in to Google.'
            : 'The client opens this link from their Contract page. Make sure they are allowed to open it.'}
        </p>

        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? (mode === 'upload' ? 'Uploading...' : 'Saving...') : mode === 'upload' ? 'Upload contract' : 'Attach contract'}
        </Button>
      </form>

      <Modal
        isOpen={Boolean(removeTarget)}
        onClose={() => {
          if (!busy) setRemoveTarget(null);
        }}
        title="Remove contract"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (!removeTarget) return;
                const removed = await send('DELETE', undefined, `?kind=contract&recordId=${encodeURIComponent(removeTarget.id)}`);
                if (removed?.driveWarning) setNotice(removed.driveWarning);
                setRemoveTarget(null);
              }}
            >
              {busy ? 'Removing...' : 'Remove contract'}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
          Remove <strong>{removeTarget?.title}</strong>? The client will no longer see it on their Contract page.
          {removeTarget?.drive_file_id ? ' The uploaded file is moved to the bin in Google Drive.' : ''}
        </p>
      </Modal>
    </Card>
  );
};
