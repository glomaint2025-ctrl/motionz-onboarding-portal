'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';

/** Where the clients list looks for a message left by another page ("<name> was deleted."). */
export const CLIENTS_NOTICE_KEY = 'motionz.clients.notice';

export interface DeleteClientDialogProps {
  /** The client to delete; null keeps the dialog closed. */
  client: { id: string; name: string } | null;
  onClose: () => void;
  /** Called once the client is gone, with the message to show ("<name> was deleted." plus any notes). */
  onDeleted: (message: string) => void;
}

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-secondary)',
  lineHeight: 1.5,
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-1)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-semibold)' as React.CSSProperties['fontWeight'],
  color: 'var(--color-text-primary)',
};

/**
 * The one dialog for deleting a client for good, used by the clients list and the client page.
 * The red button only works once the client's name has been typed.
 */
export function DeleteClientDialog({ client, onClose, onDeleted }: DeleteClientDialogProps) {
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A fresh dialog for every client.
  useEffect(() => {
    setTypedName('');
    setError('');
    setBusy(false);
  }, [client?.id]);

  const nameMatches = Boolean(client) && typedName.trim().toLowerCase() === client!.name.trim().toLowerCase();
  const close = () => {
    if (!busy) onClose();
  };

  const handleDelete = async () => {
    if (!client || !nameMatches || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_client_permanently', confirmName: typedName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const notes = [
          data.message || `${client.name} was deleted.`,
          data.driveNote,
          data.driveAccessWarning,
          ...(Array.isArray(data.warnings) ? data.warnings : []),
        ].filter(Boolean);
        onDeleted(notes.join(' '));
        return;
      }
      setError(data.error || 'Could not delete this client. Please try again.');
    } catch {
      setError('Could not reach the server. Check the clients list to see whether the client is still there.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(client)}
      onClose={close}
      title="Delete client permanently"
      dismissOnOverlay={false}
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete} disabled={!nameMatches || busy}>
            {busy ? 'Deleting...' : 'Delete permanently'}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleDelete();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        {error && <Notice>{error}</Notice>}

        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
          This deletes <strong style={{ color: 'var(--color-text-primary)' }}>{client?.name}</strong> for good. It cannot be undone.
        </p>

        <div>
          <p style={headingStyle}>What is deleted</p>
          <ul style={listStyle}>
            <li>The client and its portal</li>
            <li>Everyone at the client: the account owner, team members, their sign-ins and invitations</li>
            <li>Leads, appointments, lead requests and onboarding answers</li>
            <li>Contracts, setup steps, roof measurements, video choices and uploaded files</li>
          </ul>
        </div>

        <div>
          <p style={headingStyle}>What is kept</p>
          <ul style={listStyle}>
            <li>The history in Audit Logs</li>
            <li>Their Google Drive folder and files. Only the access to them is removed; delete the folder in Drive if you no longer need it.</li>
          </ul>
        </div>

        <Notice tone="info">If they might come back, archive them instead.</Notice>

        <Input
          label={`Type the client's name to confirm: ${client?.name || ''}`}
          id="delete-client-confirm-name"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={client?.name || ''}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </form>
    </Modal>
  );
}
