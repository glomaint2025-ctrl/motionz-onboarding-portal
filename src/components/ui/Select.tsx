'use client';

import React, { useState, useRef, useEffect, useId, useCallback } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
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

/** Flattens any React node (string, number, array, nested elements) into plain text. */
function nodeToText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (React.isValidElement(node)) return nodeToText((node.props as any)?.children);
  return '';
}

/** Collects <option> children, looking inside fragments and <optgroup>. */
function collectOptions(children: React.ReactNode, out: SelectOption[]): void {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = (child.props || {}) as any;
    if (child.type === React.Fragment || child.type === 'optgroup') {
      collectOptions(props.children, out);
      return;
    }
    const text = nodeToText(props.children);
    // An <option> without a value keeps the historical meaning here: the empty value.
    const val = props.value !== undefined && props.value !== null ? String(props.value) : '';
    out.push({ value: val, label: text || val, disabled: Boolean(props.disabled) });
  });
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const reactId = useId();

  // Extract options from either props or <option> children
  const options: SelectOption[] = React.useMemo(() => {
    if (propOptions && propOptions.length > 0) {
      return propOptions;
    }
    const extracted: SelectOption[] = [];
    collectOptions(children, extracted);
    return extracted;
  }, [propOptions, children]);

  // Find currently selected option. A value that matches nothing simply shows the placeholder.
  const currentValue = value === undefined || value === null ? '' : String(value);
  const selectedIndex = options.findIndex((opt) => String(opt.value) === currentValue);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || options[0]?.label || '');

  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const baseId = `select-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref]
  );

  /** Next enabled option from `from` in `direction`, or -1 if there is none. No wrap-around. */
  const findEnabled = (from: number, direction: 1 | -1): number => {
    for (let i = from; i >= 0 && i < options.length; i += direction) {
      if (!options[i].disabled) return i;
    }
    return -1;
  };

  const openList = (preferred?: number) => {
    if (disabled) return;
    let start = preferred ?? selectedIndex;
    if (start < 0 || start >= options.length || options[start]?.disabled) start = findEnabled(0, 1);
    setActiveIndex(start);
    setIsOpen(true);
  };

  const closeList = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Escape closes only this dropdown. Handled in the capture phase and stopped there so a
  // parent Modal (which listens for Escape on window) stays open.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  // Keep the keyboard-highlighted option visible in a scrolling list
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const el = document.getElementById(`${baseId}-option-${activeIndex}`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex, baseId]);

  const handleSelect = (optValue: string) => {
    if (disabled) return;
    if (onChange) {
      onChange({ target: { value: optValue, name } });
    }
    closeList();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const { key } = e;

    if (key === 'Tab') {
      if (isOpen) closeList();
      return;
    }

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        openList(selectedIndex >= 0 ? selectedIndex : key === 'ArrowDown' ? findEnabled(0, 1) : findEnabled(options.length - 1, -1));
        return;
      }
      const direction = key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex < 0
        ? (direction === 1 ? findEnabled(0, 1) : findEnabled(options.length - 1, -1))
        : findEnabled(activeIndex + direction, direction);
      if (next >= 0) setActiveIndex(next);
      return;
    }

    if (key === 'Home' || key === 'End') {
      e.preventDefault();
      const target = key === 'Home' ? findEnabled(0, 1) : findEnabled(options.length - 1, -1);
      if (!isOpen) openList(target);
      else if (target >= 0) setActiveIndex(target);
      return;
    }

    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        openList();
        return;
      }
      const active = options[activeIndex];
      if (active && !active.disabled) handleSelect(active.value);
      else closeList();
      return;
    }

    // Type-ahead: jump to the first option starting with the typed characters
    if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      const buffer = now - typeahead.current.at > 700 ? key : typeahead.current.text + key;
      typeahead.current = { text: buffer, at: now };
      const needle = buffer.toLowerCase();
      const match = options.findIndex((opt) => !opt.disabled && opt.label.toLowerCase().startsWith(needle));
      if (match >= 0) {
        e.preventDefault();
        if (!isOpen) openList(match);
        else setActiveIndex(match);
      }
    }
  };

  return (
    <div className={`ui-form-group ${className}`.trim()} ref={setContainerRef}>
      {label && (
        <label htmlFor={selectId} id={`${baseId}-label`} className="ui-label">
          {label}
        </label>
      )}

      <div className="ui-custom-select-wrapper" style={{ position: 'relative', width: '100%', zIndex: isOpen ? 50 : undefined }}>
        {/* Hidden native input for standard form serialization */}
        {name && <input type="hidden" name={name} value={value ?? ''} />}

        {/* Custom styled trigger button: keeps focus while the list is open (aria-activedescendant pattern) */}
        <button
          ref={triggerRef}
          type="button"
          id={selectId}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            triggerRef.current?.focus();
            if (isOpen) closeList();
            else openList();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => {
            // Stops the browser from turning Space into a click that would toggle the list again
            if (e.key === ' ') e.preventDefault();
          }}
          className={`ui-custom-select-trigger ${size === 'sm' ? 'ui-custom-select-trigger-sm' : ''} ${isOpen ? 'is-open' : ''} ${error ? 'ui-input-error' : ''}`}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-labelledby={label && selectId ? `${baseId}-label ${selectId}` : undefined}
          aria-invalid={error ? true : undefined}
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
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Custom floating options popup */}
        {isOpen && !disabled && (
          <div
            id={listboxId}
            className={`ui-custom-select-dropdown ${dropUp ? 'is-dropup' : ''}`}
            role="listbox"
            aria-labelledby={label ? `${baseId}-label` : undefined}
          >
            {options.length === 0 ? (
              <div className="ui-custom-select-empty">No options available</div>
            ) : (
              options.map((opt, index) => {
                const isSelected = index === selectedIndex;
                const isActive = index === activeIndex;
                return (
                  <div
                    key={`${index}-${opt.value}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    className={`ui-custom-select-option ${isSelected ? 'is-selected' : ''} ${isActive ? 'is-active' : ''}`}
                    style={{
                      ...(isActive && !isSelected ? { backgroundColor: 'var(--color-bg-hover)' } : {}),
                      ...(isActive ? { outline: '2px solid var(--color-primary-text)', outlineOffset: '-2px' } : {}),
                      ...(opt.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                    }}
                    // Keep focus on the trigger so keyboard control continues after a mouse press
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => !opt.disabled && setActiveIndex(index)}
                    onClick={() => !opt.disabled && handleSelect(opt.value)}
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
                        aria-hidden="true"
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
