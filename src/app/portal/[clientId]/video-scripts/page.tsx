'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Input } from '@/components/ui';
import { generateAllScripts, GeneratedScript } from '@/lib/scripts/template-engine';

export default function VideoScriptsPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [videoPreference, setVideoPreference] = useState<'ai_video' | 'self_filmed'>('ai_video');
  const [isSavingPref, setIsSavingPref] = useState(false);
  const [prefSaveNotice, setPrefSaveNotice] = useState('');
  const [copyNotice, setCopyNotice] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [portalRes, prefRes] = await Promise.all([
          fetch(`/api/portal/${clientId}/data`),
          fetch(`/api/portal/${clientId}/video-preference`),
        ]);

        if (portalRes.ok) {
          const pData = await portalRes.json();
          if (isMounted && pData.tenant) {
            setClientName(pData.tenant.primary_contact_name || '');
            setCompanyName(pData.tenant.name || '');
          }
        }

        if (prefRes.ok) {
          const prefData = await prefRes.json();
          if (isMounted && prefData.preference) {
            setVideoPreference(prefData.preference.video_preference || 'ai_video');
            if (prefData.preference.custom_name) setClientName(prefData.preference.custom_name);
            if (prefData.preference.custom_company) setCompanyName(prefData.preference.custom_company);
          }
        }
      } catch {
        // Fallback remains active
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const scripts: GeneratedScript[] = generateAllScripts({
    client_name: clientName,
    company_name: companyName,
  });

  const handlePreferenceChange = async (newPref: 'ai_video' | 'self_filmed') => {
    setVideoPreference(newPref);
    setIsSavingPref(true);
    setPrefSaveNotice('');

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

      if (res.ok) {
        setPrefSaveNotice(`Production preference updated: ${newPref === 'ai_video' ? 'AI Video Creation' : 'Self-Filmed Video'}`);
      }
    } catch {
      setPrefSaveNotice('Preference updated locally.');
    } finally {
      setIsSavingPref(false);
      setTimeout(() => setPrefSaveNotice(''), 3500);
    }
  };

  const handleCopyScript = (text: string, title: string) => {
    navigator.clipboard.writeText(text);
    setCopyNotice(`Copied "${title}" to clipboard.`);
    setTimeout(() => setCopyNotice(''), 3000);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Video Scripts & Production</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          High-converting video scripts customized with your company and contact information.
        </p>
      </div>

      {prefSaveNotice && (
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
          {prefSaveNotice}
        </div>
      )}

      {copyNotice && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-status-progress-bg)',
            color: 'var(--color-status-progress-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {copyNotice}
        </div>
      )}

      {/* Video Production Preference Workflow Card */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Video Production Preference"
          subtitle="Select how your campaign video creative will be produced"
          action={
            <StatusBadge
              status={videoPreference === 'ai_video' ? 'AI Video Selected' : 'Self-Filmed Selected'}
              variant="done"
            />
          }
        />

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          <Button
            variant={videoPreference === 'ai_video' ? 'primary' : 'outline'}
            onClick={() => handlePreferenceChange('ai_video')}
            disabled={isSavingPref}
          >
            Option 1: Motionz AI Video Creation
          </Button>

          <Button
            variant={videoPreference === 'self_filmed' ? 'primary' : 'outline'}
            onClick={() => handlePreferenceChange('self_filmed')}
            disabled={isSavingPref}
          >
            Option 2: Self-Filmed Video
          </Button>
        </div>

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
              <strong style={{ color: 'var(--color-text-primary)' }}>Workflow State: Motionz AI Video.</strong> The Motionz creative team handles digital synthesis and video rendering using your personalized business variables. No filming required from you.
            </div>
          ) : (
            <div>
              <strong style={{ color: 'var(--color-text-primary)' }}>Workflow State: Self-Filmed Video.</strong> You record yourself reading the 3 provided scripts below on your mobile device in natural lighting, and upload the footage to your CSM for professional editing.
            </div>
          )}
        </div>
      </Card>

      {/* Variable Customizer Card */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Script Personalization Variables"
          subtitle="Interpolated live into all 3 campaign video script templates"
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
            placeholder="e.g. John Smith"
          />

          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. ABC Roofing"
          />
        </div>
      </Card>

      {/* The 3 Interpolated Scripts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {scripts.map((script, idx) => (
          <Card key={script.id}>
            <CardHeader
              title={script.title}
              subtitle={`Template Script ${idx + 1}`}
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
              }}
            >
              {script.content}
            </div>

            <div
              style={{
                marginTop: 'var(--space-3)',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
              }}
            >
              <span>Estimated Reading Time: 25 - 35 seconds</span>
              <span>Personalized for: {companyName}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
