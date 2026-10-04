'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Input, Select, Button, StatusBadge, Modal, Skeleton } from '@/components/ui';
import { PORTAL_MODULES } from '@/lib/portal-modules';
import { OnboardingAnswers, OnboardingSubmissionView } from '@/components/onboarding/OnboardingAnswers';
import { ClientRecords } from '@/components/admin/ClientRecords';


export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any | null>(null);
  const [csm, setCsm] = useState<any | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('active');
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [trackingSheetUrl, setTrackingSheetUrl] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [submissions, setSubmissions] = useState<OnboardingSubmissionView[]>([]);
  const [csmUserId, setCsmUserId] = useState('');
  const [availableCsms, setAvailableCsms] = useState<{ id: string; name?: string; email: string }[]>([]);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isUnarchiveModalOpen, setIsUnarchiveModalOpen] = useState(false);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [unarchiveError, setUnarchiveError] = useState('');

  // Tenant ban / unban modal states
  const [isBanTenantModalOpen, setIsBanTenantModalOpen] = useState(false);
  const [banTenantReason, setBanTenantReason] = useState('Terms violation or billing delinquency.');
  const [isBanningTenant, setIsBanningTenant] = useState(false);
  const [banTenantError, setBanTenantError] = useState('');

  const [isUnbanTenantModalOpen, setIsUnbanTenantModalOpen] = useState(false);
  const [isUnbanningTenant, setIsUnbanningTenant] = useState(false);
  const [unbanTenantError, setUnbanTenantError] = useState('');

  // Member suspend / unsuspend modal states
  const [suspendMemberTarget, setSuspendMemberTarget] = useState<any | null>(null);
  const [suspendMemberReason, setSuspendMemberReason] = useState('Staff administrator restricted access.');
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

  // Generate magic link modal state
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateEmail, setGenerateEmail] = useState('');
  const [generateRole, setGenerateRole] = useState<'client' | 'client_member'>('client');
  const [selectedInviteModules, setSelectedInviteModules] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  // Member permissions state
  const [permissionTarget, setPermissionTarget] = useState<any | null>(null);
  const [editAllowedModules, setEditAllowedModules] = useState<string[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [permissionSuccess, setPermissionSuccess] = useState('');

  const handleOpenInviteModal = () => {
    setGenerateEmail('');
    setGenerateRole('client_member');
    setGenerateError('');
    setGeneratedLink('');
    const initial = PORTAL_MODULES
      .filter((m) => features[m.key] !== false)
      .map((m) => m.key);
    setSelectedInviteModules(initial);
    setIsGenerateModalOpen(true);
  };

  const handleOpenPermissions = (member: any) => {
    setPermissionTarget(member);
    setPermissionError('');
    setPermissionSuccess('');
    if (Array.isArray(member.allowed_modules)) {
      setEditAllowedModules(member.allowed_modules);
    } else {
      const activeKeys = PORTAL_MODULES
        .filter((m) => features[m.key] !== false)
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
      setSheetError('Network error while creating the tracking sheet.');
    } finally {
      setSheetBusy(false);
    }
  };

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/clients/${clientId}`);
      const data = await res.json();
      if (data.success) {
        setTenant(data.tenant);
        setCsm(data.csm);
        setFeatures(data.features || {});
        setSteps(data.steps || []);
        setInvitations(data.invitations || []);
        setMembers(data.members || []);
        setTrackingSheetUrl(data.trackingSheetUrl || null);
        setSubmissions(data.onboardingSubmissions || []);
        setCompanyName(data.tenant.name || '');
        setPhone(data.tenant.phone || '');
        setStatus(data.tenant.status || 'active');
        setGhlLocationId(data.tenant.ghl_location_id || '');
        if (data.tenant.primary_email && !generateEmail) {
          setGenerateEmail(data.tenant.primary_email);
        }
        setCsmUserId(data.csm?.id || '');
        setAvailableCsms(data.availableCsms || []);
      }
    } catch (err) {
      console.error('Failed to load client details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) fetchClientDetails();
  }, [clientId]);

  const toggleFeature = (key: string) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          phone,
          status,
          ghl_location_id: ghlLocationId,
          csm_user_id: csmUserId,
          feature_toggles: features,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleArchive = async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        router.push('/admin/clients');
      }
    } catch (err) {
      console.error('Archive failed:', err);
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
        setUnarchiveError(data.error || 'Failed to unarchive portal.');
      }
    } catch {
      setUnarchiveError('Network error while unarchiving portal.');
    } finally {
      setIsUnarchiving(false);
    }
  };

  // Suspend tenant (and cascade to members)
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
        setBanTenantError(data.error || 'Failed to ban client portal.');
      }
    } catch {
      setBanTenantError('Network error while banning client portal.');
    } finally {
      setIsBanningTenant(false);
    }
  };

  // Unsuspend tenant (and unlock cascade-suspended members)
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
        setUnbanTenantError(data.error || 'Failed to reactivate client portal.');
      }
    } catch {
      setUnbanTenantError('Network error while reactivating client portal.');
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
        setSuspendMemberError(data.error || 'Failed to suspend member.');
      }
    } catch {
      setSuspendMemberError('Network error while suspending member.');
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
        setUnsuspendMemberError(data.error || 'Failed to reactivate member.');
      }
    } catch {
      setUnsuspendMemberError('Network error while reactivating member.');
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
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', invitationId: revokeTarget.id }),
      });

      const data = await res.json();
      if (res.ok) {
        // Keep in list marked as revoked so admin can resend anytime if needed
        setInvitations((prev) =>
          prev.map((i) =>
            i.id === revokeTarget.id
              ? { ...i, revoked_at: new Date().toISOString() }
              : i
          )
        );
        setRevokeTarget(null);
      } else {
        setRevokeError(data.error || 'Failed to revoke invitation.');
      }
    } catch {
      setRevokeError('Network error while revoking invitation.');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleGenerateMagicLink = async () => {
    const targetEmail = generateEmail.trim() || tenant?.primary_email?.trim() || '';
    if (!targetEmail) {
      setGenerateError('Recipient email address is required.');
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
        if (data.invitation) {
          setInvitations((prev) => [
            data.invitation,
            ...prev.filter((i) => i.id !== data.invitation.id),
          ]);
        }
      } else {
        setGenerateError(data.error || 'Failed to generate magic link.');
      }
    } catch {
      setGenerateError('Network error while generating magic link.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Magic link copied to clipboard!');
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
        <StatusBadge status="Not Found" variant="danger" />
        <h2 style={{ margin: 'var(--space-3) 0' }}>Client Portal Not Found</h2>
        <Link href="/admin/clients">
          <Button variant="secondary">Return to Client Roster</Button>
        </Link>
      </Card>
    );
  }

  const isArchived = Boolean(tenant.deleted_at || tenant.status === 'cancelled');
  const isTenantSuspended = tenant.status === 'suspended';

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <Link href="/admin/clients" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
            Back to Client Roster
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <h1 style={{ margin: 0 }}>
              {tenant.name} Settings
            </h1>
            {isArchived ? (
              <StatusBadge status="Archived" variant="suspended" />
            ) : (
              <StatusBadge status={tenant.status} />
            )}
          </div>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Tenant ID: {tenant.id} &middot; Primary: {tenant.primary_email}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!isArchived && (
            <Link href={`/portal/${tenant.id}`}>
              <Button variant="secondary">
                Open Portal View
              </Button>
            </Link>
          )}
          {!isArchived && (isTenantSuspended ? (
            <Button
              variant="outline"
              onClick={() => {
                setUnbanTenantError('');
                setIsUnbanTenantModalOpen(true);
              }}
            >
              Reactivate Portal
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={() => {
                setBanTenantReason('Account suspended by Motionz administrator.');
                setBanTenantError('');
                setIsBanTenantModalOpen(true);
              }}
            >
              Ban Portal Access
            </Button>
          ))}
          {isArchived ? (
            <Button
              variant="primary"
              onClick={() => {
                setUnarchiveError('');
                setIsUnarchiveModalOpen(true);
              }}
            >
              Unarchive Portal
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setIsArchiveModalOpen(true)}>
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Prominent Banner if Portal is Archived */}
      {isArchived && (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'rgba(100, 116, 139, 0.1)',
            border: '1px solid rgba(100, 116, 139, 0.3)',
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
              <span>📦</span> Client Portal is Archived
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)', color: 'var(--color-text-secondary)' }}>
              User access is currently deactivated. Historical data and configuration are fully preserved. You can restore this client at any time.
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setUnarchiveError('');
              setIsUnarchiveModalOpen(true);
            }}
          >
            Unarchive Portal
          </Button>
        </div>
      )}

      {/* Prominent Banner if Portal is Banned/Suspended */}
      {isTenantSuspended && (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
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
            <div style={{ fontWeight: 'var(--font-weight-semibold)', color: '#fb7185', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>⛔</span> Client Portal & Associated Accounts Suspended
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)', color: 'var(--color-text-secondary)' }}>
              <strong>Restriction Reason:</strong> {tenant.suspended_reason || 'No specific reason provided.'}
            </div>
            {tenant.suspended_by && (
              <div style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)', color: 'var(--color-text-muted)' }}>
                Enacted by: {tenant.suspended_by} {tenant.suspended_at ? `on ${new Date(tenant.suspended_at).toLocaleString()}` : ''}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setUnbanTenantError('');
              setIsUnbanTenantModalOpen(true);
            }}
          >
            Reactivate Portal
          </Button>
        </div>
      )}

      {saveSuccess && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-status-done-bg)',
            border: '1px solid var(--color-status-done-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-status-done-text)',
            fontSize: 'var(--font-size-sm)',
            marginBottom: 'var(--space-5)',
          }}
        >
          Settings and feature toggles saved successfully.
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Core Company Settings */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader
            title="Tenant Identity & Integration"
            subtitle="Core operational parameters and GoHighLevel sub-account binding"
            action={<StatusBadge status={status} />}
          />
          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
          <Input
            label="Business Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="GoHighLevel Location ID"
            placeholder="e.g. loc_ghl_1234"
            value={ghlLocationId}
            onChange={(e) => setGhlLocationId(e.target.value)}
            helperText="Direct binding to the client's GoHighLevel sub-account."
          />
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-1)' }}>
              Tracking Sheet
            </span>
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
          <Select
            label="Portal Lifecycle Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="cancelled">Cancelled</option>
            <option value="suspended">Suspended / Banned</option>
          </Select>
        </Card>

        {/* Assigned CSM */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader
            title="Customer Success Manager"
            subtitle="Internal staff assigned to oversee onboarding"
          />
          <Select
            label="Assigned CSM"
            value={csmUserId}
            onChange={(e) => setCsmUserId(e.target.value)}
          >
            <option value="">No CSM assigned</option>
            {availableCsms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ? `${c.name} (${c.email})` : c.email}
              </option>
            ))}
          </Select>
        </Card>

        {/* Per-Tenant Feature Toggles */}
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <CardHeader
            title="Admin Feature Toggles"
            subtitle="Enable or disable specific modules for this client portal"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            {Object.entries(features)
              .filter(([key]) => PORTAL_MODULES.some((m) => m.key === key))
              .map(([key, enabled]) => (
              <label
                key={key}
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
                  checked={enabled}
                  onChange={() => toggleFeature(key)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span style={{ fontSize: 'var(--font-size-sm)', textTransform: 'capitalize' }}>
                  {PORTAL_MODULES.find((m) => m.key === key)?.label || key.replace(/_/g, ' ')}
                </span>
              </label>
            ))}
          </div>
        </Card>

        <OnboardingAnswers submissions={submissions} />

        <ClientRecords clientId={clientId} />

        {/* Client Team Members & Admin Roster Oversight */}
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
            <CardHeader
              title="Client Team Members & Staff Oversight"
              subtitle="View registered tenant users, monitor restriction origins, and manage individual access"
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleOpenInviteModal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}
            >
              + Invite Team Member
            </Button>
          </div>
          {members.length === 0 ? (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
              No team members registered under this client tenant yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {members.map((member) => {
                const isMainClient = member.role === 'client';
                const isSuspended = member.status === 'suspended' || (isMainClient && tenant?.status === 'suspended');
                const isCascade = Boolean(member.cascade_suspended) || (isMainClient && tenant?.status === 'suspended');
                const bannedByRole = member.suspended_by_role;

                return (
                  <div
                    key={member.id}
                    className={`admin-member-row ${isSuspended ? 'is-suspended' : ''}`.trim()}
                  >
                    <div className="admin-member-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                          {member.full_name || member.email}
                        </span>
                        <span
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            color: isMainClient ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
                            backgroundColor: isMainClient ? 'var(--color-primary-soft)' : 'rgba(255, 255, 255, 0.04)',
                            border: isMainClient ? '1px solid var(--color-primary-border)' : '1px solid rgba(255, 255, 255, 0.06)',
                            padding: '1px 8px',
                            borderRadius: '4px',
                            fontWeight: isMainClient ? 600 : 500,
                          }}
                        >
                          {isMainClient ? 'Primary Owner' : 'Team Member'}
                        </span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {member.email} {member.phone ? `| ${member.phone}` : ''}
                      </div>

                      {isSuspended && (
                        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: '#fb7185' }}>
                          <strong>Restriction:</strong> {member.suspended_reason || (isMainClient ? 'Client portal has been suspended.' : 'Access disabled')}
                          <div style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {isCascade ? (
                              <span>Cascaded automatically from company portal ban (Staff Admin)</span>
                            ) : bannedByRole === 'client' ? (
                              <span>Disabled by Client Admin ({member.suspended_by || 'Client'})</span>
                            ) : (
                              <span>Disabled directly by Staff Admin ({member.suspended_by || 'Admin'})</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="admin-member-status-col">
                      <StatusBadge status={isSuspended ? 'Suspended' : 'Active'} />
                    </div>

                    <div className="admin-member-action-col">
                      {isMainClient ? (
                        <span
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-muted)',
                            fontStyle: 'italic',
                            padding: '6px 12px',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Primary Account Holder
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={() => handleOpenPermissions(member)}
                          >
                            Permissions
                          </Button>
                          {isSuspended ? (
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => {
                                setUnsuspendMemberTarget(member);
                                setUnsuspendMemberError('');
                              }}
                            >
                              Reactivate Member
                            </Button>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              type="button"
                              onClick={() => {
                                setSuspendMemberTarget(member);
                                setSuspendMemberReason('Account disabled by Motionz administrator.');
                                setSuspendMemberError('');
                              }}
                            >
                              Disable Member
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

        {/* Pending & Active Invitations Management - Only shown if pending links exist or client hasn't registered yet */}
        {(members.length === 0 || invitations.some((inv: any) => !inv.accepted_at && !inv.revoked_at)) && (
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
              <CardHeader
                title="Pending Portal Invitations & Magic Links"
                subtitle="Active single-use access links awaiting acceptance. Once the user sets their password, the link is completed."
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setGenerateEmail(tenant?.primary_email || '');
                  setGenerateRole('client');
                  setGenerateError('');
                  setGeneratedLink('');
                  setIsGenerateModalOpen(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}
              >
                + Generate Magic Link
              </Button>
            </div>
            {invitations.filter((inv: any) => !inv.accepted_at && !inv.revoked_at).length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-6)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--color-border-subtle)',
                }}
              >
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                  No active or pending magic links found for this client.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setGenerateEmail(tenant?.primary_email || '');
                    setGenerateRole('client');
                    setGenerateError('');
                    setGeneratedLink('');
                    setIsGenerateModalOpen(true);
                  }}
                >
                  + Generate Magic Link for Client
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {invitations
                  .filter((inv: any) => !inv.accepted_at && !inv.revoked_at)
                  .map((inv: any) => {
                    const isAccepted = Boolean(inv.accepted_at);
                    const isRevoked = Boolean(inv.revoked_at);
                    const isExpired = !isAccepted && !isRevoked && new Date(inv.expires_at) < new Date();

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
                          <div style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
                            {inv.email}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            Role: {inv.role} | {inv.phone ? `Phone: ${inv.phone} | ` : ''}Expires: {new Date(inv.expires_at).toLocaleString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          {isAccepted ? (
                            <StatusBadge status="Accepted" variant="done" />
                          ) : isRevoked ? (
                            <StatusBadge status="Revoked" variant="danger" />
                          ) : isExpired ? (
                            <StatusBadge status="Expired" variant="warning" />
                          ) : (
                            <StatusBadge status="Pending Acceptance" variant="progress" />
                          )}

                          {!isAccepted && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                onClick={() => {
                                  setResendTarget(inv);
                                  setResendError('');
                                  setResentLink('');
                                }}
                              >
                                Resend Link
                              </Button>
                              {!isRevoked && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  type="button"
                                  onClick={() => {
                                    setRevokeTarget(inv);
                                    setRevokeError('');
                                  }}
                                >
                                  Revoke
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Link href="/admin/clients">
            <Button type="button" variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" variant="primary">
            Save Changes
          </Button>
        </div>
      </form>

      {/* Ban Client Portal Modal */}
      <Modal
        isOpen={isBanTenantModalOpen}
        onClose={() => {
          if (!isBanningTenant) setIsBanTenantModalOpen(false);
        }}
        title="Ban Client Portal Access"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => setIsBanTenantModalOpen(false)}
              disabled={isBanningTenant}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmBanTenant}
              disabled={isBanningTenant || !banTenantReason.trim()}
            >
              {isBanningTenant ? 'Banning Portal...' : 'Confirm Ban & Lock Access'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {banTenantError && (
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
              {banTenantError}
            </div>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Are you sure you want to ban and disable access for <strong style={{ color: 'var(--color-text-primary)' }}>{tenant.name}</strong>?
          </p>

          <Input
            label="Ban / Suspension Reason"
            value={banTenantReason}
            onChange={(e) => setBanTenantReason(e.target.value)}
            placeholder="e.g. Terms violation, subscription paused, or account under review"
            helperText="This reason will be presented to the client on their restriction screen."
            required
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
            ⚠️ <strong>Cascading Effect:</strong> Banning this client company will immediately invalidate all active sessions on their next request and automatically disable access for all registered client team members.
          </div>
        </div>
      </Modal>

      {/* Unban Client Portal Modal */}
      <Modal
        isOpen={isUnbanTenantModalOpen}
        onClose={() => {
          if (!isUnbanningTenant) setIsUnbanTenantModalOpen(false);
        }}
        title="Reactivate Client Portal"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => setIsUnbanTenantModalOpen(false)}
              disabled={isUnbanningTenant}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmUnbanTenant}
              disabled={isUnbanningTenant}
            >
              {isUnbanningTenant ? 'Reactivating...' : 'Reactivate Portal & Unlock Members'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {unbanTenantError && (
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
              {unbanTenantError}
            </div>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Reactivate <strong style={{ color: 'var(--color-text-primary)' }}>{tenant.name}</strong> and unlock portal access?
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
            ℹ️ All team members whose access was suspended due to the company-level portal ban will be automatically restored. Individual suspensions made manually by client admins will remain preserved.
          </div>
        </div>
      </Modal>

      {/* Suspend Individual Member Modal */}
      <Modal
        isOpen={Boolean(suspendMemberTarget)}
        onClose={() => {
          if (!isSuspendingMember) setSuspendMemberTarget(null);
        }}
        title="Disable Member Access"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => setSuspendMemberTarget(null)}
              disabled={isSuspendingMember}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmSuspendMember}
              disabled={isSuspendingMember || !suspendMemberReason.trim()}
            >
              {isSuspendingMember ? 'Disabling...' : 'Confirm Disable Member'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {suspendMemberError && (
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
              {suspendMemberError}
            </div>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Are you sure you want to disable access for <strong style={{ color: 'var(--color-text-primary)' }}>{suspendMemberTarget?.full_name || suspendMemberTarget?.email}</strong>?
          </p>

          <Input
            label="Reason for Suspension"
            value={suspendMemberReason}
            onChange={(e) => setSuspendMemberReason(e.target.value)}
            placeholder="e.g. Access revoked by Motionz administrator"
            required
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
            This user will be immediately logged out on their next request and blocked from signing back in until reactivated. This action is audited as banned by <strong>Staff Admin</strong>.
          </div>
        </div>
      </Modal>

      {/* Unsuspend Individual Member Modal */}
      <Modal
        isOpen={Boolean(unsuspendMemberTarget)}
        onClose={() => {
          if (!isUnsuspendingMember) setUnsuspendMemberTarget(null);
        }}
        title="Reactivate Member Access"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => setUnsuspendMemberTarget(null)}
              disabled={isUnsuspendingMember}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmUnsuspendMember}
              disabled={isUnsuspendingMember}
            >
              {isUnsuspendingMember ? 'Reactivating...' : 'Reactivate Member'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {unsuspendMemberError && (
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
              {unsuspendMemberError}
            </div>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Reactivate access for <strong style={{ color: 'var(--color-text-primary)' }}>{unsuspendMemberTarget?.full_name || unsuspendMemberTarget?.email}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            This member will immediately be allowed to sign in and access the portal again.
          </p>
        </div>
      </Modal>

      {/* Resend Invitation Confirmation & Link Result Modal */}
      <Modal
        isOpen={Boolean(resendTarget)}
        onClose={() => {
          if (!isResending) {
            setResendTarget(null);
            setResendError('');
            setResentLink('');
          }
        }}
        title={resentLink ? 'New Magic Link Generated' : 'Resend Portal Invitation'}
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
              The prior link was revoked and a fresh 72-hour single-use magic link is ready for <strong>{resendTarget?.email}</strong>:
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
              Deliver this link to the recipient. Upon verification, their authentication session is established.
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
              Are you sure you want to resend the magic-link invitation to <strong style={{ color: 'var(--color-text-primary)' }}>{resendTarget?.email}</strong>?
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
              ℹ️ Resending will immediately <strong>revoke the old link</strong> so it cannot be used, and generate a brand-new token with a 72-hour expiration window.
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke Invitation Modal */}
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
            Are you sure you want to revoke the invitation for <strong style={{ color: 'var(--color-text-primary)' }}>{revokeTarget?.email}</strong>?
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
            ⚠️ Once revoked, the invitation link will immediately become invalid.
          </div>
        </div>
      </Modal>

      {/* Archive Portal Modal */}
      <Modal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        title="Archive Client Portal"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setIsArchiveModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleArchive}>
              Confirm Archive
            </Button>
          </div>
        }
      >
        <p style={{ marginBottom: 'var(--space-3)' }}>
          Are you sure you want to archive <strong>{tenant.name}</strong>?
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          This will set the portal status to cancelled and deactivate user access. Historical data is preserved.
        </p>
      </Modal>

      {/* Unarchive Portal Modal */}
      <Modal
        isOpen={isUnarchiveModalOpen}
        onClose={() => {
          if (!isUnarchiving) {
            setIsUnarchiveModalOpen(false);
            setUnarchiveError('');
          }
        }}
        title="Unarchive Client Portal"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => {
                setIsUnarchiveModalOpen(false);
                setUnarchiveError('');
              }}
              disabled={isUnarchiving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUnarchive} disabled={isUnarchiving}>
              {isUnarchiving ? 'Unarchiving...' : 'Confirm Unarchive'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {unarchiveError && (
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
              {unarchiveError}
            </div>
          )}
          <p style={{ marginBottom: 'var(--space-3)' }}>
            Are you sure you want to unarchive <strong>{tenant.name}</strong>?
          </p>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            This will restore the client portal status to <strong>Active</strong> and reactivate access for team members. All previous data, setup milestones, and configurations are preserved.
          </p>
        </div>
      </Modal>

      {/* Generate Magic Link Modal */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => {
          if (!isGenerating) {
            setIsGenerateModalOpen(false);
            setGenerateError('');
            setGeneratedLink('');
          }
        }}
        title="Generate Magic Link"
        footer={
          generatedLink ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                variant="outline"
                onClick={() => {
                  setIsGenerateModalOpen(false);
                  setGenerateError('');
                  setGeneratedLink('');
                }}
              >
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => copyToClipboard(generatedLink)}
              >
                Copy Link
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                variant="outline"
                onClick={() => {
                  setIsGenerateModalOpen(false);
                  setGenerateError('');
                }}
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleGenerateMagicLink}
                disabled={isGenerating || !generateEmail.trim()}
              >
                {isGenerating ? 'Generating...' : 'Generate Magic Link'}
              </Button>
            </div>
          )
        }
      >
        {generatedLink ? (
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
              Fresh 72-hour single-use magic link is ready for <strong>{generateEmail}</strong>:
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
              {generatedLink}
            </div>
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Deliver this link to the recipient. Upon verification, their authentication session is established.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {generateError && (
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
                {generateError}
              </div>
            )}
            <Input
              label="Recipient Email"
              type="email"
              value={generateEmail}
              onChange={(e) => setGenerateEmail(e.target.value)}
              placeholder="e.g. client@example.com"
              required
            />
            <div>
              <Select
                label="Portal Role"
                value={generateRole}
                onChange={(e) => {
                  const newRole = e.target.value as any;
                  setGenerateRole(newRole);
                  if (newRole === 'client_member' && selectedInviteModules.length === 0) {
                    const initial = PORTAL_MODULES
                      .filter((m) => features[m.key] !== false)
                      .map((m) => m.key);
                    setSelectedInviteModules(initial);
                  }
                }}
              >
                <option value="client">Client Owner (Full Portal Access)</option>
                <option value="client_member">Client Team Member</option>
              </Select>
            </div>

            {generateRole === 'client_member' && (
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
                          .filter((m) => features[m.key] !== false)
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
                <div className="permission-grid" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                  {PORTAL_MODULES.filter((module) => features[module.key] !== false).map((module) => {
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
            )}
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
              Generating a magic link allows the recipient to instantly log into their portal without requiring a pre-set password. Any prior pending magic links for this email will be safely replaced.
            </div>
          </div>
        )}
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
                    .filter((m) => features[m.key] !== false)
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
            {PORTAL_MODULES.filter((module) => features[module.key] !== false).map((module) => {
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
