import { useState, useCallback, useEffect } from 'react';

interface HistoryState<T> {
    past: T | null;      // Only one step back (simplified)
    present: T;
    future: T | null;    // Only one step forward (simplified)
}

export function useLocalStorageWithHistory<T>(key: string, initialValue: T) {
    const [history, setHistory] = useState<HistoryState<T>>(() => {
        try {
            const item = window.localStorage.getItem(key);
            const present = item ? JSON.parse(item) : initialValue;
            return { past: null, present, future: null };
        } catch (error) {
            console.error(error);
            return { past: null, present: initialValue, future: null };
        }
    });

    // Save to localStorage whenever present changes
    useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(history.present));
        } catch (error) {
            console.error(error);
        }
    }, [key, history.present]);

    const setValue = useCallback((value: T | ((val: T) => T)) => {
        setHistory((prev) => {
            const newPresent = value instanceof Function ? value(prev.present) : value;

            // Don't add to history if value is the same
            if (JSON.stringify(newPresent) === JSON.stringify(prev.present)) {
                return prev;
            }

            return {
                past: prev.present,      // Only keep one step back
                present: newPresent,
                future: null,            // Clear redo on new action
            };
        });
    }, []);

    const undo = useCallback(() => {
        setHistory((prev) => {
            if (prev.past === null) return prev;

            return {
                past: null,              // No more undo after this
                present: prev.past,
                future: prev.present,    // Current becomes redo target
            };
        });
    }, []);

    const redo = useCallback(() => {
        setHistory((prev) => {
            if (prev.future === null) return prev;

            return {
                past: prev.present,      // Current becomes undo target
                present: prev.future,
                future: null,            // No more redo after this
            };
        });
    }, []);

    // Update value without creating history entry (for drag preview etc.)
    const setValueWithoutHistory = useCallback((value: T | ((val: T) => T)) => {
        setHistory((prev) => {
            const newPresent = value instanceof Function ? value(prev.present) : value;
            if (JSON.stringify(newPresent) === JSON.stringify(prev.present)) {
                return prev;
            }
            return {
                ...prev,
                present: newPresent,
                // Don't modify past or future
            };
        });
    }, []);

    // Update value and merge into the last history entry (for date confirmation after drag)
    // This updates present but keeps past/future unchanged, effectively merging with the last action
    const setValueMergeHistory = useCallback((value: T | ((val: T) => T)) => {
        setHistory((prev) => {
            const newPresent = value instanceof Function ? value(prev.present) : value;
            if (JSON.stringify(newPresent) === JSON.stringify(prev.present)) {
                return prev;
            }
            return {
                past: prev.past,      // Keep past unchanged
                present: newPresent,
                future: prev.future,  // Keep future unchanged
            };
        });
    }, []);

    const canUndo = history.past !== null;
    const canRedo = history.future !== null;

    return [history.present, setValue, { undo, redo, canUndo, canRedo, setValueWithoutHistory, setValueMergeHistory }] as const;
}
