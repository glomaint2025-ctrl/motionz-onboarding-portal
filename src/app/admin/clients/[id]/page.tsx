'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Input, Select, Button, StatusBadge, Modal, Skeleton, buttonClasses } from '@/components/ui';
import { Icon } from '@/components/brand';
import { PORTAL_MODULES } from '@/lib/portal-modules';
import { OnboardingAnswers, OnboardingSubmissionView } from '@/components/onboarding/OnboardingAnswers';
import { ClientRecords } from '@/components/admin/ClientRecords';
import { Notice, clientStatusLabel, copyText, useRevealOnMessage } from '@/components/admin/Notice';
import { MemberModulePicker, memberSelectableModules } from '@/components/admin/MemberModulePicker';
import { formatDateTime } from '@/lib/utils/format';
import { roleLabel } from '@/lib/utils/log-labels';

const modalFooterStyle: React.CSSProperties = { display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' };
const linkBoxStyle: React.CSSProperties = {
  padding: 'var(--space-3)',
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'monospace',
  fontSize: 'var(--font-size-xs)',
  wordBreak: 'break-all',
  userSelect: 'all',
};

/** Invite links are shown on the address the admin is using, so they can be copied straight from the page. */
function toLocalLink(link: string): string {
  if (!link || typeof window === 'undefined') return link || '';
  try {
    if (link.startsWith('/')) return `${window.location.origin}${link}`;
    const parsed = new URL(link);
    return parsed.origin !== window.location.origin ? `${window.location.origin}${parsed.pathname}${parsed.search}` : link;
  } catch {
    return link;
  }
}


export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tenant, setTenant] = useState<any | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [invitations, setInvitations] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('active');
  const [trackingSheetUrl, setTrackingSheetUrl] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [submissions, setSubmissions] = useState<OnboardingSubmissionView[]>([]);
  const [csmUserId, setCsmUserId] = useState('');
  const [availableCsms, setAvailableCsms] = useState<{ id: string; name?: string; email: string }[]>([]);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Which input the server rejected (name, phone or CSM), if it said.
  const [saveFieldError, setSaveFieldError] = useState<{ field: string; message: string } | null>(null);
  const saveErrorRef = useRevealOnMessage(saveError);
  const saveErrorFor = (field: string) => (saveFieldError?.field === field ? saveFieldError.message : undefined);
  const clearSaveFieldError = (field: string) => setSaveFieldError((prev) => (prev?.field === field ? null : prev));
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isUnarchiveModalOpen, setIsUnarchiveModalOpen] = useState(false);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [unarchiveError, setUnarchiveError] = useState('');

  // Tenant ban / unban modal states
  const [isBanTenantModalOpen, setIsBanTenantModalOpen] = useState(false);
  const [banTenantReason, setBanTenantReason] = useState('');
  const [isBanningTenant, setIsBanningTenant] = useState(false);
  const [banTenantError, setBanTenantError] = useState('');

  const [isUnbanTenantModalOpen, setIsUnbanTenantModalOpen] = useState(false);
  const [isUnbanningTenant, setIsUnbanningTenant] = useState(false);
  const [unbanTenantError, setUnbanTenantError] = useState('');

  // Member suspend / unsuspend modal states
  const [suspendMemberTarget, setSuspendMemberTarget] = useState<any | null>(null);
  const [suspendMemberReason, setSuspendMemberReason] = useState('');
  const [isSuspendingMember, setIsSuspendingMember] = useState(false);
  const [suspendMemberError, setSuspendMemberError] = useState('');

  const [unsuspendMemberTarget, setUnsuspendMemberTarget] = useState<any | null>(null);
  const [isUnsuspendingMember, setIsUnsuspendingMember] = useState(false);
  const [unsuspendMemberError, setUnsuspendMemberError] = useState('');

  // Resend and Revoke state
  const [resendTarget, setResendTarget] = useState<any | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resentLink, setResentLink] = useState('');

  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  // Invite modal state
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateEmail, setGenerateEmail] = useState('');
  const [generateRole, setGenerateRole] = useState<'client' | 'client_member'>('client');
  const [selectedInviteModules, setSelectedInviteModules] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [inviteEmailDelivered, setInviteEmailDelivered] = useState(false);

  // Member permissions state
  const [permissionTarget, setPermissionTarget] = useState<any | null>(null);
  const [editAllowedModules, setEditAllowedModules] = useState<string[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [permissionSuccess, setPermissionSuccess] = useState('');

  const handleOpenInviteModal = () => {
    // The first invitation goes to the account owner; after that, invitations default to team members.
    const hasOwner = members.some((m) => m.role === 'client');
    setGenerateEmail(hasOwner ? '' : tenant?.primary_email || '');
    setGenerateRole(hasOwner ? 'client_member' : 'client');
    setGenerateError('');
    setGeneratedLink('');
    setInviteEmailDelivered(false);
    setCopyState('idle');
    setSelectedInviteModules(memberSelectableModules(features).map((m) => m.key));
    setIsGenerateModalOpen(true);
  };

  const closeInviteModal = () => {
    if (isGenerating) return;
    setIsGenerateModalOpen(false);
    setGenerateError('');
    setGeneratedLink('');
    setCopyState('idle');
  };

  const closeResendModal = () => {
    if (isResending) return;
    setResendTarget(null);
    setResendError('');
    setResentLink('');
    setCopyState('idle');
  };

  const closePermissionsModal = () => {
    if (isSavingPermissions) return;
    setPermissionTarget(null);
    setPermissionError('');
    setPermissionSuccess('');
  };

  const handleCopy = async (text: string) => {
    const ok = await copyText(text);
    setCopyState(ok ? 'copied' : 'failed');
    if (ok) setTimeout(() => setCopyState('idle'), 2500);
  };

  const handleOpenPermissions = (member: any) => {
    setPermissionTarget(member);
    setPermissionError('');
    setPermissionSuccess('');
    const selectable = memberSelectableModules(features).map((m) => m.key);
    setEditAllowedModules(
      Array.isArray(member.allowed_modules) ? member.allowed_modules.filter((k: string) => selectable.includes(k)) : selectable
    );
  };

  const handleSavePermissions = async () => {
    if (!permissionTarget) return;
    setIsSavingPermissions(true);
    setPermissionError('');
    setPermissionSuccess('');

    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_member_permissions',
          memberId: permissionTarget.id,
          allowed_modules: editAllowedModules,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMembers((prev: any[]) =>
          prev.map((m: any) =>
            m.id === permissionTarget.id
              ? { ...m, allowed_modules: editAllowedModules }
              : m
          )
        );
        setPermissionSuccess('Permissions saved.');
        setTimeout(() => {
          setPermissionTarget(null);
          setPermissionSuccess('');
        }, 700);
      } else {
        setPermissionError(data.error || 'Could not save the permissions. Please try again.');
      }
    } catch {
      setPermissionError('Could not reach the server. Nothing was changed.');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const handleCreateSheet = async () => {
    setSheetBusy(true);
    setSheetError('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_sheet' }),
      });
      const data = await res.json();
      if (data.success && data.sheet?.url) setTrackingSheetUrl(data.sheet.url);
      else setSheetError(data.error || 'Could not create the tracking sheet.');
    } catch {
      setSheetError('Could not reach the server, so the sheet was not created.');
    } finally {
      setSheetBusy(false);
    }
  };

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await fetch(`/api/admin/clients/${clientId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTenant(data.tenant);
        // Keep only real portal sections; a legacy switch such as "orders" is never shown or saved.
        setFeatures(
          Object.fromEntries(
            Object.entries(data.features || {}).filter(([key]) => PORTAL_MODULES.some((m) => m.key === key))
          ) as Record<string, boolean>
        );
        setInvitations(data.invitations || []);
        setMembers(data.members || []);
        setTrackingSheetUrl(data.trackingSheetUrl || null);
        setSubmissions(data.onboardingSubmissions || []);
        setCompanyName(data.tenant.name || '');
        setPhone(data.tenant.phone || '');
        setStatus(data.tenant.status === 'active' ? 'active' : 'onboarding');
        setCsmUserId(data.csm?.id || '');
        setAvailableCsms(data.availableCsms || []);
      } else if (res.status === 404) {
        setTenant(null);
      } else {
        setLoadError(data.error || 'Could not load this client.');
      }
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) fetchClientDetails();
  }, [clientId]);

  const toggleFeature = (key: string) => {
    // A section with no saved switch counts as on, so the first click turns it off.
    setFeatures((prev) => ({ ...prev, [key]: prev[key] === false }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setSaveError('');
    setSaveFieldError(null);
    setSaveSuccess(false);
    const editableStatus = tenant && !tenant.deleted_at && (tenant.status === 'active' || tenant.status === 'onboarding');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          phone,
          // Suspended and archived clients keep their status; those have their own buttons.
          ...(editableStatus ? { status } : {}),
          csm_user_id: csmUserId,
          feature_toggles: Object.fromEntries(PORTAL_MODULES.map((m) => [m.key, features[m.key] !== false])),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (data.tenant) setTenant(data.tenant);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        const text = data.error || 'Your changes were not saved. Please try again.';
        setSaveError(text);
        if (typeof data.field === 'string') setSaveFieldError({ field: data.field, message: text });
      }
    } catch {
      setSaveError('Could not reach the server. Your changes were not saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    setArchiveError('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        router.push('/admin/clients');
      } else {
        setArchiveError(data.error || 'Could not archive this client. Please try again.');
        setIsArchiving(false);
      }
    } catch {
      setArchiveError('Could not reach the server. The client was not archived.');
      setIsArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    setIsUnarchiving(true);
    setUnarchiveError('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unarchive' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsUnarchiveModalOpen(false);
        fetchClientDetails();
      } else {
        setUnarchiveError(data.error || 'Could not unarchive this client. Please try again.');
      }
    } catch {
      setUnarchiveError('Could not reach the server. The client is still archived.');
    } finally {
      setIsUnarchiving(false);
    }
  };

  // Suspend the client (locks out the whole team)
  const handleConfirmBanTenant = async () => {
    setIsBanningTenant(true);
    setBanTenantError('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suspend_client',
          reason: banTenantReason,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsBanTenantModalOpen(false);
        fetchClientDetails();
      } else {
        setBanTenantError(data.error || 'Could not suspend this client. Please try again.');
      }
    } catch {
      setBanTenantError('Could not reach the server. The client was not suspended.');
    } finally {
      setIsBanningTenant(false);
    }
  };

  // Reactivate the client (unlocks team members locked out by the suspension)
  const handleConfirmUnbanTenant = async () => {
    setIsUnbanningTenant(true);
    setUnbanTenantError('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unsuspend_client' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsUnbanTenantModalOpen(false);
        fetchClientDetails();
      } else {
        setUnbanTenantError(data.error || 'Could not reactivate this client. Please try again.');
      }
    } catch {
      setUnbanTenantError('Could not reach the server. The client is still suspended.');
    } finally {
      setIsUnbanningTenant(false);
    }
  };

  // Suspend individual member
  const handleConfirmSuspendMember = async () => {
    if (!suspendMemberTarget) return;
    setIsSuspendingMember(true);
    setSuspendMemberError('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suspend_member',
          memberId: suspendMemberTarget.id,
          reason: suspendMemberReason,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuspendMemberTarget(null);
        fetchClientDetails();
      } else {
        setSuspendMemberError(data.error || 'Could not disable this person. Please try again.');
      }
    } catch {
      setSuspendMemberError('Could not reach the server. Nothing was changed.');
    } finally {
      setIsSuspendingMember(false);
    }
  };

  // Unsuspend individual member
  const handleConfirmUnsuspendMember = async () => {
    if (!unsuspendMemberTarget) return;
    setIsUnsuspendingMember(true);
    setUnsuspendMemberError('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unsuspend_member',
          memberId: unsuspendMemberTarget.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUnsuspendMemberTarget(null);
        fetchClientDetails();
      } else {
        setUnsuspendMemberError(data.error || 'Could not enable this person. Please try again.');
      }
    } catch {
      setUnsuspendMemberError('Could not reach the server. Nothing was changed.');
    } finally {
      setIsUnsuspendingMember(false);
    }
  };

  const handleConfirmResend = async () => {
    if (!resendTarget) return;
    setIsResending(true);
    setResendError('');
    setResentLink('');

    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', invitationId: resendTarget.id }),
      });

      const data = await res.json();
      if (res.ok) {
        const link = toLocalLink(data.magicLinkUrl || '');
        setResentLink(link);
        if (data.invitation) {
          setInvitations((prev) => [
            data.invitation,
            ...prev.filter((i) => i.id !== resendTarget.id),
          ]);
        }
      } else {
        setResendError(data.error || 'Could not send the invitation again. Please try again.');
      }
    } catch {
      setResendError('Could not reach the server. The invitation was not sent again.');
    } finally {
      setIsResending(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    setRevokeError('');

    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', invitationId: revokeTarget.id }),
      });

      const data = await res.json();
      if (res.ok) {
        setInvitations((prev) =>
          prev.map((i) =>
            i.id === revokeTarget.id
              ? { ...i, revoked_at: new Date().toISOString() }
              : i
          )
        );
        setRevokeTarget(null);
      } else {
        setRevokeError(data.error || 'Could not cancel the invitation. Please try again.');
      }
    } catch {
      setRevokeError('Could not reach the server. The invitation is still active.');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleGenerateMagicLink = async () => {
    const targetEmail = generateEmail.trim();
    if (!targetEmail) {
      setGenerateError('Enter the email address to invite.');
      return;
    }
    setIsGenerating(true);
    setGenerateError('');
    setGeneratedLink('');

    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_invitation',
          email: targetEmail,
          role: generateRole,
          allowed_modules: generateRole === 'client_member' ? selectedInviteModules : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const link = toLocalLink(data.magicLinkUrl || '');
        setGeneratedLink(link);
        setGenerateEmail(targetEmail);
        setInviteEmailDelivered(Boolean(data.emailDelivered));
        if (data.invitation) {
          setInvitations((prev) => [
            data.invitation,
            ...prev.filter((i) => i.id !== data.invitation.id),
          ]);
        }
      } else {
        setGenerateError(data.error || 'Could not create the invitation. Please try again.');
      }
    } catch {
      setGenerateError('Could not reach the server. No invitation was sent.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Header Skeleton */}
        <div>
          <Skeleton width="130px" height="14px" style={{ marginBottom: 'var(--space-3)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <Skeleton width="260px" height="32px" style={{ marginBottom: 'var(--space-2)' }} />
              <Skeleton width="380px" height="16px" />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Skeleton width="110px" height="36px" borderRadius="var(--radius-md)" />
              <Skeleton width="100px" height="36px" borderRadius="var(--radius-md)" />
            </div>
          </div>
        </div>

        {/* Company Info Card Skeleton */}
        <Card>
          <Skeleton width="180px" height="20px" style={{ marginBottom: 'var(--space-2)' }} />
          <Skeleton width="320px" height="14px" style={{ marginBottom: 'var(--space-5)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <Skeleton width="100px" height="13px" style={{ marginBottom: 'var(--space-2)' }} />
              <Skeleton width="100%" height="40px" borderRadius="var(--radius-md)" />
            </div>
            <div>
              <Skeleton width="140px" height="13px" style={{ marginBottom: 'var(--space-2)' }} />
              <Skeleton width="100%" height="40px" borderRadius="var(--radius-md)" />
            </div>
            <div>
              <Skeleton width="150px" height="13px" style={{ marginBottom: 'var(--space-2)' }} />
              <Skeleton width="100%" height="40px" borderRadius="var(--radius-md)" />
            </div>
          </div>
        </Card>

        {/* CSM Assignment Skeleton */}
        <Card>
          <Skeleton width="200px" height="20px" style={{ marginBottom: 'var(--space-2)' }} />
          <Skeleton width="280px" height="14px" style={{ marginBottom: 'var(--space-4)' }} />
          <Skeleton width="100%" height="40px" borderRadius="var(--radius-md)" />
        </Card>

        {/* Module Configuration Skeleton */}
        <Card>
          <Skeleton width="210px" height="20px" style={{ marginBottom: 'var(--space-2)' }} />
          <Skeleton width="300px" height="14px" style={{ marginBottom: 'var(--space-4)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={`feat-${i}`} width="100%" height="44px" borderRadius="var(--radius-md)" />
            ))}
          </div>
        </Card>

        {/* Team Members Skeleton */}
        <Card>
          <Skeleton width="240px" height="20px" style={{ marginBottom: 'var(--space-2)' }} />
          <Skeleton width="340px" height="14px" style={{ marginBottom: 'var(--space-4)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Skeleton width="100%" height="60px" borderRadius="var(--radius-md)" />
            <Skeleton width="100%" height="60px" borderRadius="var(--radius-md)" />
          </div>
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        {loadError ? (
          <Notice onRetry={fetchClientDetails} style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
            {loadError}
          </Notice>
        ) : (
          <h2 style={{ margin: '0 0 var(--space-3)' }}>Client not found</h2>
        )}
        <Link href="/admin/clients" className={buttonClasses({ variant: 'secondary' })}>
          Back to Clients
        </Link>
      </Card>
    );
  }

  const isArchived = Boolean(tenant.deleted_at || tenant.status === 'cancelled');
  const isTenantSuspended = tenant.status === 'suspended';
  const canEditStatus = !isArchived && !isTenantSuspended;
  const pendingInvitations = invitations.filter((inv: any) => !inv.accepted_at && !inv.revoked_at);
  const noteBoxStyle: React.CSSProperties = {
    display: 'flex',
    gap: 'var(--space-2)',
    alignItems: 'flex-start',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <Link href="/admin/clients" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
            Back to Clients
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-1)', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{tenant.name}</h1>
            <StatusBadge
              status={clientStatusLabel(tenant.status, isArchived)}
              variant={isArchived ? 'pending' : isTenantSuspended ? 'suspended' : tenant.status === 'active' ? 'done' : tenant.status === 'onboarding' ? 'progress' : 'pending'}
            />
          </div>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Main contact: {tenant.primary_contact_name ? `${tenant.primary_contact_name} · ` : ''}{tenant.primary_email}
          </p>
          <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
            Client ID: {tenant.id}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!isArchived && (
            <Link href={`/portal/${tenant.id}`} className={buttonClasses({ variant: 'secondary' })}>
              Open portal
            </Link>
          )}
          {!isArchived && !isTenantSuspended && (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setBanTenantReason('');
                setBanTenantError('');
                setIsBanTenantModalOpen(true);
              }}
            >
              Suspend client
            </Button>
          )}
          {!isArchived && (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setArchiveError('');
                setIsArchiveModalOpen(true);
              }}
            >
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Banner while the client is archived */}
      {isArchived && (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-status-pending-bg)',
            border: '1px solid var(--color-status-pending-border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-5)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <div style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Icon name="package" size={18} /> This client is archived
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)', color: 'var(--color-text-secondary)' }}>
              Their team cannot sign in. Nothing has been deleted, and you can unarchive them at any time.
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setUnarchiveError('');
              setIsUnarchiveModalOpen(true);
            }}
          >
            Unarchive
          </Button>
        </div>
      )}

      {/* Banner while the client is suspended */}
      {isTenantSuspended && !isArchived && (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-status-suspended-bg)',
            border: '1px solid var(--color-status-suspended-border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-5)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <div style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-status-suspended-text)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Icon name="lock" size={18} /> This client is suspended. Nobody on their team can sign in.
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)', color: 'var(--color-text-secondary)' }}>
              <strong>Reason:</strong> {tenant.suspended_reason || 'No reason was given.'}
            </div>
            {tenant.suspended_by && (
              <div style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)', color: 'var(--color-text-muted)' }}>
                Suspended by {tenant.suspended_by}
                {tenant.suspended_at ? ` on ${formatDateTime(tenant.suspended_at)}` : ''}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setUnbanTenantError('');
              setIsUnbanTenantModalOpen(true);
            }}
          >
            Reactivate
          </Button>
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Company details */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader title="Company details" subtitle="The basics for this client and where its data lives." />
          <Input
            label="Company name"
            value={companyName}
            onChange={(e) => {
              setCompanyName(e.target.value);
              clearSaveFieldError('name');
            }}
            error={saveErrorFor('name')}
            maxLength={255}
            required
          />
          <Input
            label="Business phone"
            type="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              clearSaveFieldError('phone');
            }}
            error={saveErrorFor('phone')}
            maxLength={30}
            placeholder="e.g. +1 555 234 5678"
          />
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span className="ui-label" style={{ display: 'block' }}>GoHighLevel Location ID</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', fontSize: 'var(--font-size-sm)' }}>
              {tenant.ghl_location_id ? (
                <code style={{ wordBreak: 'break-all' }}>{tenant.ghl_location_id}</code>
              ) : (
                <span style={{ color: 'var(--color-text-muted)' }}>Not connected yet</span>
              )}
              <Link href="/admin/ghl">Change in GHL Connect</Link>
            </div>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span className="ui-label" style={{ display: 'block' }}>Tracking sheet</span>
            {trackingSheetUrl ? (
              <a href={trackingSheetUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--font-size-sm)' }}>
                Open client tracking sheet
              </a>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>No sheet yet.</span>
                <Button type="button" variant="secondary" size="sm" onClick={handleCreateSheet} disabled={sheetBusy}>
                  {sheetBusy ? 'Creating...' : 'Create tracking sheet'}
                </Button>
              </div>
            )}
            {sheetError && (
              <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-danger-text)', marginTop: 'var(--space-1)' }}>
                {sheetError}
              </span>
            )}
          </div>
          {canEditStatus ? (
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              helperText="To suspend or archive this client, use the buttons at the top of the page."
            >
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
            </Select>
          ) : (
            <div>
              <span className="ui-label" style={{ display: 'block' }}>Status</span>
              <span style={{ fontSize: 'var(--font-size-sm)' }}>
                {clientStatusLabel(tenant.status, isArchived)}.{' '}
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {isArchived ? 'Unarchive the client to change this.' : 'Reactivate the client to change this.'}
                </span>
              </span>
            </div>
          )}
        </Card>

        {/* Assigned CSM */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader title="Customer Success Manager" subtitle="The Motionz team member who looks after this client." />
          <Select
            label="Assigned CSM"
            value={csmUserId}
            onChange={(e) => {
              setCsmUserId(e.target.value);
              clearSaveFieldError('csm_user_id');
            }}
            error={saveErrorFor('csm_user_id')}
          >
            <option value="">No CSM assigned</option>
            {availableCsms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ? `${c.name} (${c.email})` : c.email}
              </option>
            ))}
          </Select>
        </Card>

        {/* Portal sections switched on for this client */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader title="Portal sections" subtitle="Choose which parts of the portal this client can see." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            {PORTAL_MODULES.map((module) => (
              <label
                key={module.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={features[module.key] !== false}
                  onChange={() => toggleFeature(module.key)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span style={{ fontSize: 'var(--font-size-sm)' }}>{module.label}</span>
              </label>
            ))}
          </div>
        </Card>

        {saveSuccess && (
          <Notice tone="success" style={{ marginBottom: 'var(--space-4)' }}>
            Your changes were saved.
          </Notice>
        )}
        {saveError && (
          <Notice ref={saveErrorRef} style={{ marginBottom: 'var(--space-4)' }}>
            {saveError}
            {saveFieldError && ['name', 'phone', 'csm_user_id'].includes(saveFieldError.field) ? ' The field is marked above.' : ''}
          </Notice>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          <Link
            href="/admin/clients"
            className={buttonClasses({ variant: 'secondary' })}
            aria-disabled={isSaving || undefined}
            style={isSaving ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
          >
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </form>

      {/* Everything below saves on its own, so it sits outside the settings form. */}
      <OnboardingAnswers submissions={submissions} />

      <ClientRecords clientId={clientId} />

      {/* Client team */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <CardHeader title="Client team" subtitle="Everyone at this client who can sign in, and what each person can open." />
          {!isArchived && (
            <Button variant="outline" size="sm" type="button" onClick={handleOpenInviteModal} style={{ marginTop: 'var(--space-1)' }}>
              Invite
            </Button>
          )}
        </div>
        {members.length === 0 ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
            Nobody at this client has signed in yet. Use Invite to send the account owner their sign-in link.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {members.map((member) => {
              const isMainClient = member.role === 'client';
              const isSuspended = member.status === 'suspended' || (isMainClient && tenant?.status === 'suspended');
              const isCascade = Boolean(member.cascade_suspended) || (isMainClient && tenant?.status === 'suspended');
              const bannedByRole = member.suspended_by_role;

              return (
                <div key={member.id} className={`admin-member-row ${isSuspended ? 'is-suspended' : ''}`.trim()}>
                  <div className="admin-member-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                        {member.full_name || member.email}
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: isMainClient ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
                          backgroundColor: isMainClient ? 'var(--color-primary-soft)' : 'var(--color-bg-surface)',
                          border: `1px solid ${isMainClient ? 'var(--color-primary-border)' : 'var(--color-border-subtle)'}`,
                          padding: '1px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontWeight: isMainClient ? 600 : 500,
                        }}
                      >
                        {roleLabel(member.role)}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px', wordBreak: 'break-word' }}>
                      {member.email}
                    </div>
                    {member.phone && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                        {member.phone}
                      </div>
                    )}

                    {isSuspended && (
                      <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-suspended-text)' }}>
                        <strong>Reason:</strong> {member.suspended_reason || (isMainClient ? 'The client is suspended.' : 'No reason was given.')}
                        <div style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          {isCascade
                            ? 'Locked out because the whole client is suspended.'
                            : bannedByRole === 'client'
                              ? `Disabled by the client’s account owner${member.suspended_by ? ` (${member.suspended_by})` : ''}.`
                              : `Disabled by Motionz${member.suspended_by ? ` (${member.suspended_by})` : ''}.`}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="admin-member-status-col">
                    <StatusBadge status={isSuspended ? (isMainClient ? 'Suspended' : 'Disabled') : 'Active'} variant={isSuspended ? 'suspended' : 'done'} />
                  </div>

                  <div className="admin-member-action-col">
                    {isMainClient ? (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Full access</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button variant="secondary" size="sm" type="button" onClick={() => handleOpenPermissions(member)}>
                          Permissions
                        </Button>
                        {isSuspended ? (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            disabled={isCascade}
                            title={isCascade ? 'Reactivate the client to let this person back in.' : undefined}
                            onClick={() => {
                              setUnsuspendMemberTarget(member);
                              setUnsuspendMemberError('');
                            }}
                          >
                            Enable
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setSuspendMemberTarget(member);
                              setSuspendMemberReason('');
                              setSuspendMemberError('');
                            }}
                          >
                            Disable
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Invitations that have been sent but not used yet */}
      {pendingInvitations.length > 0 && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <CardHeader title="Invitations waiting" subtitle="Sent, but the person has not finished signing up yet. Each link works once." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {pendingInvitations.map((inv: any) => {
              const isExpired = new Date(inv.expires_at) < new Date();

              return (
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
                    <div style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>{inv.email}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      {roleLabel(inv.role)} · {inv.phone ? `${inv.phone} · ` : ''}
                      {isExpired ? 'Expired' : 'Expires'} {formatDateTime(inv.expires_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {isExpired ? (
                      <StatusBadge status="Expired" variant="warning" />
                    ) : (
                      <StatusBadge status="Waiting" variant="progress" />
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      aria-label={`Send the invite to ${inv.email} again`}
                      onClick={() => {
                        setResendTarget(inv);
                        setResendError('');
                        setResentLink('');
                        setCopyState('idle');
                      }}
                    >
                      Send again
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      type="button"
                      aria-label={`Cancel the invite for ${inv.email}`}
                      onClick={() => {
                        setRevokeTarget(inv);
                        setRevokeError('');
                      }}
                    >
                      Cancel invite
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Suspend client */}
      <Modal
        isOpen={isBanTenantModalOpen}
        onClose={() => {
          if (!isBanningTenant) setIsBanTenantModalOpen(false);
        }}
        title="Suspend client"
        dismissOnOverlay={false}
        footer={
          <div style={modalFooterStyle}>
            <Button type="button" variant="outline" onClick={() => setIsBanTenantModalOpen(false)} disabled={isBanningTenant}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirmBanTenant} disabled={isBanningTenant || !banTenantReason.trim()}>
              {isBanningTenant ? 'Suspending...' : 'Suspend client'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {banTenantError && <Notice>{banTenantError}</Notice>}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Suspend <strong style={{ color: 'var(--color-text-primary)' }}>{tenant.name}</strong>?
          </p>
          <Input
            label="Reason"
            value={banTenantReason}
            onChange={(e) => setBanTenantReason(e.target.value)}
            placeholder="e.g. Subscription paused"
            helperText="The client sees this reason when they try to sign in."
            maxLength={300}
            required
          />
          <div style={noteBoxStyle}>
            <Icon name="alert" size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>Everyone on this client’s team is signed out and cannot sign back in until you reactivate the client.</span>
          </div>
        </div>
      </Modal>

      {/* Reactivate client */}
      <Modal
        isOpen={isUnbanTenantModalOpen}
        onClose={() => {
          if (!isUnbanningTenant) setIsUnbanTenantModalOpen(false);
        }}
        title="Reactivate client"
        footer={
          <div style={modalFooterStyle}>
            <Button type="button" variant="outline" onClick={() => setIsUnbanTenantModalOpen(false)} disabled={isUnbanningTenant}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleConfirmUnbanTenant} disabled={isUnbanningTenant}>
              {isUnbanningTenant ? 'Reactivating...' : 'Reactivate'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {unbanTenantError && <Notice>{unbanTenantError}</Notice>}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Reactivate <strong style={{ color: 'var(--color-text-primary)' }}>{tenant.name}</strong> and let their team sign in again?
          </p>
          <div style={noteBoxStyle}>
            <Icon name="help" size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>Team members who were locked out by this suspension get their access back. Anyone who was disabled individually stays disabled.</span>
          </div>
        </div>
      </Modal>

      {/* Disable one team member */}
      <Modal
        isOpen={Boolean(suspendMemberTarget)}
        onClose={() => {
          if (!isSuspendingMember) setSuspendMemberTarget(null);
        }}
        title="Disable team member"
        dismissOnOverlay={false}
        footer={
          <div style={modalFooterStyle}>
            <Button type="button" variant="outline" onClick={() => setSuspendMemberTarget(null)} disabled={isSuspendingMember}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirmSuspendMember} disabled={isSuspendingMember || !suspendMemberReason.trim()}>
              {isSuspendingMember ? 'Disabling...' : 'Disable'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {suspendMemberError && <Notice>{suspendMemberError}</Notice>}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Disable <strong style={{ color: 'var(--color-text-primary)' }}>{suspendMemberTarget?.full_name || suspendMemberTarget?.email}</strong>?
          </p>
          <Input
            label="Reason"
            value={suspendMemberReason}
            onChange={(e) => setSuspendMemberReason(e.target.value)}
            placeholder="e.g. No longer works at the company"
            maxLength={300}
            required
          />
          <div style={noteBoxStyle}>
            <span>This person is signed out and cannot sign back in until you enable them again.</span>
          </div>
        </div>
      </Modal>

      {/* Enable one team member */}
      <Modal
        isOpen={Boolean(unsuspendMemberTarget)}
        onClose={() => {
          if (!isUnsuspendingMember) setUnsuspendMemberTarget(null);
        }}
        title="Enable team member"
        footer={
          <div style={modalFooterStyle}>
            <Button type="button" variant="outline" onClick={() => setUnsuspendMemberTarget(null)} disabled={isUnsuspendingMember}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleConfirmUnsuspendMember} disabled={isUnsuspendingMember}>
              {isUnsuspendingMember ? 'Enabling...' : 'Enable'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {unsuspendMemberError && <Notice>{unsuspendMemberError}</Notice>}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Let <strong style={{ color: 'var(--color-text-primary)' }}>{unsuspendMemberTarget?.full_name || unsuspendMemberTarget?.email}</strong> sign in again?
          </p>
        </div>
      </Modal>

      {/* Send an invitation again */}
      <Modal
        isOpen={Boolean(resendTarget)}
        onClose={closeResendModal}
        title={resentLink ? 'New sign-in link ready' : 'Send invitation again'}
        dismissOnOverlay={false}
        footer={
          resentLink ? (
            <div style={modalFooterStyle}>
              <Button type="button" variant="outline" onClick={closeResendModal}>
                Close
              </Button>
              <Button type="button" variant="primary" onClick={() => handleCopy(resentLink)}>
                {copyState === 'copied' ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          ) : (
            <div style={modalFooterStyle}>
              <Button type="button" variant="outline" onClick={closeResendModal} disabled={isResending}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleConfirmResend} disabled={isResending}>
                {isResending ? 'Sending...' : 'Send again'}
              </Button>
            </div>
          )
        }
      >
        {resentLink ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Notice tone="success">
              A new sign-in link is ready for <strong>{resendTarget?.email}</strong>. The old link no longer works.
            </Notice>
            <div style={linkBoxStyle}>{resentLink}</div>
            {copyState === 'failed' && <Notice>Could not copy automatically. Select the link above and copy it by hand.</Notice>}
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Send this link to the person. It works once and signs them in to finish setting up their account.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {resendError && <Notice>{resendError}</Notice>}
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Send a new invitation to <strong style={{ color: 'var(--color-text-primary)' }}>{resendTarget?.email}</strong>?
            </p>
            <div style={noteBoxStyle}>
              <span>The link they already have stops working straight away, and they get a fresh one.</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel an invitation */}
      <Modal
        isOpen={Boolean(revokeTarget)}
        onClose={() => {
          if (!isRevoking) {
            setRevokeTarget(null);
            setRevokeError('');
          }
        }}
        title="Cancel invitation"
        footer={
          <div style={modalFooterStyle}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRevokeTarget(null);
                setRevokeError('');
              }}
              disabled={isRevoking}
            >
              Keep it
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirmRevoke} disabled={isRevoking}>
              {isRevoking ? 'Cancelling...' : 'Cancel invitation'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {revokeError && <Notice>{revokeError}</Notice>}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Cancel the invitation for <strong style={{ color: 'var(--color-text-primary)' }}>{revokeTarget?.email}</strong>? Their link will stop working straight away.
          </p>
        </div>
      </Modal>

      {/* Archive client */}
      <Modal
        isOpen={isArchiveModalOpen}
        onClose={() => {
          if (!isArchiving) setIsArchiveModalOpen(false);
        }}
        title="Archive client"
        footer={
          <div style={modalFooterStyle}>
            <Button type="button" variant="secondary" onClick={() => setIsArchiveModalOpen(false)} disabled={isArchiving}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={handleArchive} disabled={isArchiving}>
              {isArchiving ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {archiveError && <Notice>{archiveError}</Notice>}
          <p style={{ margin: 0 }}>
            Archive <strong>{tenant.name}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Their team will not be able to sign in. Nothing is deleted, and you can unarchive them later.
          </p>
        </div>
      </Modal>

      {/* Unarchive client */}
      <Modal
        isOpen={isUnarchiveModalOpen}
        onClose={() => {
          if (!isUnarchiving) {
            setIsUnarchiveModalOpen(false);
            setUnarchiveError('');
          }
        }}
        title="Unarchive client"
        footer={
          <div style={modalFooterStyle}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsUnarchiveModalOpen(false);
                setUnarchiveError('');
              }}
              disabled={isUnarchiving}
            >
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleUnarchive} disabled={isUnarchiving}>
              {isUnarchiving ? 'Unarchiving...' : 'Unarchive'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {unarchiveError && <Notice>{unarchiveError}</Notice>}
          <p style={{ margin: 0 }}>
            Unarchive <strong>{tenant.name}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            The client goes back to <strong>Active</strong> and their team can sign in again. All of their data and setup progress is still there.
          </p>
        </div>
      </Modal>

      {/* Invite someone (account owner or team member) */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={closeInviteModal}
        title={generatedLink ? 'Invitation ready' : 'Invite to the portal'}
        dismissOnOverlay={false}
        footer={
          generatedLink ? (
            <div style={modalFooterStyle}>
              <Button type="button" variant="outline" onClick={closeInviteModal}>
                Close
              </Button>
              <Button type="button" variant="primary" onClick={() => handleCopy(generatedLink)}>
                {copyState === 'copied' ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          ) : (
            <div style={modalFooterStyle}>
              <Button type="button" variant="outline" onClick={closeInviteModal} disabled={isGenerating}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleGenerateMagicLink} disabled={isGenerating || !generateEmail.trim()}>
                {isGenerating ? 'Sending...' : 'Send invitation'}
              </Button>
            </div>
          )
        }
      >
        {generatedLink ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {inviteEmailDelivered ? (
              <Notice tone="success">
                We emailed the invitation to <strong>{generateEmail}</strong>. You can also copy the link below.
              </Notice>
            ) : (
              <Notice tone="info">
                The invitation for <strong>{generateEmail}</strong> is ready, but the email was not sent. Copy the link below and send it to them yourself.
              </Notice>
            )}
            <div style={linkBoxStyle}>{generatedLink}</div>
            {copyState === 'failed' && <Notice>Could not copy automatically. Select the link above and copy it by hand.</Notice>}
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              The link works once and signs them in to finish setting up their account.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {generateError && <Notice>{generateError}</Notice>}
            <Input
              label="Email"
              type="email"
              autoComplete="off"
              value={generateEmail}
              onChange={(e) => setGenerateEmail(e.target.value)}
              placeholder="name@company.com"
              maxLength={254}
              required
            />
            <Select
              label="Role"
              value={generateRole}
              onChange={(e) => {
                const newRole = e.target.value === 'client' ? 'client' : 'client_member';
                setGenerateRole(newRole);
                if (newRole === 'client_member' && selectedInviteModules.length === 0) {
                  setSelectedInviteModules(memberSelectableModules(features).map((m) => m.key));
                }
              }}
            >
              <option value="client">Account owner (full access)</option>
              <option value="client_member">Team member</option>
            </Select>

            {generateRole === 'client_member' && (
              <div>
                <span className="ui-label" style={{ display: 'block' }}>What this person can open</span>
                <MemberModulePicker features={features} selected={selectedInviteModules} onChange={setSelectedInviteModules} disabled={isGenerating} />
              </div>
            )}
            <div style={noteBoxStyle}>
              <span>They get an email with a one-time link to set up their account. If they already have an invitation waiting, this one replaces it.</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit one team member's permissions */}
      <Modal
        isOpen={Boolean(permissionTarget)}
        onClose={closePermissionsModal}
        title={`Permissions: ${permissionTarget?.full_name || permissionTarget?.email || ''}`}
        dismissOnOverlay={false}
        footer={
          <div style={{ ...modalFooterStyle, flexWrap: 'wrap' }}>
            <Button type="button" variant="outline" onClick={closePermissionsModal} disabled={isSavingPermissions}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleSavePermissions} disabled={isSavingPermissions}>
              {isSavingPermissions ? 'Saving...' : 'Save permissions'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {permissionError && <Notice>{permissionError}</Notice>}
          {permissionSuccess && <Notice tone="success">{permissionSuccess}</Notice>}
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Choose what <strong style={{ color: 'var(--color-text-primary)' }}>{permissionTarget?.email}</strong> can open. Anything left unticked is hidden from them.
          </div>
          <MemberModulePicker features={features} selected={editAllowedModules} onChange={setEditAllowedModules} disabled={isSavingPermissions} />
        </div>
      </Modal>
    </div>
  );
}
