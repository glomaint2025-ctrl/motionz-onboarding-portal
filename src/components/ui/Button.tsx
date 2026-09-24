import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
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
  const variantClass = `ui-btn-${variant}`;
  const sizeClass = size === 'sm' ? 'ui-btn-sm' : size === 'lg' ? 'ui-btn-lg' : '';
  const fullWidthClass = fullWidth ? 'ui-btn-full' : '';

  return (
    <button
      className={`ui-btn ${variantClass} ${sizeClass} ${fullWidthClass} ${className}`.trim()}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
