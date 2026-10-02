'use client';

import React from 'react';

export const PortalPreloader: React.FC = () => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: '#070d18',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {/* Subtle radial ambient glow */}
        <div
          className="preloader-logo-glow"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '260px',
            height: '160px',
            background: 'radial-gradient(ellipse at center, rgba(56, 189, 248, 0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Brand identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              fontSize: '36px',
              fontWeight: 800,
              color: '#38bdf8',
              letterSpacing: '-0.03em',
            }}
          >
            Motionz
          </span>
          <span
            style={{
              fontSize: '11px',
              color: '#94a3b8',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              padding: '3px 8px',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Client Portal
          </span>
        </div>

        {/* Shimmer progress bar */}
        <div className="preloader-progress-track">
          <div className="preloader-progress-bar" />
        </div>

        {/* Pulsing blinking text */}
        <div className="preloader-pulsing-text">
          Loading workspace...
        </div>
      </div>
    </div>
  );
};
