'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Input, Select, Modal, Skeleton } from '@/components/ui';
import { PORTAL_MODULES } from '@/lib/portal-modules';


interface Member {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  status?: 'active' | 'suspended';
  suspended_at?: string;
  suspended_reason?: string;
  suspended_by?: string;
  suspended_by_role?: 'admin' | 'csm' | 'client';
  allowed_modules?: string[];
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role: string;
  allowed_modules?: string[];
  expires_at: string;
}

export default function TeamManagementPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Revoke invitation states
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  // Resend invitation states
  const [resendTarget, setResendTarget] = useState<Invitation | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resentLink, setResentLink] = useState('');

  // Member ban / disable state
  const [banTarget, setBanTarget] = useState<Member | null>(null);
  const [isBanning, setIsBanning] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banError, setBanError] = useState('');

  const [tenantFeatureToggles, setTenantFeatureToggles] = useState<Record<string, boolean>>({});
  const [selectedInviteModules, setSelectedInviteModules] = useState<string[]>([]);

  // Member permissions editing state
  const [permissionTarget, setPermissionTarget] = useState<Member | null>(null);
  const [editAllowedModules, setEditAllowedModules] = useState<string[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [permissionSuccess, setPermissionSuccess] = useState('');

  const resetModalState = () => {
    setIsModalOpen(false);
    setGeneratedLink('');
    setErrorMessage('');
    setInviteEmail('');
    setInvitePhone('');
    setSelectedInviteModules([]);
  };

  const handleOpenInviteModal = () => {
    const defaultModules = PORTAL_MODULES
      .filter((m) => tenantFeatureToggles[m.key] !== false)
      .map((m) => m.key);
    setSelectedInviteModules(defaultModules);
    setInviteEmail('');
    setInvitePhone('');
    setErrorMessage('');
    setGeneratedLink('');
    setIsModalOpen(true);
  };

  const handleOpenPermissions = (member: Member) => {
    setPermissionTarget(member);
    setPermissionError('');
    setPermissionSuccess('');
    if (Array.isArray(member.allowed_modules)) {
      setEditAllowedModules(member.allowed_modules);
    } else {
      const activeKeys = PORTAL_MODULES
        .filter((m) => tenantFeatureToggles[m.key] !== false)
        .map((m) => m.key);
      setEditAllowedModules(activeKeys);
    }
  };

  const handleSavePermissions = async () => {
    if (!permissionTarget) return;
    setIsSavingPermissions(true);
    setPermissionError('');
    setPermissionSuccess('');

    try {
      const res = await fetch(`/api/portal/${clientId}/team`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_permissions',
          memberId: permissionTarget.id,
          allowed_modules: editAllowedModules,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === permissionTarget.id
              ? { ...m, allowed_modules: editAllowedModules }
              : m
          )
        );
        setPermissionSuccess('Member permissions updated successfully.');
        setTimeout(() => {
          setPermissionTarget(null);
          setPermissionSuccess('');
        }, 700);
      } else {
        setPermissionError(data.error || 'Failed to update member permissions.');
      }
    } catch {
      setPermissionError('Network connection error.');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const handleToggleMemberBan = async () => {
    if (!banTarget) return;
    const isCurrentlySuspended = banTarget.status === 'suspended';
    const action = isCurrentlySuspended ? 'unsuspend' : 'suspend';

    if (action === 'suspend' && !banReason.trim()) {
      setBanError('Please enter a reason for disabling access before confirming.');
      return;
    }

    setIsBanning(true);
    setBanError('');

    try {
      const res = await fetch(`/api/portal/${clientId}/team`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          memberId: banTarget.id,
          reason: banReason || 'Access revoked by team administrator.',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.id === banTarget.id ? { ...m, ...data.user } : m))
        );
        setBanTarget(null);
        setBanReason('');
      } else {
        setBanError(data.error || 'Failed to update member status.');
      }
    } catch {
      setBanError('Network connection error.');
    } finally {
      setIsBanning(false);
    }
  };

  const handleConfirmResend = async () => {
    if (!resendTarget) return;
    setIsResending(true);
    setResendError('');
    setResentLink('');

    try {
      const res = await fetch(`/api/portal/${clientId}/team`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId: resendTarget.id }),
      });

      const data = await res.json();
      if (res.ok) {
        let link = data.magicLinkUrl || '';
        if (typeof window !== 'undefined' && link) {
          try {
            if (link.startsWith('/')) {
              link = `${window.location.origin}${link}`;
            } else {
              const parsed = new URL(link);
              if (parsed.origin !== window.location.origin) {
                link = `${window.location.origin}${parsed.pathname}${parsed.search}`;
              }
            }
          } catch {}
        }
        setResentLink(link);
        // Replace the old invitation with the new refreshed one in state
        if (data.invitation) {
          setInvitations((prev) => [
            data.invitation,
            ...prev.filter((i) => i.id !== resendTarget.id),
          ]);
        }
      } else {
        setResendError(data.error || 'Failed to resend invitation.');
      }
    } catch {
      setResendError('Network error while resending invitation.');
    } finally {
      setIsResending(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    setRevokeError('');

    try {
      const res = await fetch(
        `/api/portal/${clientId}/team?invitationId=${encodeURIComponent(revokeTarget.id)}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== revokeTarget.id));
        setRevokeTarget(null);
      } else {
        const data = await res.json();
        setRevokeError(data.error || 'Failed to revoke invitation.');
      }
    } catch {
      setRevokeError('Network error while revoking invitation.');
    } finally {
      setIsRevoking(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadTeam() {
      try {
        const res = await fetch(`/api/portal/${clientId}/team`);
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data?.suspended) {
            window.location.href = `/auth/suspended?reason=${encodeURIComponent(data.reason || 'Your account access has been suspended.')}`;
            return;
          }
        }
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            const memberList: Member[] = data.members || [];
            if (data.members) setMembers(memberList);
            if (data.featureToggles) setTenantFeatureToggles(data.featureToggles);
            if (data.invitations) {
              const activeEmails = new Set(memberList.map((m) => m.email.toLowerCase()));
              const filtered = (data.invitations as Invitation[]).filter(
                (inv) => !activeEmails.has(inv.email.toLowerCase())
              );
              setInvitations(filtered);
            }
          }
        }
      } catch {
        // Fallback remains active
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadTeam();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const activeMembers: Member[] = members;

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
          allowed_modules: selectedInviteModules,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        let link = data.magicLinkUrl || '';
        if (typeof window !== 'undefined' && link) {
          try {
            if (link.startsWith('/')) {
              link = `${window.location.origin}${link}`;
            } else {
              const parsed = new URL(link);
              if (parsed.origin !== window.location.origin) {
                link = `${window.location.origin}${parsed.pathname}${parsed.search}`;
              }
            }
          } catch {}
        }
        setGeneratedLink(link);
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
        <Button variant="primary" onClick={handleOpenInviteModal}>
          Invite Team Member
        </Button>
      </div>

      {/* Active Team Members List */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Active Team Members"
          subtitle={isLoading ? 'Loading team roster...' : `${activeMembers.length} authorized staff members`}
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
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <>
                  {[1, 2, 3].map((idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <Skeleton width="130px" height="18px" />
                      </td>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <Skeleton width="180px" height="16px" />
                      </td>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <Skeleton width="120px" height="16px" />
                      </td>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <Skeleton width="140px" height="16px" />
                      </td>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <Skeleton width="85px" height="14px" />
                      </td>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <Skeleton width="65px" height="24px" borderRadius="var(--radius-full)" />
                      </td>
                      <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                        <Skeleton width="80px" height="30px" borderRadius="var(--radius-sm)" />
                      </td>
                    </tr>
                  ))}
                </>
              ) : (
                activeMembers.map((member) => {
                  const isSuspended = member.status === 'suspended';
                  const isPrimaryOwner = member.role === 'client';

                  return (
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
                        {isSuspended ? (
                          <StatusBadge status="Disabled" variant="suspended" />
                        ) : (
                          <StatusBadge status="Active" variant="done" />
                        )}
                      </td>
                      <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                        {!isPrimaryOwner && (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenPermissions(member)}
                            >
                              Permissions
                            </Button>
                            <Button
                              variant={isSuspended ? 'secondary' : 'danger'}
                              size="sm"
                              onClick={() => {
                                setBanTarget(member);
                                setBanReason('');
                                setBanError('');
                              }}
                            >
                              {isSuspended ? 'Reactivate' : 'Disable Access'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pending Invitations */}
      {isLoading ? (
        <Card>
          <CardHeader
            title="Pending Invitations"
            subtitle="Invitations valid for 72 hours until accepted"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[1, 2].map((idx) => (
              <div
                key={idx}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <Skeleton width="220px" height="18px" />
                  <Skeleton width="340px" height="14px" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Skeleton width="130px" height="24px" borderRadius="var(--radius-full)" />
                  <Skeleton width="65px" height="30px" borderRadius="var(--radius-sm)" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : invitations.length > 0 ? (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <StatusBadge status="Pending Acceptance" variant="progress" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setResendTarget(inv);
                      setResendError('');
                      setResentLink('');
                    }}
                  >
                    Resend Link
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setRevokeTarget(inv);
                      setRevokeError('');
                    }}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

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

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' }}>
                  Module & Feature Access
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary-text)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    onClick={() => {
                      const allActive = PORTAL_MODULES
                        .filter((m) => tenantFeatureToggles[m.key] !== false)
                        .map((m) => m.key);
                      setSelectedInviteModules(allActive);
                    }}
                  >
                    Select All
                  </button>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>|</span>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    onClick={() => setSelectedInviteModules([])}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="permission-grid" style={{ maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                {PORTAL_MODULES.filter((module) => tenantFeatureToggles[module.key] !== false).map((module) => {
                  const isChecked = selectedInviteModules.includes(module.key);

                  return (
                    <div
                      key={module.key}
                      className={`permission-card ${isChecked ? 'is-checked' : ''}`.trim()}
                      onClick={() => {
                        setSelectedInviteModules((prev) =>
                          prev.includes(module.key)
                            ? prev.filter((k) => k !== module.key)
                            : [...prev, module.key]
                        );
                      }}
                      style={{ padding: '8px 10px', gap: '8px' }}
                    >
                      <div className="permission-checkbox" style={{ width: '16px', height: '16px', marginTop: '1px' }}>
                        {isChecked && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div className="permission-label-wrap">
                        <div className="permission-label-row">
                          <span className="permission-title" style={{ fontSize: '12px' }}>{module.label}</span>
                        </div>
                        <span className="permission-desc" style={{ fontSize: '10px' }}>{module.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

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

      {/* Revoke Invitation Confirmation Modal */}
      <Modal
        isOpen={Boolean(revokeTarget)}
        onClose={() => {
          if (!isRevoking) {
            setRevokeTarget(null);
            setRevokeError('');
          }
        }}
        title="Revoke Invitation"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => {
                setRevokeTarget(null);
                setRevokeError('');
              }}
              disabled={isRevoking}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmRevoke}
              disabled={isRevoking}
            >
              {isRevoking ? 'Revoking...' : 'Yes, Revoke Invitation'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {revokeError && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-danger, #ef4444)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {revokeError}
            </div>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Are you sure you want to revoke and delete the pending invitation for <strong style={{ color: 'var(--color-text-primary)' }}>{revokeTarget?.email}</strong>?
          </p>
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              lineHeight: 1.5,
            }}
          >
            ⚠️ Once revoked, the invitation link will immediately become invalid. The recipient will not be able to complete account setup or set a password with it.
          </div>
        </div>
      </Modal>

      {/* Resend Invitation Confirmation & Result Modal */}
      <Modal
        isOpen={Boolean(resendTarget)}
        onClose={() => {
          if (!isResending) {
            setResendTarget(null);
            setResendError('');
            setResentLink('');
          }
        }}
        title={resentLink ? 'New Invitation Link Generated' : 'Resend Magic-Link Invitation'}
        footer={
          resentLink ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                variant="outline"
                onClick={() => {
                  setResendTarget(null);
                  setResendError('');
                  setResentLink('');
                }}
              >
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => copyToClipboard(resentLink)}
              >
                Copy Link
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                variant="outline"
                onClick={() => {
                  setResendTarget(null);
                  setResendError('');
                  setResentLink('');
                }}
                disabled={isResending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmResend}
                disabled={isResending}
              >
                {isResending ? 'Regenerating...' : 'Regenerate & Resend Link'}
              </Button>
            </div>
          )
        }
      >
        {resentLink ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-status-done-bg)',
                color: 'var(--color-status-done-text)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              The previous invitation was revoked, and a fresh 72-hour magic link has been created for <strong>{resendTarget?.email}</strong>:
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
              }}
            >
              {resentLink}
            </div>
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Share this updated link with your team member. The old link will no longer work.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {resendError && (
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--color-danger, #ef4444)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-sm)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                {resendError}
              </div>
            )}
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Are you sure you want to resend the invitation to <strong style={{ color: 'var(--color-text-primary)' }}>{resendTarget?.email}</strong>?
            </p>
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              ℹ️ Resending will automatically <strong>revoke the old link</strong> immediately so it cannot be used, and generate a brand-new token with a fresh 72-hour expiration window.
            </div>
          </div>
        )}
      </Modal>

      {/* Member Suspension / Disable Modal */}
      <Modal
        isOpen={Boolean(banTarget)}
        onClose={() => {
          if (!isBanning) {
            setBanTarget(null);
            setBanReason('');
            setBanError('');
          }
        }}
        title={banTarget?.status === 'suspended' ? 'Reactivate Team Member' : 'Disable Member Access'}
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => {
                setBanTarget(null);
                setBanReason('');
                setBanError('');
              }}
              disabled={isBanning}
            >
              Cancel
            </Button>
            <Button
              variant={banTarget?.status === 'suspended' ? 'primary' : 'danger'}
              onClick={handleToggleMemberBan}
              disabled={isBanning || (banTarget?.status !== 'suspended' && !banReason.trim())}
            >
              {isBanning
                ? 'Processing...'
                : banTarget?.status === 'suspended'
                ? 'Confirm Reactivation'
                : 'Confirm Disable Access'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {banError && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-danger, #ef4444)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {banError}
            </div>
          )}

          {banTarget?.status === 'suspended' ? (
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Are you sure you want to reactivate access for <strong>{banTarget?.full_name}</strong> ({banTarget?.email})? They will immediately regain portal access.
            </p>
          ) : (
            <>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Are you sure you want to disable access for <strong>{banTarget?.full_name}</strong> ({banTarget?.email})?
              </p>
              <Input
                label="Reason for Disabling Access"
                placeholder="e.g. Employee departed from business, role change"
                value={banReason}
                onChange={(e) => {
                  setBanReason(e.target.value);
                  if (banError) setBanError('');
                }}
                required
                helperText="This reason will be displayed to the user and recorded in the audit log."
              />
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  lineHeight: 1.5,
                }}
              >
                The member will be immediately logged out on their next request and redirected to the access restriction page.
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Edit Member Permissions Modal */}
      <Modal
        isOpen={Boolean(permissionTarget)}
        onClose={() => {
          if (!isSavingPermissions) {
            setPermissionTarget(null);
            setPermissionError('');
            setPermissionSuccess('');
          }
        }}
        title={`Member Permissions: ${permissionTarget?.full_name || permissionTarget?.email || ''}`}
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              onClick={() => {
                setPermissionTarget(null);
                setPermissionError('');
                setPermissionSuccess('');
              }}
              disabled={isSavingPermissions}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSavePermissions}
              disabled={isSavingPermissions}
            >
              {isSavingPermissions ? 'Saving Permissions...' : 'Save Permissions'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {permissionError && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-danger, #ef4444)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {permissionError}
            </div>
          )}

          {permissionSuccess && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--color-status-done-bg)',
                color: 'var(--color-status-done-text)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              {permissionSuccess}
            </div>
          )}

          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
              Configure accessible sections for <strong style={{ color: 'var(--color-text-primary)' }}>{permissionTarget?.email}</strong>. Modules toggled off will be hidden from their portal navigation and blocked.
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <button
                type="button"
                className="ui-btn-action-portal"
                style={{ fontSize: '12px', padding: '4px 10px' }}
                onClick={() => {
                  const allActive = PORTAL_MODULES
                    .filter((m) => tenantFeatureToggles[m.key] !== false)
                    .map((m) => m.key);
                  setEditAllowedModules(allActive);
                }}
              >
                Select All
              </button>
              <button
                type="button"
                className="ui-btn-action-portal"
                style={{ fontSize: '12px', padding: '4px 10px' }}
                onClick={() => setEditAllowedModules([])}
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="permission-grid">
            {PORTAL_MODULES.filter((module) => tenantFeatureToggles[module.key] !== false).map((module) => {
              const isChecked = editAllowedModules.includes(module.key);

              return (
                <div
                  key={module.key}
                  className={`permission-card ${isChecked ? 'is-checked' : ''}`.trim()}
                  onClick={() => {
                    setEditAllowedModules((prev) =>
                      prev.includes(module.key)
                        ? prev.filter((k) => k !== module.key)
                        : [...prev, module.key]
                    );
                  }}
                >
                  <div className="permission-checkbox">
                    {isChecked && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <div className="permission-label-wrap">
                    <div className="permission-label-row">
                      <span className="permission-title">{module.label}</span>
                    </div>
                    <span className="permission-desc">{module.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
