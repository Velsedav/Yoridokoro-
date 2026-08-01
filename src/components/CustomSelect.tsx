import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { playSFX, SFX } from '../lib/sounds';

export interface SelectOption {
    value: string;
    label: string | React.ReactNode;
}

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    style?: React.CSSProperties;
    className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, style, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const openAndFocus = () => {
        setIsOpen(true);
        requestAnimationFrame(() => {
            const choices = containerRef.current?.querySelectorAll<HTMLButtonElement>('.custom-select-option');
            const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
            choices?.[selectedIndex]?.focus();
        });
    };

    const selectOption = (optionValue: string) => {
        playSFX(SFX.CHECK);
        onChange(optionValue);
        setIsOpen(false);
        requestAnimationFrame(() => containerRef.current?.querySelector<HTMLButtonElement>('.custom-select-value')?.focus());
    };

    return (
        <div
            className={`custom-select-container ${className || ''}`}
            ref={containerRef}
            style={style}
            onMouseEnter={() => playSFX(SFX.HOVER)}
        >
            <button type="button" className={`custom-select-value ${isOpen ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => { if (!isOpen) { playSFX(SFX.ENTER_MENU); openAndFocus(); } else setIsOpen(false); }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openAndFocus(); } }}>
                <span>{selectedOption?.label}</span>
                <ChevronDown size={16} aria-hidden="true" />
            </button>
            {isOpen && (
                <div className="custom-select-dropdown" role="listbox">
                    {options.map((opt, index) => (
                        <button type="button"
                            key={opt.value}
                            className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
                            role="option"
                            aria-selected={opt.value === value}
                            onMouseEnter={() => playSFX(SFX.HOVER)}
                            onClick={(e) => {
                                e.stopPropagation();
                                selectOption(opt.value);
                            }}
                            onKeyDown={event => {
                                if (event.key === 'Escape') { event.preventDefault(); setIsOpen(false); requestAnimationFrame(() => containerRef.current?.querySelector<HTMLButtonElement>('.custom-select-value')?.focus()); }
                                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next=(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length; containerRef.current?.querySelectorAll<HTMLButtonElement>('.custom-select-option')[next]?.focus(); }
                                if (event.key === 'Home') { event.preventDefault(); containerRef.current?.querySelectorAll<HTMLButtonElement>('.custom-select-option')[0]?.focus(); }
                                if (event.key === 'End') { event.preventDefault(); containerRef.current?.querySelectorAll<HTMLButtonElement>('.custom-select-option')[options.length-1]?.focus(); }
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
