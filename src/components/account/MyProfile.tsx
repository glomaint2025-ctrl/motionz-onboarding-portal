'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHeader, Button, Input, Skeleton } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';

/** Fired after a change the header shows (name, picture), so the shell can refresh it. */
export const PROFILE_UPDATED_EVENT = 'motionz:profile-updated';

const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PICTURE_RULES = 'PNG, JPG or WEBP, up to 2 MB.';
const OFFLINE = 'Could not reach the server. Check your connection and try again.';

interface Profile {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  roleLabel: string;
  avatarUrl: string | null;
}

type Message = { type: 'ok' | 'error'; text: string } | null;

function SectionMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <Notice tone={message.type === 'ok' ? 'success' : 'error'} style={{ wordBreak: 'break-word' }}>
      {message.text}
    </Notice>
  );
}

function initialsFrom(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function announceChange() {
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

/**
 * "My profile": the signed-in person's own picture, name, phone and sign-in email.
 * The same page for every role; the server always works on whoever is signed in.
 */
export function MyProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Picture
  const fileRef = useRef<HTMLInputElement>(null);
  const [pictureBusy, setPictureBusy] = useState<'upload' | 'remove' | null>(null);
  const [pictureMessage, setPictureMessage] = useState<Message>(null);
  const [pictureBroken, setPictureBroken] = useState(false);

  // Details
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsMessage, setDetailsMessage] = useState<Message>(null);

  // Sign-in email
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<Message>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setLoadError('');
      try {
        const res = await fetch('/api/account/profile');
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          window.location.href = '/auth/login';
          return;
        }
        if (!isMounted) return;
        if (!res.ok) {
          setLoadError(data.error || 'Your profile could not be loaded.');
          return;
        }
        setProfile(data);
        setName(data.fullName || '');
        setPhone(data.phone || '');
        setPictureBroken(false);
      } catch {
        if (isMounted) setLoadError(OFFLINE);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const handlePictureChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow choosing the same file again later.
    e.target.value = '';
    if (!file) return;

    if (!PICTURE_TYPES.includes(file.type)) {
      setPictureMessage({ type: 'error', text: 'That file type is not supported. Choose a PNG, JPG or WEBP picture.' });
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      setPictureMessage({ type: 'error', text: 'That picture is larger than 2 MB. Choose a smaller one.' });
      return;
    }

    setPictureBusy('upload');
    setPictureMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/account/profile/avatar', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPictureMessage({ type: 'error', text: data.error || 'Your picture could not be saved. Please try again.' });
        return;
      }
      setProfile((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl || null } : prev));
      setPictureBroken(false);
      setPictureMessage({ type: 'ok', text: 'Your picture was saved.' });
      announceChange();
    } catch {
      setPictureMessage({ type: 'error', text: OFFLINE });
    } finally {
      setPictureBusy(null);
    }
  };

  const handlePictureRemove = async () => {
    setPictureBusy('remove');
    setPictureMessage(null);
    try {
      const res = await fetch('/api/account/profile/avatar', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPictureMessage({ type: 'error', text: data.error || 'Your picture could not be removed. Please try again.' });
        return;
      }
      setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      setPictureMessage({ type: 'ok', text: 'Your picture was removed.' });
      announceChange();
    } catch {
      setPictureMessage({ type: 'error', text: OFFLINE });
    } finally {
      setPictureBusy(null);
    }
  };

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setDetailsMessage({ type: 'error', text: 'Please enter your name.' });
      return;
    }
    setDetailsBusy(true);
    setDetailsMessage(null);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetailsMessage({ type: 'error', text: data.error || 'Your changes could not be saved. Please try again.' });
        return;
      }
      if (data.profile) {
        setProfile((prev) => (prev ? { ...prev, fullName: data.profile.fullName, phone: data.profile.phone } : prev));
        setName(data.profile.fullName || '');
        setPhone(data.profile.phone || '');
      }
      setDetailsMessage({ type: 'ok', text: 'Your changes were saved.' });
      announceChange();
    } catch {
      setDetailsMessage({ type: 'error', text: 'Could not reach the server. Your changes were not saved.' });
    } finally {
      setDetailsBusy(false);
    }
  };

  const closeEmailForm = () => {
    setIsChangingEmail(false);
    setNewEmail('');
    setCurrentPassword('');
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !currentPassword) {
      setEmailMessage({ type: 'error', text: 'Enter your new email address and your current password.' });
      return;
    }
    setEmailBusy(true);
    setEmailMessage(null);
    try {
      const res = await fetch('/api/account/profile/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail: newEmail.trim(), currentPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailMessage({ type: 'error', text: data.error || 'Your email could not be changed. Please try again.' });
        return;
      }
      setProfile((prev) => (prev ? { ...prev, email: data.email } : prev));
      closeEmailForm();
      setEmailMessage({
        type: 'ok',
        text: `Your sign-in email is now ${data.email}. Use it the next time you sign in.${
          data.noticeSent ? ' We sent a notice to your old address.' : ''
        }`,
      });
    } catch {
      setEmailMessage({ type: 'error', text: 'Could not reach the server. Your email was not changed.' });
    } finally {
      setEmailBusy(false);
    }
  };

  const isStaff = profile?.role === 'admin' || profile?.role === 'csm';
  const showPicture = Boolean(profile?.avatarUrl) && !pictureBroken;
  const initials = initialsFrom(profile?.fullName || profile?.email || '');

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>My profile</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Your own picture, name and sign-in details. Changes here only affect you.
        </p>
      </div>

      <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {isLoading ? (
          <Card aria-busy="true">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Skeleton width="72px" height="72px" borderRadius="var(--radius-full)" />
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton width="140px" height="14px" style={{ marginBottom: '6px' }} />
                  <Skeleton width="100%" height="40px" borderRadius="var(--radius-md)" />
                </div>
              ))}
            </div>
          </Card>
        ) : loadError || !profile ? (
          <Notice tone="error" onRetry={retry}>
            {loadError || 'Your profile could not be loaded.'}
          </Notice>
        ) : (
          <>
            {/* Picture */}
            <Card>
              <CardHeader title="Your picture" subtitle="Shown next to your name at the top of the portal." />
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <span className="user-avatar profile-avatar" aria-hidden="true">
                  {showPicture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl as string} alt="" onError={() => setPictureBroken(true)} />
                  ) : (
                    initials
                  )}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0, flex: '1 1 200px' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={PICTURE_TYPES.join(',')}
                      onChange={handlePictureChosen}
                      style={{ display: 'none' }}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={pictureBusy !== null}
                    >
                      {pictureBusy === 'upload' ? 'Uploading...' : profile.avatarUrl ? 'Change picture' : 'Upload picture'}
                    </Button>
                    {profile.avatarUrl && (
                      <Button type="button" variant="ghost" onClick={handlePictureRemove} disabled={pictureBusy !== null}>
                        {pictureBusy === 'remove' ? 'Removing...' : 'Remove'}
                      </Button>
                    )}
                  </div>
                  <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {PICTURE_RULES}
                  </p>
                </div>
              </div>
              {pictureMessage && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <SectionMessage message={pictureMessage} />
                </div>
              )}
            </Card>

            {/* Name and phone */}
            <Card>
              <CardHeader title="Your details" subtitle={profile.roleLabel ? `You are signed in as ${profile.roleLabel}.` : undefined} />
              <form onSubmit={handleDetailsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Input
                  id="my-profile-name"
                  label="Your name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDetailsMessage((prev) => (prev?.type === 'error' ? null : prev));
                  }}
                  maxLength={100}
                  autoComplete="name"
                  required
                />
                <Input
                  id="my-profile-phone"
                  label="Phone number"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setDetailsMessage((prev) => (prev?.type === 'error' ? null : prev));
                  }}
                  maxLength={30}
                  autoComplete="tel"
                  helperText="Optional. Leave empty to remove the number."
                  placeholder="e.g. +1 555 234 5678"
                />
                <SectionMessage message={detailsMessage} />
                <div>
                  <Button type="submit" variant="primary" disabled={detailsBusy}>
                    {detailsBusy ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </form>
            </Card>

            {/* Sign-in email */}
            <Card>
              <CardHeader title="Sign-in email" subtitle="The email address you use to sign in." />
              <p style={{ margin: '0 0 var(--space-3)', fontWeight: 600, wordBreak: 'break-all' }}>{profile.email}</p>

              {!isChangingEmail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <SectionMessage message={emailMessage} />
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEmailMessage(null);
                        setIsChangingEmail(true);
                      }}
                    >
                      Change email
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <Input
                    id="my-profile-new-email"
                    label="New email address"
                    type="email"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      setEmailMessage(null);
                    }}
                    maxLength={255}
                    autoComplete="email"
                    helperText={
                      isStaff
                        ? 'Staff accounts must use an @motionz.ai address.'
                        : profile.role === 'client'
                          ? "This only changes the email you sign in with. Your company's contact email stays the same."
                          : undefined
                    }
                    required
                    autoFocus
                  />
                  <Input
                    id="my-profile-current-password"
                    label="Current password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      setEmailMessage(null);
                    }}
                    autoComplete="current-password"
                    helperText="We ask for your password to make sure it is really you."
                    required
                  />
                  <SectionMessage message={emailMessage} />
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <Button type="submit" variant="primary" disabled={emailBusy}>
                      {emailBusy ? 'Changing...' : 'Change email'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={emailBusy}
                      onClick={() => {
                        closeEmailForm();
                        setEmailMessage(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
