import React, { useMemo, useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { format, addDays, addMonths, subMonths, differenceInDays, startOfDay, startOfMonth, parseISO, eachDayOfInterval, isSameDay } from 'date-fns';
import type { Task } from '../../types';

interface TimelineViewProps {
    tasks: Task[];
    onTaskClick: (task: Task) => void;
    onTaskUpdate?: (taskId: string, updates: { startDate?: string; dueDate?: string }) => void;
    taskColorMap: Record<string, string>;
    taskBoardIndexMap: Record<string, number>;
    initialHideDone?: boolean;
    onHideDoneChange?: (hideDone: boolean) => void;
    initialViewRange?: ViewRange;
    onViewRangeChange?: (range: ViewRange) => void;
    commandRef?: React.MutableRefObject<((cmd: string) => void) | null>;
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
        monthOdd: string;
        monthEven: string;
    };
    dayWidth: number;
    days: Date[];
    resizing: {
        taskId: string;
        edge: 'left' | 'right' | 'move';
        initialX: number;
        initialScrollLeft: number;
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
                minHeight: '58px',
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
                        fontSize: '20px',
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
                <div style={{ display: 'flex', position: 'absolute', top: 0, bottom: 0, zIndex: 1 }}>
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
                                    backgroundColor: isSameDay(day, new Date()) ? `${theme.primary}10` : (day.getMonth() + 1) % 2 === 1 ? theme.monthOdd : theme.monthEven,
                                    cursor: hasNoDate ? 'pointer' : 'default',
                                }}
                                title={undefined}
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
                            height: '36px',
                            backgroundColor: barColor,
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'visible',
                            boxShadow: resizing?.taskId === task.id
                                ? '0 2px 8px rgba(0,0,0,0.3)'
                                : '0 1px 3px rgba(0,0,0,0.2)',
                            transition: resizing ? 'none' : 'transform 0.1s ease, box-shadow 0.1s ease, opacity 0.1s ease',
                            transform: resizing?.taskId === task.id ? 'scale(1.02)' : 'scale(1)',
                            opacity: resizing?.taskId === task.id ? 0.5 : 1,
                            zIndex: 3,
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
                                fontWeight: 600,
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

export const TimelineView: React.FC<TimelineViewProps> = ({ tasks, onTaskClick, onTaskUpdate, taskColorMap, taskBoardIndexMap, initialHideDone, onHideDoneChange, initialViewRange, onViewRangeChange, commandRef }) => {
    const [isDarkMode] = useState(true);
    const [viewRange, setViewRange] = useState<ViewRange>(initialViewRange ?? 'month');
    const [hideDone, setHideDone] = useState(initialHideDone ?? true);

    const theme = useMemo(() => ({
        bg: isDarkMode ? '#0f172a' : '#ffffff',
        surface: isDarkMode ? '#1e293b' : '#f8fafc',
        text: isDarkMode ? 'rgba(248, 250, 252, 0.85)' : 'rgba(15, 23, 42, 0.85)',
        textMuted: isDarkMode ? '#94a3b8' : '#64748b',
        border: isDarkMode ? '#334155' : '#e2e8f0',
        primary: '#8b5cf6',
        headerBg: isDarkMode ? '#1F2937' : '#f1f5f9',
        taskBg: isDarkMode ? '#334155' : '#e2e8f0',
        monthOdd: isDarkMode ? '#111827' : '#f8fafc',
        monthEven: isDarkMode ? '#1a2332' : '#f1f5f9',
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

    // Compute month spans for background labels
    const monthSpans = useMemo(() => {
        if (days.length === 0) return [];
        const spans: { month: number; year: number; name: string; startIndex: number; endIndex: number }[] = [];
        let currentMonth = -1;
        let currentYear = -1;
        days.forEach((day, index) => {
            const m = day.getMonth();
            const y = day.getFullYear();
            if (m !== currentMonth || y !== currentYear) {
                if (spans.length > 0) {
                    spans[spans.length - 1].endIndex = index - 1;
                }
                spans.push({ month: m, year: y, name: format(day, 'MMMM'), startIndex: index, endIndex: index });
                currentMonth = m;
                currentYear = y;
            }
        });
        if (spans.length > 0) {
            spans[spans.length - 1].endIndex = days.length - 1;
        }
        return spans;
    }, [days]);

    // Configuration
    const dayWidth = viewRange === 'week' ? 128 : viewRange === 'month' ? 64 : 31;

    // Resize/drag state - currentStart/currentEnd track visual position during drag
    const [resizing, setResizing] = useState<{
        taskId: string;
        edge: 'left' | 'right' | 'move';
        initialX: number;
        initialScrollLeft: number;
        initialStart: Date;
        initialEnd: Date;
        currentStart: Date;
        currentEnd: Date;
    } | null>(null);

    // Track if we just finished resizing/dragging (to prevent click from opening modal)
    const justFinishedResizing = useRef(false);
    const hasMovedDuringResize = useRef(false);

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
    const [headerMonthEn, setHeaderMonthEn] = useState('');

    const updateHeaderLabel = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container || days.length === 0) return;
        // Use center of visible area to determine month (same as CalendarView)
        const centerX = container.scrollLeft + container.clientWidth / 2;
        const dayIndex = Math.max(0, Math.min(Math.floor(centerX / dayWidth), days.length - 1));
        const visibleDate = days[dayIndex];
        setHeaderLabel(`${visibleDate.getFullYear()}年${visibleDate.getMonth() + 1}月`);
        setHeaderMonthEn(format(visibleDate, 'MMMM'));
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

    // Scroll to previous month's first day
    const scrollToPrevMonth = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container || days.length === 0) return;
        const scrollLeft = container.scrollLeft;
        const dayIndex = Math.max(0, Math.floor(scrollLeft / dayWidth));
        const currentDate = days[dayIndex];

        // Find first day of current month in days array
        const firstOfCurrentMonth = startOfMonth(currentDate);
        const firstOfCurrentIndex = days.findIndex(d =>
            d.getFullYear() === firstOfCurrentMonth.getFullYear() &&
            d.getMonth() === firstOfCurrentMonth.getMonth() &&
            d.getDate() === 1
        );

        // Threshold varies by view: week=1, month=2, year=3
        const threshold = viewRange === 'week' ? 1 : viewRange === 'month' ? 2 : 3;
        // If we're already viewing the first few days of the month, go to previous month
        if (firstOfCurrentIndex >= 0 && dayIndex - firstOfCurrentIndex < threshold) {
            // Find first day of previous month
            const prevMonth = subMonths(firstOfCurrentMonth, 1);
            const prevIndex = days.findIndex(d =>
                d.getFullYear() === prevMonth.getFullYear() &&
                d.getMonth() === prevMonth.getMonth() &&
                d.getDate() === 1
            );
            if (prevIndex >= 0) {
                container.scrollTo({ left: prevIndex * dayWidth, behavior: 'smooth' });
            }
        } else if (firstOfCurrentIndex >= 0) {
            // Go to first day of current month
            container.scrollTo({ left: firstOfCurrentIndex * dayWidth, behavior: 'smooth' });
        }
    }, [days, dayWidth, viewRange]);

    // Scroll to next month's first day
    const scrollToNextMonth = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container || days.length === 0) return;
        const scrollLeft = container.scrollLeft;
        const dayIndex = Math.max(0, Math.floor(scrollLeft / dayWidth));
        const currentDate = days[dayIndex];

        // Find first day of next month
        const nextMonth = addMonths(startOfMonth(currentDate), 1);
        const nextIndex = days.findIndex(d =>
            d.getFullYear() === nextMonth.getFullYear() &&
            d.getMonth() === nextMonth.getMonth() &&
            d.getDate() === 1
        );
        if (nextIndex >= 0) {
            container.scrollTo({ left: nextIndex * dayWidth, behavior: 'smooth' });
        }
    }, [days, dayWidth]);

    // Command palette handler
    useEffect(() => {
        if (commandRef) {
            commandRef.current = (cmd: string) => {
                switch (cmd) {
                    case 'hide-done':
                        setHideDone(prev => { const newVal = !prev; onHideDoneChange?.(newVal); return newVal; });
                        break;
                    case 'go-today':
                        goToToday();
                        break;
                    case 'prev':
                        scrollToPrevMonth();
                        break;
                    case 'next':
                        scrollToNextMonth();
                        break;
                    case 'view-':
                        setViewRange('week');
                        onViewRangeChange?.('week');
                        break;
                    case 'view0':
                        setViewRange('month');
                        onViewRangeChange?.('month');
                        break;
                    case 'view+':
                        setViewRange('3months');
                        onViewRangeChange?.('3months');
                        break;
                }
            };
        }
        return () => {
            if (commandRef) {
                commandRef.current = null;
            }
        };
    }, [commandRef, goToToday, scrollToPrevMonth, scrollToNextMonth, onHideDoneChange, onViewRangeChange]);

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
        const dayIndex = Math.floor(relativeX / dayWidth);
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

        hasMovedDuringResize.current = false;
        setResizing({
            taskId: task.id,
            edge,
            initialX: e.clientX,
            initialScrollLeft: scrollContainerRef.current?.scrollLeft ?? 0,
            initialStart: task.taskStart,
            initialEnd: task.taskEnd,
            currentStart: task.taskStart,
            currentEnd: task.taskEnd,
        });
    }, []);

    // Handle mouse move for resizing/dragging
    // Only updates local state (currentStart/currentEnd) during drag
    // Store is updated only on mouse up (like CalendarView)
    useEffect(() => {
        if (!resizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!scrollContainerRef.current || !resizing) return;

            hasMovedDuringResize.current = true;

            // Auto-scroll when near edges during resize/drag
            updateAutoScroll(e.clientX);

            const containerRect = scrollContainerRef.current.getBoundingClientRect();
            const scrollLeft = scrollContainerRef.current.scrollLeft;
            const newDate = calculateDateFromX(e.clientX, containerRect, scrollLeft);

            let newStart: Date;
            let newEnd: Date;

            if (resizing.edge === 'move') {
                // Moving the entire task bar - preserve duration
                // Use initialScrollLeft (captured at drag start) to calculate the initial position consistently
                const initialStartDate = calculateDateFromX(resizing.initialX, containerRect, resizing.initialScrollLeft);
                const daysDiff = differenceInDays(newDate, initialStartDate);

                newStart = addDays(resizing.initialStart, daysDiff);
                newEnd = addDays(resizing.initialEnd, daysDiff);
            } else {
                // Use initial dates from resizing state (captured at drag start)
                newStart = resizing.initialStart;
                newEnd = resizing.initialEnd;

                if (resizing.edge === 'left') {
                    // Moving start date - ensure it doesn't go past end date
                    if (newDate <= resizing.initialEnd) {
                        newStart = newDate;
                    }
                } else {
                    // Moving end date - ensure it doesn't go before start date
                    if (newDate >= resizing.initialStart) {
                        newEnd = newDate;
                    }
                }
            }

            // Only update local state during drag (don't touch store yet)
            // This prevents multiple history entries during a single drag
            setResizing(prev => prev ? {
                ...prev,
                currentStart: newStart,
                currentEnd: newEnd,
            } : null);
        };

        const handleMouseUp = () => {
            stopAutoScroll();
            if (hasMovedDuringResize.current) {
                // Only block click if actual drag/resize happened
                justFinishedResizing.current = true;
                setTimeout(() => {
                    justFinishedResizing.current = false;
                }, 100);

                // Update store ONLY on mouse up (single history entry)
                if (resizing.currentStart && resizing.currentEnd) {
                    stableTaskUpdate(resizing.taskId, {
                        startDate: format(resizing.currentStart, 'yyyy-MM-dd'),
                        dueDate: format(resizing.currentEnd, 'yyyy-MM-dd'),
                    });
                }
            }
            if (scrollContainerRef.current) {
                savedScrollLeftRef.current = scrollContainerRef.current.scrollLeft;
            }
            setResizing(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizing, calculateDateFromX, stableTaskUpdate, updateAutoScroll, stopAutoScroll]);

    return (
        <div style={{
            backgroundColor: theme.bg,
            borderRadius: '16px',
            height: '100%',
            maxHeight: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
                {/* Toolbar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 32px',
                    backgroundColor: theme.headerBg,
                    flexShrink: 0,
                    gap: '16px',
                    minHeight: '80px',
                }}>
                    {/* Left section - flex: 1 */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ margin: 0, fontSize: '32px', color: theme.text, flexShrink: 0, minWidth: '200px' }}>
                            {headerLabel}
                        </h2>
                        <button
                            onClick={() => { const newVal = !hideDone; setHideDone(newVal); onHideDoneChange?.(newVal); }}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '30px',
                                border: hideDone ? '1.5px solid transparent' : '1.5px solid rgba(255, 255, 255, 0.40)',
                                cursor: 'pointer',
                                fontSize: '16px',
                                fontWeight: 700,
                                backgroundColor: hideDone ? theme.primary : theme.surface,
                                color: hideDone ? 'rgba(255, 255, 255, 0.85)' : theme.textMuted,
                                transition: 'all 0.2s ease',
                                flexShrink: 0,
                            }}
                        >
                            Done 非表示
                        </button>
                    </div>

                    {/* English month name - center */}
                    <span style={{
                        fontSize: '32px',
                        fontWeight: 700,
                        color: theme.text,
                        letterSpacing: '0.05em',
                        opacity: 0.85,
                        flexShrink: 0,
                    }}>
                        {headerMonthEn}
                    </span>

                    {/* Right section - flex: 1 */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px' }}>
                        {/* View Range Toggle */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: theme.bg,
                            borderRadius: '30px',
                            padding: '5px',
                            gap: '2px',
                        }}>
                            {([
                                { range: 'week' as ViewRange, icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                        <line x1="8" y1="11" x2="14" y2="11" /><line x1="11" y1="8" x2="11" y2="14" />
                                    </svg>
                                )},
                                { range: 'month' as ViewRange, icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                )},
                                { range: '3months' as ViewRange, icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                        <line x1="8" y1="11" x2="14" y2="11" />
                                    </svg>
                                )},
                            ]).map(({ range, icon }) => (
                                <button
                                    key={range}
                                    onClick={() => { setViewRange(range); onViewRangeChange?.(range); }}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: '30px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: viewRange === range ? theme.primary : 'transparent',
                                        color: viewRange === range ? 'rgba(255, 255, 255, 0.85)' : theme.textMuted,
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>

                        {/* Navigation: ◀ Today ▶ */}
                        <button
                            type="button"
                            onClick={() => scrollToPrevMonth()}
                            style={{
                                width: '44px', height: '44px', borderRadius: '50%', border: 'none',
                                cursor: 'pointer', fontSize: '18px', lineHeight: 1,
                                backgroundColor: theme.surface, color: theme.textMuted,
                                flexShrink: 0,
                            }}
                        >
                            ◀
                        </button>
                        <button
                            type="button"
                            onClick={goToToday}
                            style={{
                                padding: '10px 26px',
                                borderRadius: '30px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '20px',
                                fontWeight: 700,
                                backgroundColor: theme.primary,
                                color: 'rgba(255, 255, 255, 0.85)',
                                flexShrink: 0,
                            }}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollToNextMonth()}
                            style={{
                                width: '44px', height: '44px', borderRadius: '50%', border: 'none',
                                cursor: 'pointer', fontSize: '18px', lineHeight: 1,
                                backgroundColor: theme.surface, color: theme.textMuted,
                                flexShrink: 0,
                            }}
                        >
                            ▶
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
                        cursor: resizing ? 'ew-resize' : 'default',
                        overscrollBehavior: 'contain',
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
                            {''}
                        </div>

                        {/* Date Headers */}
                        <div style={{ display: 'flex' }}>
                            {days.map((day, index) => {
                                const isToday = isSameDay(day, new Date());
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

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
                                            fontSize: '20px',
                                            color: isToday ? theme.primary : isWeekend ? theme.textMuted : theme.text,
                                            fontWeight: isToday ? 700 : 400,
                                            borderRight: `1px solid ${theme.border}`,
                                            backgroundColor: isToday ? `${theme.primary}20` : (day.getMonth() + 1) % 2 === 1 ? theme.monthOdd : theme.monthEven,
                                        }}
                                    >
                                        {/* Day number */}
                                        <div style={{ fontWeight: isToday ? 700 : 500, fontSize: '20px' }}>
                                            {format(day, 'd')}
                                        </div>
                                        {/* Day of week */}
                                        <div style={{
                                            fontSize: '20px',
                                            color: day.getDay() === 0 ? '#ef4444' : day.getDay() === 6 ? '#3b82f6' : theme.textMuted,
                                        }}>
                                            {dayOfWeekJP}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Task Rows with month watermarks overlay */}
                    <div style={{ position: 'relative' }}>
                        {/* Task rows content */}
                        {timelineTasks.length === 0 ? (
                            <div style={{
                                padding: '40px',
                                textAlign: 'center',
                                color: theme.textMuted,
                                minHeight: '200px',
                            }}>
                                No tasks to display. Create a new task to see it on the timeline.
                            </div>
                        ) : (
                            <div>
                            {timelineTasks.map((task) => {
                                // During drag, use local state (currentStart/currentEnd) for the dragged task
                                // This shows visual feedback without updating the store
                                const isBeingDragged = resizing?.taskId === task.id;
                                const effectiveTask = isBeingDragged && resizing
                                    ? { ...task, taskStart: resizing.currentStart, taskEnd: resizing.currentEnd }
                                    : task;
                                const position = getTaskPosition(effectiveTask);
                                return (
                                    <TaskRow
                                        key={task.id}
                                        task={effectiveTask}
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

                        {/* Month name watermarks — above grid cells, below task bars */}
                        {monthSpans.map((span) => {
                            const left = 200 + span.startIndex * dayWidth;
                            const width = (span.endIndex - span.startIndex + 1) * dayWidth;
                            const repeatCount = viewRange === 'week' ? 3 : 1;
                            const segmentWidth = width / repeatCount;
                            const fontSize = Math.min(segmentWidth * 0.6, 200);
                            return Array.from({ length: repeatCount }, (_, i) => (
                                <div
                                    key={`wm-${span.year}-${span.month}-${i}`}
                                    style={{
                                        position: 'absolute',
                                        left: `${left + segmentWidth * i}px`,
                                        width: `${segmentWidth}px`,
                                        top: 0,
                                        bottom: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: `${fontSize}px`,
                                        fontWeight: 900,
                                        color: 'rgba(255, 255, 255, 0.04)',
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                        lineHeight: 1,
                                        whiteSpace: 'nowrap',
                                        zIndex: 2,
                                        overflow: 'hidden',
                                    }}
                                >
                                    {span.name}
                                </div>
                            ));
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
