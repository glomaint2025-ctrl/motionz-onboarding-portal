import React from 'react';

export interface MotionzMarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  title?: string;
}

/**
 * Motionz app mark: a rounded tile in the brand gradient with a flowing "M".
 * The same geometry is used for the favicon and PWA icons.
 */
export const MotionzMark: React.FC<MotionzMarkProps> = ({ size = 32, title, ...props }) => {
  // Unique per instance: a gradient referenced by id from a hidden (display:none) copy
  // of the logo would otherwise fail to paint in visible copies.
  const gradientId = `motionz-mark-${React.useId().replace(/:/g, '')}`;
  return (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 48 48"
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    focusable="false"
    {...props}
  >
    {title && <title>{title}</title>}
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#4CC0E6" />
        <stop offset="0.55" stopColor="#2D8FC4" />
        <stop offset="1" stopColor="#3466C9" />
      </linearGradient>
    </defs>
    <rect width="48" height="48" rx="12" fill={`url(#${gradientId})`} />
    <path
      d="M12.5 33V16.5L24 28l11.5-11.5V33"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
  );
};

export interface MotionzWordmarkProps {
  size?: number;
  /** Optional small pill after the name, e.g. "Admin". */
  tag?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Mark + "Motionz" wordmark. The mark is decorative; the visible text is the accessible name. */
export const MotionzWordmark: React.FC<MotionzWordmarkProps> = ({ size = 30, tag, className = '', style }) => (
  <span className={`brand-wordmark ${className}`.trim()} style={style}>
    <MotionzMark size={size} />
    <span className="brand-wordmark-text" style={{ fontSize: Math.round(size * 0.64) }}>
      Motionz
    </span>
    {tag && <span className="brand-wordmark-tag">{tag}</span>}
  </span>
);
