'use client';

import React from 'react';
import { PORTAL_MODULES } from '@/lib/portal-modules';

type PortalModule = (typeof PORTAL_MODULES)[number] & { memberSelectable?: boolean };

/**
 * Portal sections a team member can be given: switched on for this client
 * (a missing switch counts as on) and not marked as owner-only.
 */
export function memberSelectableModules(features: Record<string, boolean>): PortalModule[] {
  return (PORTAL_MODULES as PortalModule[]).filter(
    (m) => features[m.key] !== false && m.memberSelectable !== false
  );
}

export interface MemberModulePickerProps {
  /** This client's on/off switches for each portal section. */
  features: Record<string, boolean>;
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/** Tick-list of the portal sections one team member may open. */
export const MemberModulePicker: React.FC<MemberModulePickerProps> = ({ features, selected, onChange, disabled }) => {
  const modules = memberSelectableModules(features);
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  if (modules.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
        No portal sections are switched on for this client yet.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <button
          type="button"
          className="ui-btn-action-portal"
          disabled={disabled}
          onClick={() => onChange(modules.map((m) => m.key))}
        >
          Select all
        </button>
        <button type="button" className="ui-btn-action-portal" disabled={disabled} onClick={() => onChange([])}>
          Clear all
        </button>
      </div>
      <div className="permission-grid" role="group" aria-label="Portal sections this person can open">
        {modules.map((module) => {
          const isChecked = selected.includes(module.key);
          return (
            <button
              key={module.key}
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              disabled={disabled}
              className={`permission-card ${isChecked ? 'is-checked' : ''}`.trim()}
              onClick={() => toggle(module.key)}
              style={{ textAlign: 'left', font: 'inherit', color: 'inherit', width: '100%' }}
            >
              <span className="permission-checkbox" aria-hidden="true">
                {isChecked && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span className="permission-label-wrap">
                <span className="permission-label-row">
                  <span className="permission-title">{module.label}</span>
                </span>
                <span className="permission-desc">{module.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
