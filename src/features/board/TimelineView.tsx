import React, { useMemo, useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { format, addDays, addMonths, subMonths, differenceInDays, startOfDay, parseISO, eachDayOfInterval, isSameDay } from 'date-fns';
import type { Task } from '../../types';

interface TimelineViewProps {
    tasks: Task[];
    onTaskClick: (task: Task) => void;
    onTaskUpdate?: (taskId: string, updates: { startDate?: string; dueDate?: string }) => void;
    taskColorMap: Record<string, string>;
    taskBoardIndexMap: Record<string, number>;
}

type ViewRange = 'week' | 'month' | '3months';

// Task row component
interface TaskRowProps {
    task: Task & { taskStart: Date | null; taskEnd: Date | null };
    position: { left: number; width: number } | null;
    theme: {
        bg: string;
        surface: string;
        text: string;
        textMuted: string;
        border: string;
        primary: string;
        taskBg: string;
    };
    dayWidth: number;
    days: Date[];
    resizing: {
        taskId: string;
        edge: 'left' | 'right' | 'move';
        initialX: number;
        initialStart: Date;
        initialEnd: Date;
    } | null;
    onTaskClick: (task: Task) => void;
    onTaskUpdate?: (taskId: string, updates: { startDate?: string; dueDate?: string }) => void;
    handleResizeStart: (e: React.MouseEvent, task: Task & { taskStart: Date | null; taskEnd: Date | null }, edge: 'left' | 'right' | 'move') => void;
    justFinishedResizing: React.MutableRefObject<boolean>;
    barColor: string;
}

const TaskRow: React.FC<TaskRowProps> = ({
    task,
    position,
    theme,
    dayWidth,
    days,
    resizing,
    onTaskClick,
    onTaskUpdate,
    handleResizeStart,
    justFinishedResizing,
    barColor,
}) => {
    return (
        <div
            style={{
                display: 'flex',
                borderBottom: `1px solid ${theme.border}`,
                minHeight: '50px',
            }}
        >
            {/* Task Name */}
            <div
                style={{
                    width: '200px',
                    minWidth: '200px',
                    padding: '12px',
                    borderRight: `1px solid ${theme.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    position: 'sticky',
                    left: 0,
                    backgroundColor: barColor,
                    zIndex: 5,
                }}
            >
                <span
                    style={{
                        color: '#000000',
                        fontSize: '15px',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        flex: 1,
                    }}
                    onClick={() => onTaskClick(task)}
                >
                    {task.starred && <span style={{ marginRight: '4px' }}>{'\u2605'}</span>}
                    {task.title}
                    {!task.taskStart && !task.taskEnd && (
                        <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.6 }}>
                            (No dates set)
                        </span>
                    )}
                </span>
            </div>

            {/* Timeline Bar Area */}
            <div style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
            }}>
                {/* Day grid lines */}
                <div style={{ display: 'flex', position: 'absolute', top: 0, bottom: 0 }}>
                    {days.map((day, index) => {
                        const hasNoDate = !task.taskStart && !task.taskEnd;
                        return (
                            <div
                                key={index}
                                onClick={hasNoDate && onTaskUpdate ? () => {
                                    onTaskUpdate(task.id, {
                                        startDate: format(day, 'yyyy-MM-dd'),
                                        dueDate: format(day, 'yyyy-MM-dd'),
                                    });
                                } : undefined}
                                style={{
                                    width: `${dayWidth}px`,
                                    borderRight: `1px solid ${theme.border}`,
                                    backgroundColor: isSameDay(day, new Date()) ? `${theme.primary}10` : 'transparent',
                                    cursor: hasNoDate ? 'pointer' : 'default',
                                }}
                                title={hasNoDate ? `Set start date to ${format(day, 'yyyy-MM-dd')}` : undefined}
                            />
                        );
                    })}
                </div>

                {/* Task Bar */}
                {position ? (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${position.left + 2}px`,
                            width: `${position.width}px`,
                            height: '28px',
                            backgroundColor: barColor,
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'visible',
                            boxShadow: resizing?.taskId === task.id
                                ? '0 2px 8px rgba(0,0,0,0.3)'
                                : '0 1px 3px rgba(0,0,0,0.2)',
                            transition: resizing ? 'none' : 'transform 0.1s ease, box-shadow 0.1s ease',
                            transform: resizing?.taskId === task.id ? 'scale(1.02)' : 'scale(1)',
                        }}
                    >
                        {/* Left resize handle */}
                        <div
                            onMouseDown={(e) => handleResizeStart(e, task, 'left')}
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: '8px',
                                cursor: 'ew-resize',
                                borderRadius: '6px 0 0 6px',
                                backgroundColor: 'transparent',
                                zIndex: 2,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        />

                        {/* Center drag handle (for moving entire task) */}
                        <div
                            onMouseDown={(e) => handleResizeStart(e, task, 'move')}
                            onClick={() => !resizing && !justFinishedResizing.current && onTaskClick(task)}
                            style={{
                                position: 'absolute',
                                left: '8px',
                                right: '8px',
                                top: 0,
                                bottom: 0,
                                cursor: resizing?.edge === 'move' ? 'grabbing' : 'grab',
                                display: 'flex',
                                alignItems: 'center',
                                zIndex: 1,
                            }}
                        >
                            <span style={{
                                fontSize: '20px',
                                fontWeight: 500,
                                color: '#000000',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                padding: '0 4px',
                                pointerEvents: 'none',
                            }}>
                                {task.starred && <span style={{ marginRight: '2px' }}>{'\u2605'}</span>}
                                {task.title}
                            </span>
                        </div>

                        {/* Right resize handle */}
                        <div
                            onMouseDown={(e) => handleResizeStart(e, task, 'right')}
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                bottom: 0,
                                width: '8px',
                                cursor: 'ew-resize',
                                borderRadius: '0 6px 6px 0',
                                backgroundColor: 'transparent',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export const TimelineView: React.FC<TimelineViewProps> = ({ tasks, onTaskClick, onTaskUpdate, taskColorMap, taskBoardIndexMap }) => {
    const [isDarkMode] = useState(true);
    const [viewRange, setViewRange] = useState<ViewRange>('week');
    const [hideDone, setHideDone] = useState(false);

    const theme = useMemo(() => ({
        bg: isDarkMode ? '#0f172a' : '#ffffff',
        surface: isDarkMode ? '#1e293b' : '#f8fafc',
        text: isDarkMode ? '#f8fafc' : '#0f172a',
        textMuted: isDarkMode ? '#94a3b8' : '#64748b',
        border: isDarkMode ? '#334155' : '#e2e8f0',
        primary: '#8b5cf6',
        taskBg: isDarkMode ? '#334155' : '#e2e8f0',
    }), [isDarkMode]);

    // Fixed date range (±12 months from today), independent of task data
    const dateRange = useMemo(() => {
        const today = startOfDay(new Date());
        return {
            start: subMonths(today, 12),
            end: addMonths(today, 12),
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Generate days array from date range
    const days = useMemo(() => {
        return eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    }, [dateRange]);

    const startDate = dateRange.start;

    // Configuration
    const dayWidth = viewRange === 'week' ? 120 : viewRange === 'month' ? 40 : 20;

    // Resize/drag state
    const [resizing, setResizing] = useState<{
        taskId: string;
        edge: 'left' | 'right' | 'move';
        initialX: number;
        initialStart: Date;
        initialEnd: Date;
    } | null>(null);

    // Track if we just finished resizing/dragging (to prevent click from opening modal)
    const justFinishedResizing = useRef(false);

    // Scroll container ref
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const savedScrollLeftRef = useRef<number | null>(null);
    const autoScrollTimerRef = useRef<number | null>(null);

    // Save scroll position before task updates, restore after re-render
    useLayoutEffect(() => {
        if (savedScrollLeftRef.current !== null && scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = savedScrollLeftRef.current;
            savedScrollLeftRef.current = null;
        }
    });

    // Wrap onTaskUpdate to preserve scroll position
    const stableTaskUpdate = useCallback((taskId: string, updates: Record<string, unknown>) => {
        if (!onTaskUpdate) return;
        if (scrollContainerRef.current) {
            savedScrollLeftRef.current = scrollContainerRef.current.scrollLeft;
        }
        onTaskUpdate(taskId, updates);
    }, [onTaskUpdate]);

    // Auto-scroll: scroll timeline when dragging near left/right edges
    const autoScroll = useCallback((clientX: number) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const hotZone = 80;
        const maxSpeed = 12;
        // Account for the 200px task name column
        const scrollAreaLeft = rect.left + 200;
        const scrollAreaRight = rect.right;

        if (clientX < scrollAreaLeft + hotZone && clientX > scrollAreaLeft) {
            const distance = scrollAreaLeft + hotZone - clientX;
            const speed = Math.min(maxSpeed, Math.ceil((distance / hotZone) * maxSpeed));
            container.scrollLeft -= speed;
        } else if (clientX > scrollAreaRight - hotZone) {
            const distance = clientX - (scrollAreaRight - hotZone);
            const speed = Math.min(maxSpeed, Math.ceil((distance / hotZone) * maxSpeed));
            container.scrollLeft += speed;
        }
    }, []);

    const startAutoScroll = useCallback((clientX: number) => {
        if (autoScrollTimerRef.current !== null) {
            cancelAnimationFrame(autoScrollTimerRef.current);
        }
        const tick = () => {
            autoScroll(clientX);
            autoScrollTimerRef.current = requestAnimationFrame(tick);
        };
        autoScrollTimerRef.current = requestAnimationFrame(tick);
    }, [autoScroll]);

    const updateAutoScroll = useCallback((clientX: number) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const hotZone = 80;
        const scrollAreaLeft = rect.left + 200;
        const scrollAreaRight = rect.right;
        const inHotZone = (clientX < scrollAreaLeft + hotZone && clientX > scrollAreaLeft) || clientX > scrollAreaRight - hotZone;

        if (inHotZone) {
            if (autoScrollTimerRef.current !== null) {
                cancelAnimationFrame(autoScrollTimerRef.current);
            }
            startAutoScroll(clientX);
        } else {
            stopAutoScroll();
        }
    }, [startAutoScroll]);

    const stopAutoScroll = useCallback(() => {
        if (autoScrollTimerRef.current !== null) {
            cancelAnimationFrame(autoScrollTimerRef.current);
            autoScrollTimerRef.current = null;
        }
    }, []);

    // Clean up auto-scroll timer on unmount
    useEffect(() => {
        return () => stopAutoScroll();
    }, [stopAutoScroll]);

    // Track visible year/month label from leftmost visible date
    const [headerLabel, setHeaderLabel] = useState('');

    const updateHeaderLabel = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container || days.length === 0) return;
        const scrollLeft = container.scrollLeft;
        const dayIndex = Math.max(0, Math.min(Math.floor(scrollLeft / dayWidth), days.length - 1));
        const visibleDate = days[dayIndex];
        setHeaderLabel(`${visibleDate.getFullYear()}年${visibleDate.getMonth() + 1}月`);
    }, [days, dayWidth]);

    // Scroll to today on initial load or when view changes
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const today = startOfDay(new Date());
        const daysFromStart = differenceInDays(today, dateRange.start);
        const scrollPosition = Math.max(0, (daysFromStart - 3) * dayWidth);

        container.scrollLeft = scrollPosition;
        // Update header label after scroll position is set
        requestAnimationFrame(() => updateHeaderLabel());
    }, [dateRange, dayWidth, updateHeaderLabel]);

    // Update header label on scroll
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const handleScroll = () => updateHeaderLabel();
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [updateHeaderLabel]);

    // Process and sort tasks:
    // 1. startDate ascending (earliest first, no date last)
    // 2. dueDate descending (latest first, no date last)
    // 3. 進捗度 descending (DONE > IN_PROGRESS > STANDBY > TODO)
    // 4. 優先度 ascending (board position index, lower = higher priority)
    const timelineTasks = useMemo(() => {
        const statusOrder: Record<string, number> = { 'done': 4, 'in-progress': 3, 'standby': 2, 'todo': 1 };
        return tasks
            .filter(task => !hideDone || task.status !== 'done')
            .map(task => {
                const taskStart = task.startDate ? parseISO(task.startDate) : null;
                const taskEnd = task.dueDate ? parseISO(task.dueDate) : taskStart;
                return { ...task, taskStart, taskEnd };
            })
            .sort((a, b) => {
                // 1. startDate ascending (no date goes to bottom)
                if (a.taskStart && b.taskStart) {
                    const diff = a.taskStart.getTime() - b.taskStart.getTime();
                    if (diff !== 0) return diff;
                } else if (a.taskStart && !b.taskStart) return -1;
                else if (!a.taskStart && b.taskStart) return 1;

                // 2. dueDate descending (later due date first; no date goes to bottom)
                const aEnd = a.dueDate ? parseISO(a.dueDate) : null;
                const bEnd = b.dueDate ? parseISO(b.dueDate) : null;
                if (aEnd && bEnd) {
                    const diff = bEnd.getTime() - aEnd.getTime();
                    if (diff !== 0) return diff;
                } else if (aEnd && !bEnd) return -1;
                else if (!aEnd && bEnd) return 1;

                // 3. 進捗度 descending (DONE > IN_PROGRESS > STANDBY > TODO)
                const statusDiff = (statusOrder[b.status] || 0) - (statusOrder[a.status] || 0);
                if (statusDiff !== 0) return statusDiff;

                // 4. 優先度 ascending (board index: lower = higher priority = should be on top)
                return (taskBoardIndexMap[a.id] ?? 999) - (taskBoardIndexMap[b.id] ?? 999);
            });
    }, [tasks, taskBoardIndexMap, hideDone]);

    // Go to today
    const goToToday = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const today = startOfDay(new Date());
        const daysFromStart = differenceInDays(today, dateRange.start);
        const scrollPosition = Math.max(0, (daysFromStart - 3) * dayWidth);

        container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    };

    const totalDays = days.length;

    const getTaskPosition = (task: { taskStart: Date | null; taskEnd: Date | null }) => {
        if (!task.taskStart || !task.taskEnd) return null;

        const startOffset = differenceInDays(task.taskStart, startDate);
        const duration = differenceInDays(task.taskEnd, task.taskStart) + 1;

        // Skip if task is completely outside the visible range
        if (startOffset + duration < 0 || startOffset > totalDays) return null;

        const left = Math.max(0, startOffset) * dayWidth;
        const width = Math.min(duration, totalDays - Math.max(0, startOffset)) * dayWidth - 4;

        return { left, width: Math.max(width, dayWidth - 4) };
    };



    // Calculate new date based on mouse position
    const calculateDateFromX = useCallback((clientX: number, containerRect: DOMRect, scrollLeft: number): Date => {
        const relativeX = clientX - containerRect.left - 200 + scrollLeft; // 200 is task name column width
        const dayIndex = Math.round(relativeX / dayWidth);
        const clampedIndex = Math.max(0, Math.min(dayIndex, totalDays - 1));
        return addDays(startDate, clampedIndex);
    }, [dayWidth, totalDays, startDate]);

    // Handle resize/drag start
    const handleResizeStart = useCallback((
        e: React.MouseEvent,
        task: Task & { taskStart: Date | null; taskEnd: Date | null },
        edge: 'left' | 'right' | 'move'
    ) => {
        e.stopPropagation();
        e.preventDefault();
        if (!task.taskStart || !task.taskEnd) return;

        setResizing({
            taskId: task.id,
            edge,
            initialX: e.clientX,
            initialStart: task.taskStart,
            initialEnd: task.taskEnd,
        });
    }, []);

    // Handle mouse move for resizing/dragging
    useEffect(() => {
        if (!resizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!scrollContainerRef.current || !resizing) return;

            // Auto-scroll when near edges during resize/drag
            updateAutoScroll(e.clientX);

            const containerRect = scrollContainerRef.current.getBoundingClientRect();
            const scrollLeft = scrollContainerRef.current.scrollLeft;
            const newDate = calculateDateFromX(e.clientX, containerRect, scrollLeft);

            let newStart: Date;
            let newEnd: Date;

            if (resizing.edge === 'move') {
                // Moving the entire task bar - preserve duration
                const initialStartDate = calculateDateFromX(resizing.initialX, containerRect, scrollLeft);
                const daysDiff = differenceInDays(newDate, initialStartDate);

                newStart = addDays(resizing.initialStart, daysDiff);
                newEnd = addDays(resizing.initialEnd, daysDiff);
            } else {
                // Find the current task to get its current dates
                const currentTask = timelineTasks.find(t => t.id === resizing.taskId);
                if (!currentTask || !currentTask.taskStart || !currentTask.taskEnd) return;

                // Calculate new start and end based on edge being resized
                newStart = currentTask.taskStart;
                newEnd = currentTask.taskEnd;

                if (resizing.edge === 'left') {
                    // Moving start date - ensure it doesn't go past end date
                    if (newDate <= currentTask.taskEnd) {
                        newStart = newDate;
                    }
                } else {
                    // Moving end date - ensure it doesn't go before start date
                    if (newDate >= currentTask.taskStart) {
                        newEnd = newDate;
                    }
                }
            }

            // Update task via stableTaskUpdate to preserve scroll position
            stableTaskUpdate(resizing.taskId, {
                startDate: format(newStart, 'yyyy-MM-dd'),
                dueDate: format(newEnd, 'yyyy-MM-dd'),
            });
        };

        const handleMouseUp = () => {
            stopAutoScroll();
            justFinishedResizing.current = true;
            if (scrollContainerRef.current) {
                savedScrollLeftRef.current = scrollContainerRef.current.scrollLeft;
            }
            setResizing(null);
            // Reset the flag after a short delay to allow click event to be ignored
            setTimeout(() => {
                justFinishedResizing.current = false;
            }, 100);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizing, calculateDateFromX, stableTaskUpdate, timelineTasks, updateAutoScroll, stopAutoScroll]);

    return (
        <div style={{
            backgroundColor: theme.bg,
            borderRadius: '12px',
            padding: '20px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ margin: 0, color: theme.text, fontSize: '26px' }}>Timeline</h2>
                    <button
                        onClick={() => setHideDone(!hideDone)}
                        title={hideDone ? 'Show Done tasks' : 'Hide Done tasks'}
                        style={{
                            padding: '14px 26px',
                            borderRadius: '30px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '20px',
                            fontWeight: 700,
                            backgroundColor: hideDone ? theme.primary : theme.surface,
                            color: hideDone ? '#fff' : theme.textMuted,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        Done 非表示
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* View Range Toggle */}
                    <div style={{
                        display: 'flex',
                        backgroundColor: theme.surface,
                        borderRadius: '30px',
                        padding: '4px',
                        gap: '2px',
                    }}>
                        {([
                            { range: 'week' as ViewRange, icon: (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    <line x1="8" y1="11" x2="14" y2="11" /><line x1="11" y1="8" x2="11" y2="14" />
                                </svg>
                            )},
                            { range: 'month' as ViewRange, icon: (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                            )},
                            { range: '3months' as ViewRange, icon: (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    <line x1="8" y1="11" x2="14" y2="11" />
                                </svg>
                            )},
                        ]).map(({ range, icon }) => (
                            <button
                                key={range}
                                onClick={() => setViewRange(range)}
                                style={{
                                    padding: '14px 26px',
                                    borderRadius: '30px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: viewRange === range ? theme.primary : 'transparent',
                                    color: viewRange === range ? '#fff' : theme.textMuted,
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {icon}
                            </button>
                        ))}
                    </div>

                    {/* Today button */}
                    <button
                        onClick={goToToday}
                        style={{
                            padding: '14px 26px',
                            borderRadius: '30px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '20px',
                            fontWeight: 700,
                            backgroundColor: theme.primary,
                            color: '#fff',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        Today
                    </button>
                </div>
            </div>

            {/* Timeline Grid */}
            <div
                ref={scrollContainerRef}
                className="calendar-scroll-hide"
                style={{
                    flex: 1,
                    overflow: 'auto',
                    scrollbarWidth: 'none',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    cursor: resizing ? 'ew-resize' : 'default',
                } as React.CSSProperties}
            >
                <div style={{ minWidth: `${totalDays * dayWidth + 200}px` }}>
                    {/* Date Headers */}
                    <div style={{
                        display: 'flex',
                        borderBottom: `1px solid ${theme.border}`,
                        position: 'sticky',
                        top: 0,
                        backgroundColor: theme.surface,
                        zIndex: 10,
                    }}>
                        {/* Task Name Column Header */}
                        <div style={{
                            width: '200px',
                            minWidth: '200px',
                            padding: '12px',
                            borderRight: `1px solid ${theme.border}`,
                            fontWeight: 600,
                            color: theme.text,
                            position: 'sticky',
                            left: 0,
                            backgroundColor: theme.surface,
                            zIndex: 11,
                        }}>
                            {headerLabel || 'Task'}
                        </div>

                        {/* Date Headers */}
                        <div style={{ display: 'flex' }}>
                            {days.map((day, index) => {
                                const isToday = isSameDay(day, new Date());
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                const isFirstOfMonth = day.getDate() === 1;
                                const prevDay = index > 0 ? days[index - 1] : null;
                                const isNewMonth = prevDay && day.getMonth() !== prevDay.getMonth();
                                const showMonthYear = index === 0 || isFirstOfMonth || isNewMonth;

                                // Day of week abbreviations in Japanese
                                const dayOfWeekJP = ['日', '月', '火', '水', '木', '金', '土'][day.getDay()];

                                return (
                                    <div
                                        key={index}
                                        style={{
                                            width: `${dayWidth}px`,
                                            minWidth: `${dayWidth}px`,
                                            padding: '4px 2px',
                                            textAlign: 'center',
                                            fontSize: viewRange === 'week' ? '11px' : '9px',
                                            color: isToday ? theme.primary : isWeekend ? theme.textMuted : theme.text,
                                            fontWeight: isToday ? 700 : 400,
                                            borderRight: `1px solid ${theme.border}`,
                                            backgroundColor: isToday ? `${theme.primary}20` : 'transparent',
                                        }}
                                    >
                                        {/* Show year when month changes */}
                                        {showMonthYear && (
                                            <div style={{
                                                fontSize: viewRange === 'week' ? '10px' : viewRange === 'month' ? '8px' : '7px',
                                                color: theme.primary,
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                            }}>
                                                {viewRange === '3months' ? format(day, 'yy') : format(day, 'yyyy')}
                                            </div>
                                        )}
                                        {/* Show month for all days */}
                                        <div style={{
                                            fontSize: viewRange === 'week' ? '9px' : viewRange === 'month' ? '7px' : '6px',
                                            color: theme.textMuted,
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {format(day, 'M')}月
                                        </div>
                                        {/* Day number */}
                                        <div style={{ fontWeight: isToday ? 700 : 500 }}>
                                            {format(day, 'd')}
                                        </div>
                                        {/* Day of week */}
                                        <div style={{
                                            fontSize: viewRange === 'week' ? '10px' : '8px',
                                            color: day.getDay() === 0 ? '#ef4444' : day.getDay() === 6 ? '#3b82f6' : theme.textMuted,
                                        }}>
                                            {viewRange === 'week' ? format(day, 'EEE') : dayOfWeekJP}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Task Rows */}
                    {timelineTasks.length === 0 ? (
                        <div style={{
                            padding: '40px',
                            textAlign: 'center',
                            color: theme.textMuted,
                        }}>
                            No tasks to display. Create a new task to see it on the timeline.
                        </div>
                    ) : (
                        <div>
                            {timelineTasks.map((task) => {
                                const position = getTaskPosition(task);
                                return (
                                    <TaskRow
                                        key={task.id}
                                        task={task}
                                        position={position}
                                        theme={theme}
                                        dayWidth={dayWidth}
                                        days={days}
                                        resizing={resizing}
                                        onTaskClick={onTaskClick}
                                        onTaskUpdate={onTaskUpdate}
                                        handleResizeStart={handleResizeStart}
                                        justFinishedResizing={justFinishedResizing}
                                        barColor={taskColorMap[task.id] || theme.primary}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
