import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTemporalStore, useProjectStore } from '../../store/projectStore';
import { useKeyboardStore } from '../../store/keyboardStore';
import type { Project } from '../../types';
import './HistoryTimeline.css';

interface StateSnapshot {
    projects: Project[];
    activeProjectId: string | null;
}

// CJK文字（日本語・韓国語・中国語）を検出
function hasCJK(text: string): boolean {
    // CJK統合漢字、ひらがな、カタカナ、ハングル
    return /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(text);
}

// 名前を省略するヘルパー関数（CJK: 8文字、その他: 15文字）
function truncateName(name: string): string {
    const maxLength = hasCJK(name) ? 8 : 15;
    return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
}

// Generate description by comparing states
function generateDescription(prevState: StateSnapshot | null, currentState: StateSnapshot): string {
    if (!prevState) return 'Initial state';

    const prevProjects = prevState.projects;
    const currProjects = currentState.projects;

    // Project added
    if (currProjects.length > prevProjects.length) {
        const newProject = currProjects.find(p => !prevProjects.some(pp => pp.id === p.id));
        return newProject ? `Added project: ${truncateName(newProject.name)}` : 'Added project';
    }

    // Project deleted
    if (currProjects.length < prevProjects.length) {
        const deletedProject = prevProjects.find(p => !currProjects.some(cp => cp.id === p.id));
        return deletedProject ? `Deleted project: ${truncateName(deletedProject.name)}` : 'Deleted project';
    }

    // Note: activeProjectId changes are ignored since navigation is not tracked in history

    // Check task changes
    for (const currProject of currProjects) {
        const prevProject = prevProjects.find(p => p.id === currProject.id);
        if (!prevProject) continue;

        const prevTasks = prevProject.tasks;
        const currTasks = currProject.tasks;

        // Task added
        if (currTasks.length > prevTasks.length) {
            const newTask = currTasks.find(t => !prevTasks.some(pt => pt.id === t.id));
            return newTask ? `Added task: ${truncateName(newTask.title)}` : 'Added task';
        }

        // Task deleted
        if (currTasks.length < prevTasks.length) {
            return 'Deleted task';
        }

        // Task updated
        for (const currTask of currTasks) {
            const prevTask = prevTasks.find(t => t.id === currTask.id);
            if (!prevTask) continue;

            if (prevTask.status !== currTask.status) {
                return `${truncateName(currTask.title)} → ${currTask.status}`;
            }
            if (prevTask.starred !== currTask.starred) {
                return currTask.starred ? `Starred: ${truncateName(currTask.title)}` : `Unstarred task`;
            }
            if (JSON.stringify(prevTask) !== JSON.stringify(currTask)) {
                return `Edited: ${truncateName(currTask.title)}`;
            }
        }

        // Project reordered tasks
        if (prevTasks.length === currTasks.length && prevTasks.some((t, i) => currTasks[i]?.id !== t.id)) {
            return 'Reordered tasks';
        }

        // Project settings changed
        if (JSON.stringify(prevProject) !== JSON.stringify(currProject)) {
            return `Updated: ${truncateName(currProject.name)}`;
        }
    }

    // Projects reordered
    if (prevProjects.length === currProjects.length && prevProjects.some((p, i) => currProjects[i]?.id !== p.id)) {
        return 'Reordered projects';
    }

    return 'State changed';
}

interface HistoryTimelineProps {
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
}

export const HistoryTimeline: React.FC<HistoryTimelineProps> = ({ expanded, onExpandedChange }) => {
    const temporalStore = useTemporalStore();
    const [isExpandedInternal, setIsExpandedInternal] = useState(false);

    // Use external state if provided, otherwise use internal state
    const isExpanded = expanded !== undefined ? expanded : isExpandedInternal;
    const setIsExpanded = (value: boolean | ((prev: boolean) => boolean)) => {
        const newValue = typeof value === 'function' ? value(isExpanded) : value;
        setIsExpandedInternal(newValue);
        onExpandedChange?.(newValue);
    };
    const [pastStates, setPastStates] = useState<StateSnapshot[]>([]);
    const [futureStates, setFutureStates] = useState<StateSnapshot[]>([]);

    // Cache for future descriptions - preserves original past descriptions when undo happens
    // This stores the full pastDescriptions array at each state, so we can retrieve correct descriptions after undo
    const allPastDescriptionsCacheRef = useRef<string[]>([]);
    const prevPastLengthRef = useRef<number>(0);

    // Position state with localStorage persistence
    const [position, setPosition] = useState<'left' | 'right'>(() => {
        return (localStorage.getItem('history-timeline-position') as 'left' | 'right') || 'left';
    });
    const [isDragging, setIsDragging] = useState(false);
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
    const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);

    // Save position to localStorage
    useEffect(() => {
        localStorage.setItem('history-timeline-position', position);
    }, [position]);

    // Add body class during drag to prevent text selection
    useEffect(() => {
        if (isDragging) {
            document.body.classList.add('history-dragging');
        } else {
            document.body.classList.remove('history-dragging');
        }
        return () => {
            document.body.classList.remove('history-dragging');
        };
    }, [isDragging]);

    // Ref for scroll container (declared early for use in key handler)
    const scrollRef = useRef<HTMLDivElement>(null);
    const ITEM_HEIGHT = 44;

    // ESC key to close, Enter key to select focused item, Cmd+Backspace/Delete to clear history
    useEffect(() => {
        if (!isExpanded) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Priority check: パレット開なら全て無視（パレットが処理する）
            const priority = useKeyboardStore.getState().getTopPriority();
            if (priority === 'palette') return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation(); // Stop other window listeners from receiving this event
                setIsExpanded(false);
            }
            // Enterキーで中央にフォーカスしているアイテムを選択
            if (e.key === 'Enter') {
                e.preventDefault();
                const scroll = scrollRef.current;
                if (!scroll) return;

                const scrollTop = scroll.scrollTop;
                const containerHeight = scroll.clientHeight;
                const centerY = scrollTop + containerHeight / 2;

                // Find the item closest to center
                const items = scroll.querySelectorAll('.picker-item');
                let closestItem: HTMLElement | null = null;
                let closestDistance = Infinity;

                items.forEach((item) => {
                    const itemEl = item as HTMLElement;
                    const itemTop = itemEl.offsetTop;
                    const itemCenter = itemTop + ITEM_HEIGHT / 2;
                    const distance = Math.abs(centerY - itemCenter);

                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestItem = itemEl;
                    }
                });

                // Click the closest item (if not current state)
                if (closestItem) {
                    const el = closestItem as HTMLElement;
                    if (!el.classList.contains('current')) {
                        el.click();
                    }
                }
            }
            // Cmd+Backspace (Mac) or Delete (Windows) = Clear all history
            if ((e.metaKey && e.key === 'Backspace') || e.key === 'Delete') {
                e.preventDefault();
                if (confirm('全ての履歴を削除しますか？')) {
                    temporalStore.getState().clear();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isExpanded, temporalStore]);

    // Ref to track if panel is expanded (for use in subscription callback)
    const isExpandedRef = useRef(isExpanded);
    useEffect(() => {
        isExpandedRef.current = isExpanded;
    }, [isExpanded]);

    // Subscribe to temporal store changes
    useEffect(() => {
        let prevPastLength = temporalStore.getState().pastStates.length;
        let prevFutureLength = temporalStore.getState().futureStates.length;

        const unsubscribe = temporalStore.subscribe((state) => {
            const newPastLength = state.pastStates.length;
            const newFutureLength = state.futureStates.length;

            setPastStates(state.pastStates as StateSnapshot[]);
            setFutureStates(state.futureStates as StateSnapshot[]);

            // undo/redo（キーボードショートカット含む）で状態が変わった時、
            // パネルが開いていればcurrent stateを中央にスクロール
            if (isExpandedRef.current &&
                (newPastLength !== prevPastLength || newFutureLength !== prevFutureLength)) {
                setTimeout(() => {
                    const currentEl = scrollRef.current?.querySelector('.picker-item.current');
                    if (currentEl) {
                        currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                }, 50);
            }

            prevPastLength = newPastLength;
            prevFutureLength = newFutureLength;
        });

        // Initialize
        const initial = temporalStore.getState();
        setPastStates(initial.pastStates as StateSnapshot[]);
        setFutureStates(initial.futureStates as StateSnapshot[]);

        return unsubscribe;
    }, [temporalStore]);

    // Update visual styles based on distance from center (iOS picker effect)
    const updateVisuals = useCallback(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;

        const scrollTop = scroll.scrollTop;
        const containerHeight = scroll.clientHeight;
        const centerY = scrollTop + containerHeight / 2;

        const items = scroll.querySelectorAll('.picker-item');
        items.forEach((item) => {
            const itemEl = item as HTMLElement;
            const itemTop = itemEl.offsetTop;
            const itemCenter = itemTop + ITEM_HEIGHT / 2;
            const distance = Math.abs(centerY - itemCenter);

            // 距離を行数に変換（0 = 中央、1 = 隣接、2 = 2つ離れ...）
            const rowsFromCenter = distance / ITEM_HEIGHT;

            if (rowsFromCenter < 0.5) {
                // 中央（選択中）- 最大サイズ
                itemEl.style.transform = 'scale(1.15)';
                itemEl.style.opacity = '1';
                itemEl.style.fontWeight = '600';
            } else {
                // 距離に応じて連続的に縮小・透明化
                // scale: 1.15 → 0.7（最大4行離れで最小）
                const maxDistance = 4;
                const normalizedDist = Math.min(rowsFromCenter, maxDistance) / maxDistance;
                const scale = 1.15 - (0.45 * normalizedDist); // 1.15 → 0.7
                const opacity = 1 - (0.75 * normalizedDist);  // 1 → 0.25

                itemEl.style.transform = `scale(${scale.toFixed(3)})`;
                itemEl.style.opacity = opacity.toFixed(2);
                itemEl.style.fontWeight = '400';
            }
        });
    }, []);

    // Scroll event listener for iOS picker effect
    useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll || !isExpanded) return;

        const handleScroll = () => requestAnimationFrame(updateVisuals);
        scroll.addEventListener('scroll', handleScroll);

        // Initial update
        requestAnimationFrame(updateVisuals);

        return () => scroll.removeEventListener('scroll', handleScroll);
    }, [isExpanded, updateVisuals]);

    // Scroll Current State to center ONLY when first expanded
    useEffect(() => {
        if (isExpanded && scrollRef.current) {
            const currentEl = scrollRef.current.querySelector('.picker-item.current');
            if (currentEl) {
                currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            setTimeout(() => requestAnimationFrame(updateVisuals), 100);
        }
    }, [isExpanded, updateVisuals]);

    // Helper to scroll current state to center after undo/redo/click
    const scrollToCenter = useCallback(() => {
        setTimeout(() => {
            const currentEl = scrollRef.current?.querySelector('.picker-item.current');
            if (currentEl) {
                currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            requestAnimationFrame(updateVisuals);
        }, 50);
    }, [updateVisuals]);

    // Prevent wheel event propagation to prevent background scrolling
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        // 常にバブリングを停止（ピッカー外のスクロールを防止）
        e.stopPropagation();
    }, []);

    // Go to a specific past state by undoing the right number of steps
    const handleGoToPast = useCallback((index: number) => {
        // index is 0-based from oldest to newest
        // To go to index N, we need to undo (pastStates.length - index) steps
        const stepsToUndo = pastStates.length - index;
        if (stepsToUndo > 0) {
            temporalStore.getState().undo(stepsToUndo);
            scrollToCenter();
        }
    }, [temporalStore, pastStates.length, scrollToCenter]);

    const handleUndo = useCallback(() => {
        temporalStore.getState().undo();
        scrollToCenter();
    }, [temporalStore, scrollToCenter]);

    const handleRedo = useCallback(() => {
        temporalStore.getState().redo();
        scrollToCenter();
    }, [temporalStore, scrollToCenter]);

    // Go to a specific future state by redoing the right number of steps
    const handleGoToFuture = useCallback((index: number) => {
        // Redo (index + 1) times to reach this state
        const stepsToRedo = index + 1;
        if (stepsToRedo > 0) {
            temporalStore.getState().redo(stepsToRedo);
            scrollToCenter();
        }
    }, [temporalStore, scrollToCenter]);

    const handleClear = useCallback(() => {
        if (confirm('全ての履歴を削除しますか？')) {
            temporalStore.getState().clear();
        }
    }, [temporalStore]);

    // Drag handlers for repositioning (using mouse events instead of drag API)
    // Only start dragging after mouse moves 5+ pixels from initial click position
    const DRAG_THRESHOLD = 5;

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Only handle left mouse button
        if (e.button !== 0) return;
        setMouseDownPos({ x: e.clientX, y: e.clientY });
        setDragPos({ x: e.clientX, y: e.clientY });
    }, []);

    useEffect(() => {
        if (!mouseDownPos) return;

        const handleMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - mouseDownPos.x;
            const dy = e.clientY - mouseDownPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Start dragging only after moving beyond threshold
            if (distance >= DRAG_THRESHOLD) {
                setIsDragging(true);
            }

            if (isDragging) {
                setDragPos({ x: e.clientX, y: e.clientY });
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (isDragging) {
                // Was dragging - update position
                const windowWidth = window.innerWidth;
                setPosition(e.clientX < windowWidth / 2 ? 'left' : 'right');
            }
            // Reset states
            setIsDragging(false);
            setMouseDownPos(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [mouseDownPos, isDragging]);

    // Generate descriptions for future states first (needed for -1 description)
    // Generate descriptions for past states
    // Each description shows what change was made FROM that state (not TO that state)
    const pastDescriptions = useMemo(() => {
        const descriptions: string[] = [];
        for (let i = 0; i < pastStates.length; i++) {
            // Description shows the change from pastStates[i] to the next state
            const nextState = i < pastStates.length - 1 ? pastStates[i + 1] : null;
            if (nextState) {
                descriptions.push(generateDescription(pastStates[i], nextState));
            } else {
                // Last past state (-1): get current state directly from store (not as hook)
                // This doesn't cause re-render loops since getState() is not reactive
                const currentState = useProjectStore.getState();
                const current: StateSnapshot = {
                    projects: currentState.projects,
                    // Use null for activeProjectId to avoid detecting navigation as a change
                    // (activeProjectId is excluded from history tracking)
                    activeProjectId: null,
                };
                descriptions.push(generateDescription(pastStates[i], current));
            }
        }
        return descriptions;
    }, [pastStates]);

    // Update the cache whenever pastDescriptions changes
    // The cache stores descriptions for both past AND potential future states
    // Key insight: Never lose future descriptions when doing redo
    useEffect(() => {
        const prevLength = prevPastLengthRef.current;
        const currentLength = pastStates.length;
        const cache = allPastDescriptionsCacheRef.current;

        if (currentLength > prevLength && futureStates.length === 0) {
            // New action (not redo) - completely replace cache
            // Future is cleared, so we start fresh
            allPastDescriptionsCacheRef.current = [...pastDescriptions];
        } else if (currentLength > prevLength && futureStates.length > 0) {
            // Redo happened - update only the past portion of cache, keep future portion
            // pastDescriptions now has more items, but cache still has future descriptions
            // Merge: take new pastDescriptions + keep remaining cache items for future
            const newCache = [...pastDescriptions];
            // Keep cache items beyond current pastDescriptions length (these are future descriptions)
            for (let i = currentLength; i < cache.length; i++) {
                newCache[i] = cache[i];
            }
            allPastDescriptionsCacheRef.current = newCache;
        } else if (currentLength === prevLength && futureStates.length === 0 && cache.length < pastDescriptions.length) {
            // Edge case: same length but cache is smaller (e.g., initial load)
            allPastDescriptionsCacheRef.current = [...pastDescriptions];
        }
        // When undo happens (currentLength < prevLength), we keep the cache as-is
        // so we can retrieve the original descriptions

        prevPastLengthRef.current = currentLength;
    }, [pastStates.length, futureStates.length, pastDescriptions]);

    // Future descriptions: retrieve from cache based on what was undone
    // If we had N past items and now have M (where M < N), then we have (N - M) future items
    // The future descriptions should be cache[M], cache[M+1], ..., cache[N-1] in order
    const futureDescriptions = useMemo(() => {
        if (futureStates.length === 0) return [];

        const cache = allPastDescriptionsCacheRef.current;
        const currentPastLength = pastStates.length;
        const descriptions: string[] = [];

        // futureStates[0] corresponds to the description at cache[currentPastLength]
        // futureStates[1] corresponds to cache[currentPastLength + 1], etc.
        for (let i = 0; i < futureStates.length; i++) {
            const cacheIndex = currentPastLength + i;
            if (cacheIndex < cache.length) {
                descriptions.push(cache[cacheIndex]);
            } else {
                descriptions.push('State change');
            }
        }

        return descriptions;
    }, [futureStates.length, pastStates.length]);

    const canUndo = pastStates.length > 0;
    const canRedo = futureStates.length > 0;

    // Ghost element shown during drag
    const dragGhost = isDragging && (
        <div
            className="history-drag-ghost"
            style={{
                left: dragPos.x,
                top: dragPos.y,
            }}
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
        </div>
    );

    if (!isExpanded) {
        // Collapsed view - floating button
        return (
            <>
                {dragGhost}
                <div
                    className={`history-timeline collapsed ${position} ${isDragging ? 'dragging' : ''}`}
                    onMouseDown={handleMouseDown}
                >
                    <button
                        className="history-toggle-btn"
                        onClick={() => setIsExpanded(true)}
                        title="Open History Timeline (drag to move)"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </button>
                    {(canUndo || canRedo) && (
                        <div className="history-stats">
                            {canUndo && (
                                <div className="stat-item" title={`${pastStates.length} undo steps`}>
                                    <span className="stat-number">{pastStates.length}</span>
                                    <span className="stat-label">↶</span>
                                </div>
                            )}
                            {canRedo && (
                                <div className="stat-item" title={`${futureStates.length} redo steps`}>
                                    <span className="stat-number">{futureStates.length}</span>
                                    <span className="stat-label">↷</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </>
        );
    }

    // Expanded view
    return (
        <>
            {dragGhost}
            {/* Overlay for click-outside-to-close */}
            <div
                className="history-overlay"
                onClick={() => setIsExpanded(false)}
            />
            <div
                className={`history-timeline expanded ${position} ${isDragging ? 'dragging' : ''}`}
            >
                <div className="history-header" onMouseDown={handleMouseDown}>
                    <h3 className="history-title">History</h3>
                    <button
                        className="history-close-btn"
                        onClick={() => setIsExpanded(false)}
                        title="Close"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="history-actions">
                    <button
                        className="history-action-btn"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        title="Undo (⌘Z)"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 7v6h6" />
                            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                        </svg>
                        Undo
                    </button>
                    <button
                        className="history-action-btn"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        title="Redo (⌘⇧Z)"
                    >
                        Redo
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 7v6h-6" />
                            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                        </svg>
                    </button>
                    <button
                        className="history-action-btn clear"
                        onClick={handleClear}
                        disabled={!canUndo && !canRedo}
                        title="Clear All History"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Clear
                    </button>
                </div>

                {/* iOS Picker Style Timeline */}
                <div className="timeline-picker">
                    {/* フェード効果 */}
                    <div className="picker-fade-top" />
                    <div className="picker-fade-bottom" />

                    {/* 中央ハイライト - 履歴がある時のみ表示 */}
                    {(pastStates.length > 0 || futureStates.length > 0) && (
                        <div className="picker-highlight" />
                    )}

                    {/* スクロール領域 */}
                    <div className="picker-scroll" ref={scrollRef} onWheel={handleWheel}>
                        {pastStates.length === 0 && futureStates.length === 0 ? (
                            /* 空の状態 */
                            <div className="picker-empty">
                                <p>No history yet</p>
                                <p className="text-muted">Make changes to see history</p>
                            </div>
                        ) : (
                            <>
                                {/* Top spacer */}
                                <div className="picker-spacer picker-spacer-top" />

                                {/* Future states (reversed: furthest future first) */}
                                {[...futureStates].reverse().map((_, reversedIndex) => {
                                    const index = futureStates.length - 1 - reversedIndex;
                                    return (
                                        <button
                                            key={`future-${index}`}
                                            className="picker-item future"
                                            onClick={() => handleGoToFuture(index)}
                                            title="Click to redo to this state"
                                        >
                                            <span className="picker-item-index">+{index + 1}</span>
                                            <span className="picker-item-desc">
                                                {futureDescriptions[index] || 'State change'}
                                            </span>
                                        </button>
                                    );
                                })}

                                {/* Current state */}
                                <div className="picker-item current">
                                    <span className="picker-item-index">●</span>
                                    <span className="picker-item-desc">Current State</span>
                                </div>

                                {/* Past states (most recent first) */}
                                {[...pastStates].reverse().map((_, reversedIndex) => {
                                    const index = pastStates.length - 1 - reversedIndex;
                                    return (
                                        <button
                                            key={`past-${index}`}
                                            className="picker-item past"
                                            onClick={() => handleGoToPast(index)}
                                            title="Click to go back to this state"
                                        >
                                            <span className="picker-item-index">-{pastStates.length - index}</span>
                                            <span className="picker-item-desc">
                                                {pastDescriptions[index] || 'State change'}
                                            </span>
                                        </button>
                                    );
                                })}

                                {/* Bottom spacer */}
                                <div className="picker-spacer picker-spacer-bottom" />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
