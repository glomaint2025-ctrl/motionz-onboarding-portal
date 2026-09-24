import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  id,
  className = '',
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const errorClass = error ? 'ui-input-error' : '';

  return (
    <div className="ui-form-group">
      {label && (
        <label htmlFor={inputId} className="ui-label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`ui-input ${errorClass} ${className}`.trim()}
        {...props}
      />
      {error && <span className="ui-error-text">{error}</span>}
      {!error && helperText && <span className="ui-helper-text">{helperText}</span>}
    </div>
  );
});

Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  helperText,
  id,
  className = '',
  children,
  ...props
}, ref) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const errorClass = error ? 'ui-input-error' : '';

  return (
    <div className="ui-form-group">
      {label && (
        <label htmlFor={selectId} className="ui-label">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`ui-select ${errorClass} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      {error && <span className="ui-error-text">{error}</span>}
      {!error && helperText && <span className="ui-helper-text">{helperText}</span>}
    </div>
  );
});

Select.displayName = 'Select';
