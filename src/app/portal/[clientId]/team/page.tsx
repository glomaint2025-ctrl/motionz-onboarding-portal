'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Input, Modal, Skeleton } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { MEMBER_SELECTABLE_MODULES, type PortalModule } from '@/lib/portal-modules';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { suspendedPageUrl } from '@/components/portal/suspended';

interface Member {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  status?: 'active' | 'suspended';
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

interface Viewer {
  email: string;
  role: string;
  userId?: string;
}

/** What an invite or resend produced: the link, and whether the email actually went out. */
interface InviteResult {
  email: string;
  link: string;
  emailDelivered: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  client: 'Account owner',
  client_member: 'Team member',
};
const roleLabel = (role: string) => ROLE_LABELS[role] || 'Team member';

const errorBoxStyle: React.CSSProperties = {
  padding: 'var(--space-3)',
  backgroundColor: 'var(--color-status-blocked-bg)',
  color: 'var(--color-status-blocked-text)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
};
const successBoxStyle: React.CSSProperties = {
  padding: 'var(--space-3)',
  backgroundColor: 'var(--color-status-done-bg)',
  color: 'var(--color-status-done-text)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
};
const noteBoxStyle: React.CSSProperties = {
  padding: 'var(--space-3)',
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
  lineHeight: 1.5,
};
const cellStyle: React.CSSProperties = { padding: 'var(--space-3)', verticalAlign: 'top' };
const NO_PAGES_MESSAGE = 'Choose at least one page this person can see.';

/**
 * The people list is a table on wide screens and stacked cards on phones, so nothing is cut off.
 * Email and phone sit under the name to keep the table narrow enough for a tablet.
 */
const TEAM_LAYOUT_CSS = `
.team-people-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); table-layout: auto; }
.team-contact { display: block; font-size: var(--font-size-xs); font-weight: var(--font-weight-normal, 400); color: var(--color-text-secondary); overflow-wrap: anywhere; line-height: 1.5; }
.team-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
.team-cell-label { display: none; }
@media (max-width: 640px) {
  .team-people-table thead { display: none; }
  .team-people-table, .team-people-table tbody { display: block; }
  .team-people-table tr {
    display: block;
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md);
    background-color: var(--color-bg-surface);
  }
  .team-people-table td { display: block; padding: 0 0 var(--space-2) 0 !important; text-align: left !important; }
  .team-people-table td:last-child { padding-bottom: 0 !important; }
  .team-people-table td:empty { display: none; }
  .team-cell-label { display: inline; color: var(--color-text-muted); font-size: var(--font-size-xs); margin-right: 6px; }
  .team-actions { justify-content: flex-start; padding-top: var(--space-1); }
}
`;
const headCellStyle: React.CSSProperties = { padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' };

/** Invite links always point at the site the owner is currently on. */
function toLocalLink(link: string): string {
  if (!link || typeof window === 'undefined') return link || '';
  try {
    if (link.startsWith('/')) return `${window.location.origin}${link}`;
    const parsed = new URL(link);
    return parsed.origin === window.location.origin ? link : `${window.location.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return link;
  }
}

/** Checklist of the sections a team member can be given. */
function ModulePicker({
  modules,
  selected,
  onChange,
}: {
  modules: PortalModule[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <button
          type="button"
          className="ui-btn-action-portal"
          style={{ fontSize: '12px', padding: '4px 10px' }}
          onClick={() => onChange(modules.map((m) => m.key))}
        >
          Select all
        </button>
        <button
          type="button"
          className="ui-btn-action-portal"
          style={{ fontSize: '12px', padding: '4px 10px' }}
          onClick={() => onChange([])}
        >
          Clear all
        </button>
      </div>
      <div className="permission-grid" style={{ maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
        {modules.map((module) => {
          const isChecked = selected.includes(module.key);
          return (
            <div
              key={module.key}
              role="checkbox"
              aria-checked={isChecked}
              tabIndex={0}
              className={`permission-card ${isChecked ? 'is-checked' : ''}`.trim()}
              onClick={() => toggle(module.key)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  toggle(module.key);
                }
              }}
            >
              <div className="permission-checkbox" aria-hidden="true">
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
  );
}

/** The outcome of an invite: says honestly whether the email went out, and offers the link to copy. */
function InviteResultPanel({ result }: { result: InviteResult }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.link);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {result.emailDelivered ? (
        <div role="status" style={{ ...successBoxStyle, display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <Icon name="check-circle" size={18} />
          <span>
            Invite emailed to <strong>{result.email}</strong>. You can also copy the link below and send it yourself.
          </span>
        </div>
      ) : (
        <div role="alert" style={{ ...errorBoxStyle, display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <Icon name="alert" size={18} />
          <span>
            The email to <strong>{result.email}</strong> could not be sent. Copy this link and send it to them yourself.
          </span>
        </div>
      )}
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
        {result.link}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Button variant="primary" size="sm" onClick={copy}>
          {copyState === 'copied' ? 'Copied' : 'Copy link'}
        </Button>
        <span role="status" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {copyState === 'failed'
            ? 'Could not copy automatically. Select the link above and copy it.'
            : 'The link works once and expires in 72 hours.'}
        </span>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [tenantFeatureToggles, setTenantFeatureToggles] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Invite
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const inviteErrorRef = useRef<HTMLDivElement>(null);
  const [inviteModules, setInviteModules] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  // Cancel invite
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  // Resend invite
  const [resendTarget, setResendTarget] = useState<Invitation | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendResult, setResendResult] = useState<InviteResult | null>(null);

  // Turn access off / on
  const [banTarget, setBanTarget] = useState<Member | null>(null);
  const [isBanning, setIsBanning] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banError, setBanError] = useState('');

  // Change what a member can see
  const [accessTarget, setAccessTarget] = useState<Member | null>(null);
  const [accessModules, setAccessModules] = useState<string[]>([]);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [accessError, setAccessError] = useState('');

  // Only the account owner (and Motionz staff) can invite people or change their access.
  const canManage = viewer?.role === 'client' || viewer?.role === 'admin' || viewer?.role === 'csm';
  const isSelf = (member: Member) =>
    Boolean(viewer) && (member.id === viewer!.userId || member.email.toLowerCase() === viewer!.email.toLowerCase());

  // Sections that are on for this client and can be given to a team member.
  const selectableModules = MEMBER_SELECTABLE_MODULES.filter((m) => tenantFeatureToggles[m.key] !== false);
  const selectableKeys = selectableModules.map((m) => m.key);

  useEffect(() => {
    let isMounted = true;
    async function loadTeam() {
      setIsLoading(true);
      setLoadError('');
      try {
        const res = await fetch(`/api/portal/${clientId}/team`);
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data?.suspended) {
          window.location.href = suspendedPageUrl(data);
          return;
        }
        if (!isMounted) return;
        if (!res.ok) {
          setLoadError(res.status === 403 ? 'You do not have access to the team list.' : 'Your team could not be loaded.');
          return;
        }
        const memberList: Member[] = data.members || [];
        setMembers(memberList);
        setViewer(data.viewer || null);
        setTenantFeatureToggles(data.featureToggles || {});
        const activeEmails = new Set(memberList.map((m) => m.email.toLowerCase()));
        setInvitations(((data.invitations || []) as Invitation[]).filter((inv) => !activeEmails.has(inv.email.toLowerCase())));
      } catch {
        if (isMounted) setLoadError('We could not reach the server. Check your connection and try again.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadTeam();
    return () => {
      isMounted = false;
    };
  }, [clientId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // The error shows right above the send button; bring it into view and announce it.
  useEffect(() => {
    if (!inviteError) return;
    inviteErrorRef.current?.scrollIntoView({ block: 'nearest' });
    inviteErrorRef.current?.focus({ preventScroll: true });
  }, [inviteError, isSubmitting]);

  /** Empties the invite form but keeps the dialog open, ready for the next person. */
  const clearInviteForm = () => {
    setInviteEmail('');
    setInvitePhone('');
    setInviteName('');
    setInviteModules(selectableKeys);
    setInviteError('');
    setInviteResult(null);
  };

  const openInvite = () => {
    clearInviteForm();
    setIsInviteOpen(true);
  };

  const closeInvite = () => {
    if (isSubmitting) return;
    setIsInviteOpen(false);
    setInviteResult(null);
    setInviteError('');
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !invitePhone.trim()) {
      setInviteError('Please enter both an email and a phone number.');
      return;
    }
    if (inviteModules.length === 0) {
      setInviteError(NO_PAGES_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    setInviteError('');
    try {
      const res = await fetch(`/api/portal/${clientId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          phone: invitePhone.trim(),
          fullName: inviteName.trim() || undefined,
          role: 'client_member',
          allowed_modules: inviteModules,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.invitation) {
        setInviteResult({
          email: data.invitation.email,
          link: toLocalLink(data.magicLinkUrl || ''),
          emailDelivered: Boolean(data.emailDelivered),
        });
        setInvitations((prev) => [data.invitation, ...prev]);
      } else {
        setInviteError(data.error || 'The invite could not be created. Please try again.');
      }
    } catch {
      setInviteError('We could not reach the server. The invite was not sent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeResend = () => {
    if (isResending) return;
    setResendTarget(null);
    setResendError('');
    setResendResult(null);
  };

  const handleConfirmResend = async () => {
    if (!resendTarget) return;
    setIsResending(true);
    setResendError('');
    try {
      const res = await fetch(`/api/portal/${clientId}/team`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId: resendTarget.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResendResult({
          email: resendTarget.email,
          link: toLocalLink(data.magicLinkUrl || ''),
          emailDelivered: Boolean(data.emailDelivered),
        });
        if (data.invitation) {
          setInvitations((prev) => [data.invitation, ...prev.filter((i) => i.id !== resendTarget.id)]);
        }
      } else {
        setResendError(data.error || 'The invite could not be sent again. Please try again.');
      }
    } catch {
      setResendError('We could not reach the server. The invite was not sent again.');
    } finally {
      setIsResending(false);
    }
  };

  const closeRevoke = () => {
    if (isRevoking) return;
    setRevokeTarget(null);
    setRevokeError('');
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    setRevokeError('');
    try {
      const res = await fetch(`/api/portal/${clientId}/team?invitationId=${encodeURIComponent(revokeTarget.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== revokeTarget.id));
        setRevokeTarget(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setRevokeError(data.error || 'The invite could not be cancelled. Please try again.');
      }
    } catch {
      setRevokeError('We could not reach the server. The invite was not cancelled.');
    } finally {
      setIsRevoking(false);
    }
  };

  const closeBan = () => {
    if (isBanning) return;
    setBanTarget(null);
    setBanReason('');
    setBanError('');
  };

  const handleToggleAccess = async () => {
    if (!banTarget) return;
    const action = banTarget.status === 'suspended' ? 'unsuspend' : 'suspend';
    setIsBanning(true);
    setBanError('');
    try {
      const res = await fetch(`/api/portal/${clientId}/team`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, memberId: banTarget.id, reason: banReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMembers((prev) => prev.map((m) => (m.id === banTarget.id ? { ...m, ...(data.user || {}) } : m)));
        setBanTarget(null);
        setBanReason('');
      } else {
        setBanError(data.error || 'The change could not be saved. Please try again.');
      }
    } catch {
      setBanError('We could not reach the server. Nothing was changed.');
    } finally {
      setIsBanning(false);
    }
  };

  const openAccess = (member: Member) => {
    setAccessTarget(member);
    setAccessError('');
    setAccessModules(
      Array.isArray(member.allowed_modules)
        ? member.allowed_modules.filter((k) => selectableKeys.includes(k))
        : selectableKeys
    );
  };

  const closeAccess = () => {
    if (isSavingAccess) return;
    setAccessTarget(null);
    setAccessError('');
  };

  const handleSaveAccess = async () => {
    if (!accessTarget) return;
    if (accessModules.length === 0) {
      setAccessError(NO_PAGES_MESSAGE);
      return;
    }
    setIsSavingAccess(true);
    setAccessError('');
    try {
      const res = await fetch(`/api/portal/${clientId}/team`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_permissions', memberId: accessTarget.id, allowed_modules: accessModules }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const saved: string[] = Array.isArray(data.user?.allowed_modules) ? data.user.allowed_modules : accessModules;
        setMembers((prev) => prev.map((m) => (m.id === accessTarget.id ? { ...m, allowed_modules: saved } : m)));
        setAccessTarget(null);
      } else {
        setAccessError(data.error || 'The change could not be saved. Please try again.');
      }
    } catch {
      setAccessError('We could not reach the server. Nothing was changed.');
    } finally {
      setIsSavingAccess(false);
    }
  };

  const isBanTargetOff = banTarget?.status === 'suspended';

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
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Team</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {canManage
              ? 'Invite the people you work with and choose what each of them can see.'
              : 'The people who can sign in to this portal. Only the account owner can make changes.'}
          </p>
        </div>
        {canManage && !isLoading && !loadError && (
          <Button variant="primary" onClick={openInvite}>
            Invite someone
          </Button>
        )}
      </div>

      {loadError ? (
        <Card>
          <p role="alert" style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-status-danger-text)' }}>
            {loadError}
          </p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
        </Card>
      ) : (
        <>
          {/* People */}
          <Card style={{ marginBottom: 'var(--space-6)' }}>
            <CardHeader
              title="People"
              subtitle={isLoading ? undefined : `${members.length} ${members.length === 1 ? 'person' : 'people'}`}
            />
            <style>{TEAM_LAYOUT_CSS}</style>
            <div>
              <table className="team-people-table">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left' }}>
                    <th style={headCellStyle}>Name</th>
                    <th style={headCellStyle}>Role</th>
                    <th style={headCellStyle}>Added</th>
                    <th style={headCellStyle}>Status</th>
                    {canManage && <th style={{ ...headCellStyle, textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    [1, 2, 3].map((idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        {[180, 110, 85, 65].map((w) => (
                          <td key={w} style={cellStyle}>
                            <Skeleton width={`${w}px`} height="16px" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : members.length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 5 : 4} style={{ ...cellStyle, color: 'var(--color-text-secondary)' }}>
                        No one has been added yet.
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => {
                      const isOff = member.status === 'suspended';
                      // The owner's own access, and your own, cannot be changed from here.
                      const showActions = canManage && member.role !== 'client' && !isSelf(member);

                      return (
                        <tr key={member.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                          <td style={{ ...cellStyle, fontWeight: 'var(--font-weight-medium)' }}>
                            {member.full_name}
                            {isSelf(member) ? ' (you)' : ''}
                            <span className="team-contact">{member.email}</span>
                            {member.phone && <span className="team-contact">{member.phone}</span>}
                          </td>
                          <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{roleLabel(member.role)}</td>
                          <td style={{ ...cellStyle, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', whiteSpace: 'nowrap' }}>
                            <span className="team-cell-label">Added</span>
                            {formatDate(member.created_at)}
                          </td>
                          <td style={cellStyle}>
                            {isOff ? (
                              <StatusBadge status="Access off" variant="suspended" />
                            ) : (
                              <StatusBadge status="Active" variant="done" />
                            )}
                          </td>
                          {canManage && (
                            <td style={{ ...cellStyle, textAlign: 'right' }}>
                              {showActions && (
                                <div className="team-actions">
                                  <Button variant="secondary" size="sm" onClick={() => openAccess(member)}>
                                    Change access
                                  </Button>
                                  <Button
                                    variant={isOff ? 'secondary' : 'danger'}
                                    size="sm"
                                    onClick={() => {
                                      setBanTarget(member);
                                      setBanReason('');
                                      setBanError('');
                                    }}
                                  >
                                    {isOff ? 'Turn access on' : 'Turn access off'}
                                  </Button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pending invites (owner and staff only) */}
          {canManage && !isLoading && invitations.length > 0 && (
            <Card>
              <CardHeader title="Pending invites" subtitle="Each invite link works once and expires after 72 hours." />
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
                        {roleLabel(inv.role)}
                        {inv.phone ? ` · ${inv.phone}` : ''} {'·'} Expires {formatDateTime(inv.expires_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <StatusBadge status="Waiting for them to accept" variant="progress" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResendTarget(inv);
                          setResendError('');
                          setResendResult(null);
                        }}
                      >
                        Send again
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setRevokeTarget(inv);
                          setRevokeError('');
                        }}
                      >
                        Cancel invite
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Invite someone */}
      <Modal isOpen={isInviteOpen} onClose={closeInvite} title="Invite someone" dismissOnOverlay={false}>
        {inviteResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <InviteResultPanel result={inviteResult} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button variant="outline" onClick={clearInviteForm}>
                Invite another
              </Button>
              <Button variant="secondary" onClick={closeInvite}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInviteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              label="Their name (optional)"
              placeholder="First and last name"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              maxLength={100}
              autoComplete="off"
            />

            <Input
              label="Their email"
              type="email"
              placeholder="name@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              maxLength={254}
              autoComplete="off"
              required
            />

            <Input
              label="Their phone number"
              type="tel"
              placeholder="+1 555 234 5678"
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value)}
              maxLength={30}
              autoComplete="off"
              required
            />

            <div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-2)' }}>
                What they can see
              </div>
              <ModulePicker modules={selectableModules} selected={inviteModules} onChange={setInviteModules} />
              {inviteModules.length === 0 && (
                <p role="status" style={{ margin: 'var(--space-2) 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-danger-text)' }}>
                  {NO_PAGES_MESSAGE}
                </p>
              )}
            </div>

            {inviteError && (
              <div ref={inviteErrorRef} tabIndex={-1} role="alert" style={errorBoxStyle}>
                {inviteError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button variant="outline" type="button" onClick={closeInvite} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmitting || !inviteEmail.trim() || !invitePhone.trim() || inviteModules.length === 0}>
                {isSubmitting ? 'Sending...' : 'Send invite'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Cancel an invite */}
      <Modal
        isOpen={Boolean(revokeTarget)}
        onClose={closeRevoke}
        title="Cancel this invite?"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="outline" onClick={closeRevoke} disabled={isRevoking}>
              Keep invite
            </Button>
            <Button variant="danger" onClick={handleConfirmRevoke} disabled={isRevoking}>
              {isRevoking ? 'Cancelling...' : 'Cancel invite'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {revokeError && (
            <div role="alert" style={errorBoxStyle}>
              {revokeError}
            </div>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            The invite for <strong style={{ color: 'var(--color-text-primary)' }}>{revokeTarget?.email}</strong> will be
            cancelled.
          </p>
          <div style={noteBoxStyle}>
            The link they were sent stops working straight away. You can invite them again later.
          </div>
        </div>
      </Modal>

      {/* Send an invite again */}
      <Modal
        isOpen={Boolean(resendTarget)}
        onClose={closeResend}
        title={resendResult ? 'New invite link' : 'Send this invite again?'}
        dismissOnOverlay={!resendResult}
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            {resendResult ? (
              <Button variant="secondary" onClick={closeResend}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeResend} disabled={isResending}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleConfirmResend} disabled={isResending}>
                  {isResending ? 'Sending...' : 'Send again'}
                </Button>
              </>
            )}
          </div>
        }
      >
        {resendResult ? (
          <InviteResultPanel result={resendResult} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {resendError && (
              <div role="alert" style={errorBoxStyle}>
                {resendError}
              </div>
            )}
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              We will email a new invite link to{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>{resendTarget?.email}</strong>.
            </p>
            <div style={noteBoxStyle}>
              The old link stops working, and the new one is good for 72 hours.
            </div>
          </div>
        )}
      </Modal>

      {/* Turn access off / on */}
      <Modal
        isOpen={Boolean(banTarget)}
        onClose={closeBan}
        title={isBanTargetOff ? 'Turn access back on?' : 'Turn access off?'}
        dismissOnOverlay={false}
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="outline" onClick={closeBan} disabled={isBanning}>
              Cancel
            </Button>
            <Button variant={isBanTargetOff ? 'primary' : 'danger'} onClick={handleToggleAccess} disabled={isBanning}>
              {isBanning ? 'Saving...' : isBanTargetOff ? 'Turn access on' : 'Turn access off'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {banError && (
            <div role="alert" style={errorBoxStyle}>
              {banError}
            </div>
          )}

          {isBanTargetOff ? (
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              <strong>{banTarget?.full_name}</strong> ({banTarget?.email}) will be able to sign in again straight away.
            </p>
          ) : (
            <>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                <strong>{banTarget?.full_name}</strong> ({banTarget?.email}) will no longer be able to use this portal.
              </p>
              <Input
                label="Reason (optional)"
                placeholder="For example: no longer works here"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                maxLength={500}
                helperText="Saved in your account history. They will not see it."
              />
              <div style={noteBoxStyle}>
                They are signed out the next time they open a page. You can turn their access back on at any time.
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Change what a member can see */}
      <Modal
        isOpen={Boolean(accessTarget)}
        onClose={closeAccess}
        title={`What ${accessTarget?.full_name || accessTarget?.email || 'they'} can see`}
        dismissOnOverlay={false}
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={closeAccess} disabled={isSavingAccess}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveAccess} disabled={isSavingAccess || accessModules.length === 0}>
              {isSavingAccess ? 'Saving...' : 'Save'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {accessError && (
            <div role="alert" style={errorBoxStyle}>
              {accessError}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Tick the sections <strong style={{ color: 'var(--color-text-primary)' }}>{accessTarget?.email}</strong> should
            see. Anything left unticked is hidden from them.
          </p>
          <ModulePicker modules={selectableModules} selected={accessModules} onChange={setAccessModules} />
          {accessModules.length === 0 && (
            <p role="status" style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-status-danger-text)' }}>
              {NO_PAGES_MESSAGE}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
