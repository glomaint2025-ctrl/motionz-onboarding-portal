import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  showPasswordToggle?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  id,
  type,
  className = '',
  showPasswordToggle,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const errorClass = error ? 'ui-input-error' : '';

  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;
  const shouldRenderToggle = isPassword || showPasswordToggle;

  return (
    <div className="ui-form-group">
      {label && (
        <label htmlFor={inputId} className="ui-label">
          {label}
        </label>
      )}
      <div className={shouldRenderToggle ? 'ui-input-password-wrapper' : undefined} style={shouldRenderToggle ? { position: 'relative', display: 'flex', alignItems: 'center', width: '100%' } : undefined}>
        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          className={`ui-input ${errorClass} ${shouldRenderToggle ? 'ui-input-with-toggle' : ''} ${className}`.trim()}
          style={shouldRenderToggle ? { paddingRight: '40px' } : undefined}
          {...props}
        />
        {shouldRenderToggle && (
          <button
            type="button"
            className="ui-password-toggle-btn"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              color: showPassword ? 'var(--color-primary, #34A5CB)' : 'var(--color-text-muted, #94a3b8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm, 4px)',
              transition: 'color var(--transition-fast, 150ms)',
            }}
          >
            {showPassword ? (
              /* Eye Off (Hidden) SVG */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              /* Eye (Visible) SVG */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && <span className="ui-error-text">{error}</span>}
      {!error && helperText && <span className="ui-helper-text">{helperText}</span>}
    </div>
  );
});

Input.displayName = 'Input';

export { Select, type SelectProps, type SelectOption } from './Select';

