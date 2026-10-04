import React from 'react';

export interface MotionzMarkProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'width' | 'height' | 'alt'> {
  size?: number;
  /** Accessible name. When omitted the mark is decorative (hidden from assistive tech). */
  title?: string;
}

/*
 * The client's logo (orange badge with the robot face), pre-rendered from
 * public/brand/logo.webp at 64/128/256px with rounded corners.
 * Served from /icons because the auth middleware only lets /icons/* through
 * unauthenticated (the login page needs the logo before a session exists).
 * Identical copies live in public/brand/ for use outside the app.
 */
const LOGO_SIZES = [64, 128, 256] as const;
const logoSrc = (px: number) => `/icons/logo-${LOGO_SIZES.find((s) => s >= px) ?? 256}.png`;

/** Motionz app mark: the client's logo badge as a fixed-size square image. */
export const MotionzMark: React.FC<MotionzMarkProps> = ({ size = 32, title, className = '', style, ...props }) => (
  // eslint-disable-next-line @next/next/no-img-element -- tiny static asset; must load without auth and without the image optimizer
  <img
    src={logoSrc(size)}
    srcSet={`${logoSrc(size)} 1x, ${logoSrc(size * 2)} 2x`}
    width={size}
    height={size}
    alt={title ?? ''}
    aria-hidden={title ? undefined : true}
    decoding="async"
    draggable={false}
    className={`brand-mark ${className}`.trim()}
    style={{ width: size, height: size, ...style }}
    {...props}
  />
);

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
