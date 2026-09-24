'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Input, Select, Modal } from '@/components/ui';

interface Member {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role: string;
  expires_at: string;
}

export default function TeamManagementPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const resetModalState = () => {
    setIsModalOpen(false);
    setGeneratedLink('');
    setErrorMessage('');
    setInviteEmail('');
    setInvitePhone('');
  };

  useEffect(() => {
    let isMounted = true;
    async function loadTeam() {
      try {
        const res = await fetch(`/api/portal/${clientId}/team`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.members) setMembers(data.members);
            if (data.invitations) setInvitations(data.invitations);
          }
        }
      } catch {
        // Fallback remains active
      }
    }
    loadTeam();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Fallback members
  const activeMembers: Member[] = members.length > 0 ? members : [
    { id: 'user-client-1', full_name: 'John Smith', email: 'john@abcroofing.com', phone: '+1 (555) 234-5678', role: 'client', created_at: '2026-09-10T00:00:00Z' },
    { id: 'user-member-1', full_name: 'Sarah Connor', email: 'sarah@abcroofing.com', phone: '+1 (555) 876-5432', role: 'client_member', created_at: '2026-09-12T00:00:00Z' },
  ];

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !invitePhone.trim()) {
      setErrorMessage('Both email and phone number are required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setGeneratedLink('');

    try {
      const res = await fetch(`/api/portal/${clientId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          phone: invitePhone.trim(),
          role: 'client_member',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setGeneratedLink(data.magicLinkUrl);
        setInvitations((prev) => [data.invitation, ...prev]);
      } else {
        setErrorMessage(data.error || 'Failed to send invitation');
      }
    } catch {
      setErrorMessage('Failed to connect to invitation service');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Magic-link invitation copied to clipboard!');
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Team Members</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Manage staff access to your business portal, leads, and onboarding assets.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          Invite Team Member
        </Button>
      </div>

      {/* Active Team Members List */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Active Team Members"
          subtitle={`${activeMembers.length} authorized staff members`}
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left' }}>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Name</th>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Email</th>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Phone</th>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Role</th>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Added Date</th>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeMembers.map((member) => (
                <tr key={member.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: 'var(--space-3)', fontWeight: 'var(--font-weight-medium)' }}>
                    {member.full_name}
                  </td>
                  <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
                    {member.email}
                  </td>
                  <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
                    {member.phone || 'Not provided'}
                  </td>
                  <td style={{ padding: 'var(--space-3)' }}>
                    {member.role === 'client' ? 'Portal Administrator' : 'Team Member'}
                  </td>
                  <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: 'var(--space-3)' }}>
                    <StatusBadge status="Active" variant="done" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader
            title="Pending Invitations"
            subtitle="Invitations valid for 72 hours until accepted"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {invitations.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
                    {inv.full_name ? `${inv.full_name} (${inv.email})` : inv.email}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    Role: {inv.role} | {inv.phone ? `Phone: ${inv.phone} | ` : ''}Expires: {new Date(inv.expires_at).toLocaleString()}
                  </div>
                </div>
                <StatusBadge status="Pending Acceptance" variant="progress" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Invite Member Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={resetModalState}
        title="Invite New Team Member"
      >
        {generatedLink ? (
          <div>
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-status-done-bg)',
                color: 'var(--color-status-done-text)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              Invitation generated successfully! Share this single-use link with your team member:
            </div>
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'monospace',
                fontSize: 'var(--font-size-xs)',
                wordBreak: 'break-all',
                marginBottom: 'var(--space-4)',
              }}
            >
              {generatedLink}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button variant="primary" fullWidth onClick={() => copyToClipboard(generatedLink)}>
                Copy Link to Clipboard
              </Button>
              <Button
                variant="outline"
                onClick={resetModalState}
              >
                Invite Another
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInviteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {errorMessage && (
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-status-blocked-bg)',
                  color: 'var(--color-status-blocked-text)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                {errorMessage}
              </div>
            )}

            <Input
              label="Colleague Email Address"
              type="email"
              placeholder="e.g. colleague@abcroofing.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />

            <Input
              label="Phone Number"
              type="tel"
              placeholder="e.g. +1 (555) 234-5678"
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value)}
              required
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button variant="outline" type="button" onClick={resetModalState}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmitting || !inviteEmail.trim() || !invitePhone.trim()}>
                {isSubmitting ? 'Generating Invitation...' : 'Send Magic-Link Invitation'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
