import { useState, useCallback, useEffect } from 'react';

interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
}

const MAX_HISTORY_SIZE = 50;

export function useLocalStorageWithHistory<T>(key: string, initialValue: T) {
    const [history, setHistory] = useState<HistoryState<T>>(() => {
        try {
            const item = window.localStorage.getItem(key);
            const present = item ? JSON.parse(item) : initialValue;
            return { past: [], present, future: [] };
        } catch (error) {
            console.error(error);
            return { past: [], present: initialValue, future: [] };
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

            const newPast = [...prev.past, prev.present].slice(-MAX_HISTORY_SIZE);
            return {
                past: newPast,
                present: newPresent,
                future: [], // Clear redo stack on new action
            };
        });
    }, []);

    const undo = useCallback(() => {
        setHistory((prev) => {
            if (prev.past.length === 0) return prev;

            const newPast = prev.past.slice(0, -1);
            const newPresent = prev.past[prev.past.length - 1];
            const newFuture = [prev.present, ...prev.future].slice(0, MAX_HISTORY_SIZE);

            return {
                past: newPast,
                present: newPresent,
                future: newFuture,
            };
        });
    }, []);

    const redo = useCallback(() => {
        setHistory((prev) => {
            if (prev.future.length === 0) return prev;

            const newFuture = prev.future.slice(1);
            const newPresent = prev.future[0];
            const newPast = [...prev.past, prev.present].slice(-MAX_HISTORY_SIZE);

            return {
                past: newPast,
                present: newPresent,
                future: newFuture,
            };
        });
    }, []);

    const canUndo = history.past.length > 0;
    const canRedo = history.future.length > 0;

    return [history.present, setValue, { undo, redo, canUndo, canRedo }] as const;
}
