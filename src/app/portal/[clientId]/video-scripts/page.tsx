'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, buttonClasses } from '@/components/ui';
import {
  generateScriptsFromTemplates,
  estimateReadSeconds,
  countWords,
  GeneratedScript,
  TESTIMONIAL_NAME_PLACEHOLDER,
} from '@/lib/scripts/template-engine';
import {
  AdScriptCategory,
  REQUIRED_SCRIPT_CATEGORIES,
  SELF_FILMED_CATEGORIES,
  SCRIPT_CATEGORY_LABELS,
  SelectedScripts,
} from '@/lib/scripts/ad-script-library';
import { PORTAL_LINKS } from '@/lib/portal-links';
import { fetchPortalData } from '@/lib/portal-data-client';

interface StoredScriptTemplate {
  id: string;
  title: string;
  script_content: string;
  category?: string | null;
}

type ProductionMode = 'ai_video' | 'self_filmed';
type Notice = { text: string; isError: boolean } | null;

/** Recording guidelines, from the Motionz "Ad Scripts" document. */
const RECORDING_GUIDELINES: string[] = [
  'Record vertically (portrait mode) so it looks right on a phone.',
  'Pick a quiet place with no background noise.',
  'Use a camera as good as an iPhone 13 or newer.',
  'Wear professional attire and keep your face in the center of the frame.',
  'Record 3 ad scripts: one each from Pain Point, Testimonials and Trustworthy. Choose whichever one you want from each.',
  'You or a partner can film them. A teleprompter app from the app store makes reading your script easier.',
  'Speak with good tonality, enthusiasm and excitement about the transformation you are promoting.',
  'Talk to your ideal customer, as you described them in your onboarding forms.',
];

function readTimeLabel(text: string): string {
  const seconds = estimateReadSeconds(text);
  if (seconds === 0) return '';
  const duration = seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
  return `About ${duration} to read aloud (${countWords(text)} words)`;
}

const mutedText: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-secondary)',
};

const scriptBox: React.CSSProperties = {
  padding: 'var(--space-4)',
  backgroundColor: 'var(--color-bg-surface)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-subtle)',
  fontSize: 'var(--font-size-sm)',
  lineHeight: '1.6',
  color: 'var(--color-text-primary)',
  whiteSpace: 'pre-wrap',
};

export default function VideoScriptsPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [viewerRole, setViewerRole] = useState<string | null>(null);

  const [savedMode, setSavedMode] = useState<ProductionMode | null>(null);
  const [viewMode, setViewMode] = useState<ProductionMode | null>(null);
  const [picks, setPicks] = useState<SelectedScripts>({});
  const [activeCategory, setActiveCategory] = useState<AdScriptCategory>('pain_point');

  const [templates, setTemplates] = useState<StoredScriptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [scriptsError, setScriptsError] = useState('');
  const [prefLoadError, setPrefLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [portalRes, prefRes, scriptsRes] = await Promise.all([
          fetchPortalData(clientId),
          fetch(`/api/portal/${clientId}/video-preference`),
          fetch(`/api/portal/${clientId}/script-templates`),
        ]);
        if (!isMounted) return;

        if (scriptsRes.ok) {
          const sData = await scriptsRes.json();
          if (isMounted) setTemplates(Array.isArray(sData.scripts) ? sData.scripts : []);
        } else {
          setScriptsError('Video scripts could not be loaded. Please refresh the page.');
        }

        if (portalRes.ok) {
          const pData = await portalRes.json();
          if (!isMounted) return;
          if (pData.tenant) {
            setClientName(pData.tenant.primary_contact_name || '');
            setCompanyName(pData.tenant.name || '');
          }
          setViewerRole(pData.viewer?.role || null);
        }

        if (prefRes.ok) {
          const prefData = await prefRes.json();
          if (!isMounted) return;
          const saved = prefData.preference?.video_preference;
          if (saved === 'ai_video' || saved === 'self_filmed') {
            setSavedMode(saved);
            setViewMode(saved);
          }
          if (prefData.selected_scripts && typeof prefData.selected_scripts === 'object') {
            setPicks(prefData.selected_scripts);
          }
        } else {
          setPrefLoadError('Your saved choices could not be loaded. Please refresh the page.');
        }
      } catch {
        if (isMounted) setScriptsError('Could not reach the server. Please check your connection and refresh the page.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Team members can read everything, but only the account owner saves choices (the server enforces this).
  const canEdit = viewerRole !== 'client_member';

  const scripts: GeneratedScript[] = useMemo(
    () => generateScriptsFromTemplates(templates, { client_name: clientName, company_name: companyName }),
    [templates, clientName, companyName]
  );
  const aiScripts = scripts.filter((s) => s.category === 'ai_video');
  const adScripts = scripts.filter((s) => s.category !== 'ai_video');
  const scriptById = (id?: string) => (id ? adScripts.find((s) => s.id === id) : undefined);
  const chosenCount = REQUIRED_SCRIPT_CATEGORIES.filter((c) => scriptById(picks[c])).length;
  const requiredCount = REQUIRED_SCRIPT_CATEGORIES.length;

  const showNotice = (next: Notice) => {
    setNotice(next);
    if (next && !next.isError) setTimeout(() => setNotice((current) => (current === next ? null : current)), 4000);
  };

  const postPreference = async (payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/portal/${clientId}/video-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { ok: true } : { ok: false, error: data.error };
    } catch {
      return { ok: false, error: 'Could not reach the server.' };
    }
  };

  const handleModeChange = async (mode: ProductionMode) => {
    setViewMode(mode);
    if (!canEdit || mode === savedMode) return;

    setSaving(true);
    setNotice(null);
    const result = await postPreference({ video_preference: mode });
    if (result.ok) {
      setSavedMode(mode);
      showNotice({ text: `Saved: ${mode === 'ai_video' ? 'AI Video' : 'Self-Filmed'}.`, isError: false });
    } else {
      setViewMode(savedMode);
      showNotice({ text: `${result.error || 'Your choice could not be saved.'} Nothing was changed.`, isError: true });
    }
    setSaving(false);
  };

  const handleTogglePick = async (script: GeneratedScript) => {
    if (!canEdit || script.category === 'ai_video') return;
    const category = script.category as AdScriptCategory;
    const previous = picks;
    const next: SelectedScripts = { ...picks };
    const removing = picks[category] === script.id;
    if (removing) delete next[category];
    else next[category] = script.id;

    setPicks(next);
    setSaving(true);
    setNotice(null);
    const result = await postPreference({ selected_scripts: next });
    if (result.ok) {
      showNotice({
        text: removing
          ? `Removed "${script.title}" from your scripts.`
          : `Saved "${script.title}" as your ${SCRIPT_CATEGORY_LABELS[category]} script.`,
        isError: false,
      });
    } else {
      setPicks(previous);
      showNotice({ text: `${result.error || 'Your pick could not be saved.'} Nothing was changed.`, isError: true });
    }
    setSaving(false);
  };

  const handleCopy = async (script: GeneratedScript) => {
    try {
      await navigator.clipboard.writeText(script.content);
      showNotice({ text: `Copied "${script.title}" to your clipboard.`, isError: false });
    } catch {
      showNotice({ text: 'Copy failed. Select the script text and copy it manually.', isError: true });
    }
  };

  const renderScriptCard = (script: GeneratedScript, options: { pickable: boolean }) => {
    const category = script.category as AdScriptCategory;
    const isPicked = options.pickable && picks[category] === script.id;
    const needsCustomerName = script.content.includes(TESTIMONIAL_NAME_PLACEHOLDER);
    return (
      <Card
        key={script.id}
        style={isPicked ? { borderColor: 'var(--color-primary)', boxShadow: '0 0 0 1px var(--color-primary)' } : undefined}
      >
        <CardHeader
          title={script.title}
          subtitle={readTimeLabel(script.content)}
          action={isPicked ? <StatusBadge status="Your pick" variant="done" /> : undefined}
        />

        <div style={scriptBox}>{script.content}</div>

        {needsCustomerName && (
          <p style={{ ...mutedText, marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
            Before you record, replace {TESTIMONIAL_NAME_PLACEHOLDER} with the name of one of your real customers.
          </p>
        )}

        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={() => handleCopy(script)}>
            Copy script
          </Button>
          {options.pickable && canEdit && (
            <Button
              variant={isPicked ? 'secondary' : 'primary'}
              size="sm"
              aria-pressed={isPicked}
              disabled={saving}
              onClick={() => handleTogglePick(script)}
            >
              {isPicked ? 'Remove my pick' : 'Use this one'}
            </Button>
          )}
        </div>
      </Card>
    );
  };

  const categoryScripts = adScripts.filter((s) => s.category === activeCategory);

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Video Scripts</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Ready-to-use scripts with your name and company already filled in.
        </p>
      </div>

      {notice && (
        <div
          role={notice.isError ? 'alert' : 'status'}
          style={{
            padding: 'var(--space-3)',
            backgroundColor: notice.isError ? 'var(--color-status-danger-bg)' : 'var(--color-status-done-bg)',
            color: notice.isError ? 'var(--color-status-danger-text)' : 'var(--color-status-done-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {notice.text}
        </div>
      )}

      {/* Step 1: AI Video or Self-Filmed */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Step 1: Choose how your videos are made"
          subtitle="You can look at both options. Your choice is saved for your Motionz team."
          action={
            <StatusBadge
              status={savedMode === 'ai_video' ? 'AI Video chosen' : savedMode === 'self_filmed' ? 'Self-Filmed chosen' : 'Not chosen yet'}
              variant={savedMode ? 'done' : 'pending'}
            />
          }
        />

        {prefLoadError && (
          <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-status-danger-text)' }}>
            {prefLoadError}
          </p>
        )}

        <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {(
            [
              {
                mode: 'ai_video' as ProductionMode,
                label: 'AI Video',
                detail: 'Educational videos made for you by Motionz. No filming needed.',
              },
              {
                mode: 'self_filmed' as ProductionMode,
                label: 'Self-Filmed',
                detail: 'You (or a partner) record ad scripts on your phone and send them to us.',
              },
            ]
          ).map((option) => (
            <div key={option.mode}>
              <Button
                variant={viewMode === option.mode ? 'primary' : 'outline'}
                fullWidth
                aria-pressed={viewMode === option.mode}
                disabled={saving || loading}
                onClick={() => handleModeChange(option.mode)}
              >
                {option.label}
              </Button>
              <p style={{ ...mutedText, marginTop: 'var(--space-2)' }}>{option.detail}</p>
            </div>
          ))}
        </div>

        {!canEdit && (
          <p style={{ ...mutedText, marginTop: 'var(--space-4)' }}>
            You can view both options. Only the account owner can save the choice and pick scripts.
          </p>
        )}
      </Card>

      {loading && (
        <Card>
          <p style={mutedText}>Loading video scripts...</p>
        </Card>
      )}

      {!loading && scriptsError && (
        <Card>
          <p style={{ ...mutedText, color: 'var(--color-status-danger-text)' }}>{scriptsError}</p>
        </Card>
      )}

      {!loading && !scriptsError && !viewMode && (
        <Card>
          <p style={mutedText}>Choose AI Video or Self-Filmed above to see your scripts.</p>
        </Card>
      )}

      {/* ------------------------------------------------------------ AI Video */}
      {!loading && !scriptsError && viewMode === 'ai_video' && (
        <div>
          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <CardHeader title="AI Video: Motionz makes these for you" />
            <p style={mutedText}>
              These are educational videos, not ads. The Motionz team produces them using the scripts below, with your
              name and company filled in. You do not need to pick or record anything. If a detail looks wrong, tell
              your CSM.
            </p>
          </Card>

          {aiScripts.length === 0 ? (
            <Card>
              <p style={mutedText}>No AI video scripts are available yet. Your Motionz team will publish them here.</p>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {aiScripts.map((script) => renderScriptCard(script, { pickable: false }))}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------- Self-Filmed */}
      {!loading && !scriptsError && viewMode === 'self_filmed' && (
        <div>
          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <CardHeader title="How to record your ads" subtitle="A quick checklist before you press record" />
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--space-2)' }}>
              {RECORDING_GUIDELINES.map((line) => (
                <li
                  key={line}
                  style={{ display: 'flex', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}
                >
                  <span aria-hidden="true" style={{ color: 'var(--color-primary)', fontWeight: 'var(--font-weight-bold)' }}>
                    ✓
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p style={{ ...mutedText, marginTop: 'var(--space-3)' }}>
              Questions? Reach out to your CSM.
            </p>
          </Card>

          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <CardHeader title="Your 3 steps" />
            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'grid',
                gap: 'var(--space-3)',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              }}
            >
              {[
                '1. Pick one script from each: Pain Point, Testimonials, Trustworthy',
                '2. Record each one (vertical)',
                '3. Send your videos to your CSM on Slack',
              ].map((step, index) => (
                <li
                  key={step}
                  style={{
                    padding: 'var(--space-3)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-surface)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                  }}
                >
                  <span>{step}</span>
                  {index === 2 && (
                    <a
                      href={PORTAL_LINKS.slackInvite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses({ variant: 'primary', size: 'sm' })}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Open Slack
                    </a>
                  )}
                </li>
              ))}
            </ol>
          </Card>

          {adScripts.length === 0 ? (
            <Card>
              <p style={mutedText}>No ad scripts are available yet. Your Motionz team will publish them here.</p>
            </Card>
          ) : (
            <>
              <Card style={{ marginBottom: 'var(--space-4)' }}>
                <CardHeader
                  title="Your 3 scripts"
                  subtitle={chosenCount === requiredCount ? 'All chosen' : 'Pick one script for each type below.'}
                  action={
                    <StatusBadge
                      status={chosenCount === requiredCount ? 'Ready to record' : `${chosenCount} of ${requiredCount} chosen`}
                      variant={chosenCount === requiredCount ? 'done' : 'pending'}
                    />
                  }
                />
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  {SELF_FILMED_CATEGORIES.map((category) => {
                    const picked = scriptById(picks[category]);
                    const isRequired = REQUIRED_SCRIPT_CATEGORIES.includes(category);
                    if (!isRequired && !picked) return null;
                    return (
                      <div
                        key={category}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                          flexWrap: 'wrap',
                          padding: 'var(--space-2) var(--space-3)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 'var(--font-size-sm)',
                        }}
                      >
                        <span>
                          <strong style={{ color: 'var(--color-text-primary)' }}>
                            {SCRIPT_CATEGORY_LABELS[category]}
                            {!isRequired ? ' (optional)' : ''}:
                          </strong>{' '}
                          <span style={{ color: picked ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                            {picked ? picked.title : 'Not chosen yet'}
                          </span>
                        </span>
                        <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          {picked && (
                            <Button variant="outline" size="sm" onClick={() => handleCopy(picked)}>
                              Copy script
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setActiveCategory(category)}>
                            {picked ? 'View' : canEdit ? 'Choose' : 'Browse'}
                          </Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <div
                role="tablist"
                aria-label="Script types"
                style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}
              >
                {SELF_FILMED_CATEGORIES.map((category) => {
                  const count = adScripts.filter((s) => s.category === category).length;
                  const isActive = activeCategory === category;
                  return (
                    <Button
                      key={category}
                      role="tab"
                      aria-selected={isActive}
                      variant={isActive ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setActiveCategory(category)}
                    >
                      {SCRIPT_CATEGORY_LABELS[category]} ({count})
                    </Button>
                  );
                })}
              </div>

              {categoryScripts.length === 0 ? (
                <Card>
                  <p style={mutedText}>
                    No {SCRIPT_CATEGORY_LABELS[activeCategory]} scripts are available yet. Your Motionz team will publish
                    them here.
                  </p>
                </Card>
              ) : (
                <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {categoryScripts.map((script) => renderScriptCard(script, { pickable: true }))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
