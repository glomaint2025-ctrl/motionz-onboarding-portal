'use client';

import React from 'react';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';

export const PortalPreloader: React.FC = () => {
  return (
    <div className="preloader-screen" role="status" aria-live="polite">
      <div className="preloader-inner">
        <div className="preloader-logo-glow">
          <MotionzWordmark size={44} />
        </div>

        <div className="preloader-progress-track" aria-hidden="true">
          <div className="preloader-progress-bar" />
        </div>

        <div className="preloader-pulsing-text">Getting your portal ready...</div>
      </div>
    </div>
  );
};
