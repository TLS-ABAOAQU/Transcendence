import React, { useRef, useEffect, useCallback } from 'react';
import './WheelPicker.css';

interface WheelColumnItem {
    value: number;
    label: string;
}

interface WheelColumnProps {
    items: WheelColumnItem[];
    selectedValue: number;
    onChange: (value: number) => void;
    label?: string;
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const SPACER_HEIGHT = ITEM_HEIGHT * 2; // 2行分のスペーサー

export const WheelColumn: React.FC<WheelColumnProps> = ({
    items,
    selectedValue,
    onChange,
    label,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const isScrollingRef = useRef(false);

    // Update visual styles based on distance from center
    const updateVisuals = useCallback(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;

        const scrollTop = scroll.scrollTop;
        const containerHeight = scroll.clientHeight;
        const centerY = scrollTop + containerHeight / 2;

        const itemElements = scroll.querySelectorAll('.wheel-picker-item');
        itemElements.forEach((item) => {
            const itemEl = item as HTMLElement;
            const itemTop = itemEl.offsetTop;
            const itemCenter = itemTop + ITEM_HEIGHT / 2;
            const distance = Math.abs(centerY - itemCenter);
            const rowsFromCenter = distance / ITEM_HEIGHT;

            if (rowsFromCenter < 0.5) {
                itemEl.style.transform = 'scale(1.15)';
                itemEl.style.opacity = '1';
                itemEl.style.fontWeight = '600';
            } else {
                const maxDistance = 2;
                const normalizedDist = Math.min(rowsFromCenter, maxDistance) / maxDistance;
                const scale = 1.15 - (0.45 * normalizedDist);
                const opacity = 1 - (0.75 * normalizedDist);

                itemEl.style.transform = `scale(${scale.toFixed(3)})`;
                itemEl.style.opacity = opacity.toFixed(2);
                itemEl.style.fontWeight = '400';
            }
        });
    }, []);

    // Get selected value from scroll position
    const getSelectedFromScroll = useCallback(() => {
        const scroll = scrollRef.current;
        if (!scroll) return null;

        const scrollTop = scroll.scrollTop;
        const index = Math.round(scrollTop / ITEM_HEIGHT);
        return items[index]?.value ?? null;
    }, [items]);

    // Handle scroll end - update selected value
    const handleScrollEnd = useCallback(() => {
        const value = getSelectedFromScroll();
        if (value !== null && value !== selectedValue) {
            onChange(value);
        }
        isScrollingRef.current = false;
    }, [getSelectedFromScroll, selectedValue, onChange]);

    // Scroll event listener
    useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;

        let scrollTimeout: ReturnType<typeof setTimeout>;

        const handleScroll = () => {
            isScrollingRef.current = true;
            requestAnimationFrame(updateVisuals);

            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(handleScrollEnd, 100);
        };

        scroll.addEventListener('scroll', handleScroll);
        requestAnimationFrame(updateVisuals);

        return () => {
            scroll.removeEventListener('scroll', handleScroll);
            clearTimeout(scrollTimeout);
        };
    }, [updateVisuals, handleScrollEnd]);

    // Scroll to selected value when it changes externally
    useEffect(() => {
        if (isScrollingRef.current) return;

        const scroll = scrollRef.current;
        if (!scroll) return;

        const index = items.findIndex(item => item.value === selectedValue);
        if (index >= 0) {
            scroll.scrollTo({
                top: index * ITEM_HEIGHT,
                behavior: 'smooth',
            });
        }
    }, [selectedValue, items]);

    // Click on item to select
    const handleItemClick = (value: number, index: number) => {
        const scroll = scrollRef.current;
        if (scroll) {
            scroll.scrollTo({
                top: index * ITEM_HEIGHT,
                behavior: 'smooth',
            });
        }
        onChange(value);
    };

    return (
        <div className="wheel-column">
            {label && <div className="wheel-column-label">{label}</div>}
            <div className="wheel-picker-container">
                <div className="wheel-picker-fade-top" />
                <div className="wheel-picker-highlight" />
                <div className="wheel-picker-fade-bottom" />
                <div
                    ref={scrollRef}
                    className="wheel-picker-scroll"
                    style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}
                >
                    <div className="wheel-picker-spacer" style={{ height: SPACER_HEIGHT }} />
                    {items.map((item, index) => (
                        <div
                            key={item.value}
                            className="wheel-picker-item"
                            onClick={() => handleItemClick(item.value, index)}
                        >
                            {item.label}
                        </div>
                    ))}
                    <div className="wheel-picker-spacer" style={{ height: SPACER_HEIGHT }} />
                </div>
            </div>
        </div>
    );
};

interface WheelPickerProps {
    children: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    title?: string;
}

export const WheelPicker: React.FC<WheelPickerProps> = ({
    children,
    onConfirm,
    onCancel,
    title,
}) => {
    // Handle keyboard events (with stopPropagation to avoid affecting parent modals)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                onConfirm();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [onConfirm, onCancel]);

    return (
        <>
            <div className="wheel-picker-overlay" onClick={onCancel} />
            <div className="wheel-picker-popover">
                <div className="wheel-picker-header">
                    <button type="button" className="wheel-picker-btn cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    {title && <span className="wheel-picker-title">{title}</span>}
                    <button type="button" className="wheel-picker-btn confirm" onClick={onConfirm}>
                        Done
                    </button>
                </div>
                <div className="wheel-picker-columns">
                    {children}
                </div>
            </div>
        </>
    );
};
