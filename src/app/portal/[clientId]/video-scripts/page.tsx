'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Input } from '@/components/ui';
import { generateScriptsFromTemplates, GeneratedScript } from '@/lib/scripts/template-engine';

interface StoredScriptTemplate {
  id: string;
  title: string;
  script_content: string;
}

type ChosenPreference = 'ai_video' | 'self_filmed';
type Notice = { text: string; isError: boolean } | null;

/** Typical spoken pace for read-aloud video scripts. */
const WORDS_PER_MINUTE = 150;

function readingTimeLabel(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return '';
  const seconds = Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 60));
  const duration = seconds < 60 ? `${seconds} seconds` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
  return `About ${duration} to read aloud (${words} words)`;
}

export default function VideoScriptsPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [videoPreference, setVideoPreference] = useState<ChosenPreference | null>(null);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isSavingPref, setIsSavingPref] = useState(false);
  const [prefNotice, setPrefNotice] = useState<Notice>(null);
  const [copyNotice, setCopyNotice] = useState<Notice>(null);
  const [scriptTemplates, setScriptTemplates] = useState<StoredScriptTemplate[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(true);
  const [scriptsError, setScriptsError] = useState('');
  const [prefLoadError, setPrefLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [portalRes, prefRes, scriptsRes] = await Promise.all([
          fetch(`/api/portal/${clientId}/data`),
          fetch(`/api/portal/${clientId}/video-preference`),
          fetch(`/api/portal/${clientId}/script-templates`),
        ]);

        if (!isMounted) return;

        if (scriptsRes.ok) {
          const sData = await scriptsRes.json();
          setScriptTemplates(Array.isArray(sData.scripts) ? sData.scripts : []);
        } else {
          setScriptsError('Video scripts could not be loaded. Please refresh the page.');
        }

        if (portalRes.ok) {
          const pData = await portalRes.json();
          if (isMounted && pData.tenant) {
            setClientName(pData.tenant.primary_contact_name || '');
            setCompanyName(pData.tenant.name || '');
          }
          if (isMounted) setViewerRole(pData.viewer?.role || null);
        }

        if (prefRes.ok) {
          const prefData = await prefRes.json();
          const pref = prefData.preference;
          if (isMounted && pref) {
            if (pref.video_preference === 'ai_video' || pref.video_preference === 'self_filmed') {
              setVideoPreference(pref.video_preference);
            }
            if (pref.custom_name) setClientName(pref.custom_name);
            if (pref.custom_company) setCompanyName(pref.custom_company);
          }
        } else if (isMounted) {
          setPrefLoadError('Your saved video preference could not be loaded.');
        }
      } catch {
        if (isMounted) setScriptsError('Could not reach the server. Please check your connection and refresh the page.');
      } finally {
        if (isMounted) setScriptsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Team members can read scripts, but only the account owner chooses the production route (server enforces this).
  const canChoosePreference = viewerRole !== 'client_member';

  const scripts: GeneratedScript[] = generateScriptsFromTemplates(scriptTemplates, {
    client_name: clientName,
    company_name: companyName,
  });

  const handlePreferenceChange = async (newPref: ChosenPreference) => {
    const previous = videoPreference;
    setIsSavingPref(true);
    setPrefNotice(null);

    try {
      const res = await fetch(`/api/portal/${clientId}/video-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_preference: newPref,
          custom_name: clientName,
          custom_company: companyName,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setVideoPreference(newPref);
        setPrefNotice({
          text: `Preference saved: ${newPref === 'ai_video' ? 'Motionz AI video' : 'Self-filmed video'}.`,
          isError: false,
        });
      } else {
        setVideoPreference(previous);
        setPrefNotice({ text: data.error || 'Your preference could not be saved.', isError: true });
      }
    } catch {
      setVideoPreference(previous);
      setPrefNotice({ text: 'Could not reach the server. Your preference was not saved.', isError: true });
    } finally {
      setIsSavingPref(false);
    }
  };

  const handleCopyScript = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice({ text: `Copied "${title}" to clipboard.`, isError: false });
    } catch {
      setCopyNotice({ text: 'Copy failed. Select the script text and copy it manually.', isError: true });
    }
    setTimeout(() => setCopyNotice(null), 3000);
  };

  const noticeStyle = (isError: boolean): React.CSSProperties => ({
    padding: 'var(--space-3)',
    backgroundColor: isError ? 'var(--color-status-blocked-bg)' : 'var(--color-status-done-bg)',
    color: isError ? 'var(--color-status-blocked-text)' : 'var(--color-status-done-text)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
    fontSize: 'var(--font-size-sm)',
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Video Scripts & Production</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Video scripts personalized with your company and contact information.
        </p>
      </div>

      {prefNotice && (
        <div role={prefNotice.isError ? 'alert' : 'status'} style={noticeStyle(prefNotice.isError)}>
          {prefNotice.text}
        </div>
      )}

      {copyNotice && (
        <div role={copyNotice.isError ? 'alert' : 'status'} style={noticeStyle(copyNotice.isError)}>
          {copyNotice.text}
        </div>
      )}

      {/* Video Production Preference */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Video Production Preference"
          subtitle="How your campaign video will be produced"
          action={
            <StatusBadge
              status={
                videoPreference === 'ai_video'
                  ? 'AI Video Selected'
                  : videoPreference === 'self_filmed'
                  ? 'Self-Filmed Selected'
                  : 'Not Chosen Yet'
              }
              variant={videoPreference ? 'done' : 'pending'}
            />
          }
        />

        {prefLoadError && (
          <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-status-danger-text)' }}>
            {prefLoadError}
          </p>
        )}

        {canChoosePreference ? (
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <Button
              variant={videoPreference === 'ai_video' ? 'primary' : 'outline'}
              onClick={() => handlePreferenceChange('ai_video')}
              disabled={isSavingPref || scriptsLoading}
            >
              Option 1: Motionz AI Video Creation
            </Button>

            <Button
              variant={videoPreference === 'self_filmed' ? 'primary' : 'outline'}
              onClick={() => handlePreferenceChange('self_filmed')}
              disabled={isSavingPref || scriptsLoading}
            >
              Option 2: Self-Filmed Video
            </Button>
          </div>
        ) : (
          <p style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            The account owner chooses how your videos are produced.
          </p>
        )}

        {videoPreference && (
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {videoPreference === 'ai_video' ? (
              <div>
                <strong style={{ color: 'var(--color-text-primary)' }}>Motionz AI video.</strong> The Motionz team creates
                your video using the details below. No filming required from you.
              </div>
            ) : (
              <div>
                <strong style={{ color: 'var(--color-text-primary)' }}>Self-filmed video.</strong> You record yourself reading
                the scripts below and send the footage to your CSM for editing.
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Personalization */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Script Personalization"
          subtitle="These details are filled into the scripts below"
        />

        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}
        >
          <Input
            label="Spokesperson / Contact Name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Your name"
          />

          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Your company name"
          />
        </div>
      </Card>

      {/* Scripts */}
      {scriptsLoading && (
        <Card>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Loading video scripts...
          </p>
        </Card>
      )}

      {!scriptsLoading && scriptsError && (
        <Card>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-status-danger-text)' }}>
            {scriptsError}
          </p>
        </Card>
      )}

      {!scriptsLoading && !scriptsError && scripts.length === 0 && (
        <Card>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            No video scripts are available yet. Your Motionz team will publish them here.
          </p>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {scripts.map((script, idx) => {
          const readingTime = readingTimeLabel(script.content);
          return (
            <Card key={script.id}>
              <CardHeader
                title={script.title}
                subtitle={`Script ${idx + 1}`}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyScript(script.content, script.title)}
                  >
                    Copy Script
                  </Button>
                }
              />

              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  fontSize: 'var(--font-size-sm)',
                  lineHeight: '1.6',
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {script.content}
              </div>

              <div
                style={{
                  marginTop: 'var(--space-3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                }}
              >
                <span>{readingTime}</span>
                {companyName && <span>Personalized for: {companyName}</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
