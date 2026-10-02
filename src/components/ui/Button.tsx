import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: React.ReactNode;
}

/**
 * Class names for something that should look like a button but is not a <button>,
 * e.g. a Next <Link> or an external <a>. Avoids nesting a button inside a link.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string } = {}): string {
  const sizeClass = size === 'sm' ? 'ui-btn-sm' : size === 'lg' ? 'ui-btn-lg' : '';
  return ['ui-btn', `ui-btn-${variant}`, sizeClass, fullWidth ? 'ui-btn-full' : '', className]
    .filter(Boolean)
    .join(' ');
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  disabled = false,
  children,
  ...props
}) => {
  return (
    <button
      className={buttonClasses({ variant, size, fullWidth, className })}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
