import React from 'react';
import type { BrandLogoProps } from './SlackLogo';

/** Google Sheets icon: green sheet with a folded corner and a white table. `size` sets the height. */
export const GoogleSheetsLogo: React.FC<BrandLogoProps> = ({ size = 24, title = 'Google Sheets', ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={(size * 40) / 52}
    height={size}
    viewBox="0 0 40 52"
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    focusable="false"
    {...props}
  >
    {title && <title>{title}</title>}
    <path fill="#0F9D58" d="M4 0h22l14 14v34a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" />
    <path fill="#0B7A45" fillOpacity="0.45" d="M27 14 40 27V14z" />
    <path fill="#87CEAC" d="M26 0l14 14H30a4 4 0 0 1-4-4z" />
    <rect x="9" y="24" width="22" height="18" rx="1.5" fill="#F1F8F4" />
    <rect x="17.4" y="24" width="1.8" height="18" fill="#0F9D58" />
    <rect x="9" y="29.6" width="22" height="1.8" fill="#0F9D58" />
    <rect x="9" y="35.6" width="22" height="1.8" fill="#0F9D58" />
  </svg>
);
