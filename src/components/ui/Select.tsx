'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  error?: string;
  helperText?: string;
  value?: string;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  name?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  options?: SelectOption[];
  children?: React.ReactNode;
  disabled?: boolean;
  dropUp?: boolean;
  size?: 'sm' | 'md';
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(({
  label,
  error,
  helperText,
  value,
  onChange,
  name,
  id,
  className = '',
  placeholder = 'Select an option...',
  options: propOptions,
  children,
  disabled = false,
  dropUp = false,
  size = 'md',
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract options from either props or <option> children
  const options: SelectOption[] = React.useMemo(() => {
    if (propOptions && propOptions.length > 0) {
      return propOptions;
    }
    const extracted: SelectOption[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.props) {
        const val = child.props.value !== undefined ? String(child.props.value) : '';
        const lbl = child.props.children ? String(child.props.children) : val;
        extracted.push({ value: val, label: lbl });
      }
    });
    return extracted;
  }, [propOptions, children]);

  // Find currently selected option
  const selectedOption = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || options[0]?.label || '');

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (optValue: string) => {
    if (disabled) return;
    if (onChange) {
      onChange({ target: { value: optValue, name } });
    }
    setIsOpen(false);
  };

  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={`ui-form-group ${className}`.trim()} ref={containerRef}>
      {label && (
        <label htmlFor={selectId} className="ui-label">
          {label}
        </label>
      )}

      <div className="ui-custom-select-wrapper" style={{ position: 'relative', width: '100%', zIndex: isOpen ? 50 : undefined }}>
        {/* Hidden native input for standard form serialization */}
        {name && <input type="hidden" name={name} value={value ?? ''} />}

        {/* Custom styled trigger button */}
        <button
          type="button"
          id={selectId}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className={`ui-custom-select-trigger ${size === 'sm' ? 'ui-custom-select-trigger-sm' : ''} ${isOpen ? 'is-open' : ''} ${error ? 'ui-input-error' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="ui-custom-select-value">{displayLabel}</span>
          <svg
            className={`ui-custom-select-arrow ${isOpen ? 'is-open' : ''}`}
            width={size === 'sm' ? 14 : 16}
            height={size === 'sm' ? 14 : 16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Custom floating options popup */}
        {isOpen && !disabled && (
          <div className={`ui-custom-select-dropdown ${dropUp ? 'is-dropup' : ''}`} role="listbox">
            {options.length === 0 ? (
              <div className="ui-custom-select-empty">No options available</div>
            ) : (
              options.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    className={`ui-custom-select-option ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <svg
                        className="ui-custom-select-check"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {error && <span className="ui-error-text">{error}</span>}
      {!error && helperText && <span className="ui-helper-text">{helperText}</span>}
    </div>
  );
});

Select.displayName = 'Select';
