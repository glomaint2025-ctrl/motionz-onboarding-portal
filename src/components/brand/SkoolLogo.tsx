import React from 'react';
import type { BrandLogoProps } from './SlackLogo';

export interface SkoolLogoProps extends BrandLogoProps {
  /** 'wordmark' renders the multicolour "skool" word; 'mark' renders just the "s". */
  variant?: 'wordmark' | 'mark';
}

const LETTERS: Array<[string, string]> = [
  ['s', '#2F6BE0'],
  ['k', '#E5443A'],
  ['o', '#F4B629'],
  ['o', '#2F6BE0'],
  ['l', '#3DA55D'],
];

/** Skool wordmark drawn in its multicolour letters. `size` sets the height. */
export const SkoolLogo: React.FC<SkoolLogoProps> = ({
  size = 24,
  title = 'Skool',
  variant = 'wordmark',
  ...props
}) => {
  const isMark = variant === 'mark';
  const viewBox = isMark ? '0 0 40 40' : '0 0 104 40';
  const width = isMark ? size : (size * 104) / 40;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={size}
      viewBox={viewBox}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title && <title>{title}</title>}
      <text
        x={isMark ? 20 : 52}
        y={isMark ? 31 : 29}
        textAnchor="middle"
        fontFamily="'Arial Rounded MT Bold', Nunito, Inter, 'Helvetica Neue', Arial, sans-serif"
        fontWeight={800}
        fontSize={isMark ? 40 : 36}
        letterSpacing={isMark ? 0 : -1.2}
      >
        {(isMark ? LETTERS.slice(0, 1) : LETTERS).map(([letter, color], i) => (
          <tspan key={i} fill={color}>
            {letter}
          </tspan>
        ))}
      </text>
    </svg>
  );
};
