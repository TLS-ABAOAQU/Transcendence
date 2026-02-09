import React, { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import type { Task } from '../../types';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameDay,
    addMonths,
    subMonths,
    parseISO,
    isValid,
    differenceInDays,
    getWeek,
    max,
    min,
    addDays,
} from 'date-fns';

interface CalendarViewProps {
    tasks: Task[];
    themeColor?: string;
    onTaskClick?: (task: Task) => void;
    onTaskUpdate?: (taskId: string, updates: { startDate?: string; dueDate?: string }) => void;
    onTasksReorder?: (tasks: Task[]) => void;
    taskColorMap?: Record<string, string>;
    initialHideDone?: boolean;
    onHideDoneChange?: (hideDone: boolean) => void;
    commandRef?: React.MutableRefObject<((cmd: string) => void) | null>;
}

interface TaskWithDates extends Task {
    taskStart: Date;
    taskEnd: Date;
}

interface TaskSegment {
    task: TaskWithDates;
    startCol: number;
    endCol: number;
    isStart: boolean;
    isEnd: boolean;
    lane: number;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ tasks, onTaskClick, onTaskUpdate, taskColorMap, initialHideDone, onHideDoneChange, commandRef }) => {
    const [hideDone, setHideDone] = useState(initialHideDone ?? true);
    const [headerLabel, setHeaderLabel] = useState('');

    // Dragging task (for HTML5 drag and drop - move to any cell)
    const [draggingTask, setDraggingTask] = useState<Task | TaskWithDates | null>(null);

    // Drag preview state (for showing where the task will land)
    const [dragPreviewDate, setDragPreviewDate] = useState<Date | null>(null);

    // Resize state (for edge dragging only)
    const [resizeState, setResizeState] = useState<{
        taskId: string;
        mode: 'resize-start' | 'resize-end';
        initialX: number;
        initialStart: Date;
        initialEnd: Date;
        currentDaysDelta: number;
    } | null>(null);

    const calendarGridRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const savedScrollTopRef = useRef<number | null>(null);
    const autoScrollTimerRef = useRef<number | null>(null);
    const justFinishedResizingRef = useRef(false);

    // Auto-scroll: scroll the calendar when dragging near top/bottom edges
    const autoScroll = useCallback((clientY: number) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const hotZone = 80; // px from edge
        const maxSpeed = 12; // px per frame

        if (clientY < rect.top + hotZone) {
            // Near top edge — scroll up
            const distance = rect.top + hotZone - clientY;
            const speed = Math.min(maxSpeed, Math.ceil((distance / hotZone) * maxSpeed));
            container.scrollTop -= speed;
        } else if (clientY > rect.bottom - hotZone) {
            // Near bottom edge — scroll down
            const distance = clientY - (rect.bottom - hotZone);
            const speed = Math.min(maxSpeed, Math.ceil((distance / hotZone) * maxSpeed));
            container.scrollTop += speed;
        }
    }, []);

    const startAutoScroll = useCallback((clientY: number) => {
        if (autoScrollTimerRef.current !== null) {
            cancelAnimationFrame(autoScrollTimerRef.current);
        }
        const tick = () => {
            autoScroll(clientY);
            autoScrollTimerRef.current = requestAnimationFrame(tick);
        };
        autoScrollTimerRef.current = requestAnimationFrame(tick);
    }, [autoScroll]);

    const updateAutoScroll = useCallback((clientY: number) => {
        // Store latest Y for continuous scrolling
        const container = scrollContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const hotZone = 80;
        const inHotZone = clientY < rect.top + hotZone || clientY > rect.bottom - hotZone;

        if (inHotZone) {
            if (autoScrollTimerRef.current === null) {
                startAutoScroll(clientY);
            } else {
                // Update: cancel old timer, start new with updated Y
                cancelAnimationFrame(autoScrollTimerRef.current);
                startAutoScroll(clientY);
            }
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

    // Save scroll position before task updates, restore after re-render
    useLayoutEffect(() => {
        if (savedScrollTopRef.current !== null && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = savedScrollTopRef.current;
            savedScrollTopRef.current = null;
        }
    });

    // Theme colors - use CSS variables for dynamic theming
    const theme = {
        bg: 'var(--color-calendar-bg)',
        cardBg: 'var(--color-calendar-month-odd)',
        headerBg: 'var(--color-calendar-header-bg)',
        text: 'var(--color-calendar-text)',
        textMuted: 'var(--color-calendar-text-muted)',
        textFaded: 'var(--color-calendar-text-faded)',
        border: 'var(--color-calendar-border)',
        borderStrong: 'var(--color-calendar-border-strong)',
        buttonBg: 'var(--color-calendar-button-bg)',
        buttonActiveBg: 'var(--color-calendar-border-strong)',
        primary: 'var(--color-primary)',
        surface: 'var(--color-calendar-surface)',
        sunday: 'var(--color-calendar-sunday)',
        saturday: 'var(--color-calendar-saturday)',
        today: 'var(--color-primary)',
        monthOdd: 'var(--color-calendar-month-odd)',
        monthEven: 'var(--color-calendar-month-even)',
        watermark: 'var(--color-calendar-watermark)',
        taskBarText: 'var(--color-task-bar-text)',
    };

    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

    // Tasks with valid dates
    const tasksWithDates = useMemo((): TaskWithDates[] => {
        return tasks
            .filter(task => task.startDate && (!hideDone || task.status !== 'done'))
            .map(task => {
                const start = parseISO(task.startDate!);
                const end = task.dueDate ? parseISO(task.dueDate) : start;
                if (!isValid(start)) return null;
                return {
                    ...task,
                    taskStart: start,
                    taskEnd: isValid(end) ? end : start,
                };
            })
            .filter((t): t is TaskWithDates => t !== null);
    }, [tasks, hideDone]);

    // Extended weeks array — fixed range (±12 months from today), independent of task data
    const allWeeks = useMemo(() => {
        const today = new Date();
        const rangeStart = startOfWeek(startOfMonth(subMonths(today, 12)));
        const rangeEnd = endOfWeek(endOfMonth(addMonths(today, 12)));
        const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
        const weeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
        }
        return weeks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Compute month info per week for watermark rendering
    const monthWeekInfo = useMemo(() => {
        // First pass: determine month for each week using Thursday
        const weekMonths: { month: number; year: number }[] = allWeeks.map(week => {
            const thu = week[3];
            return { month: thu.getMonth(), year: thu.getFullYear() };
        });

        // Second pass: group consecutive weeks into month spans
        const spans: { name: string; startWeek: number; endWeek: number }[] = [];
        let currentKey = '';
        weekMonths.forEach(({ month, year }, weekIndex) => {
            const key = `${year}-${month}`;
            if (key !== currentKey) {
                if (spans.length > 0) spans[spans.length - 1].endWeek = weekIndex - 1;
                const d = new Date(year, month, 1);
                spans.push({ name: format(d, 'MMMM'), startWeek: weekIndex, endWeek: weekIndex });
                currentKey = key;
            }
        });
        if (spans.length > 0) spans[spans.length - 1].endWeek = allWeeks.length - 1;

        // Build map: weekIndex -> { name, indexInMonth, totalWeeks }
        const map = new Map<number, { name: string; indexInMonth: number; totalWeeks: number }>();
        spans.forEach(span => {
            const total = span.endWeek - span.startWeek + 1;
            for (let i = span.startWeek; i <= span.endWeek; i++) {
                map.set(i, { name: span.name, indexInMonth: i - span.startWeek, totalWeeks: total });
            }
        });
        return map;
    }, [allWeeks]);

    // Tasks with preview dates (applying resize delta or drag preview)
    const tasksWithPreviewDates = useMemo((): TaskWithDates[] => {
        if (resizeState) {
            return tasksWithDates.map(task => {
                if (task.id !== resizeState.taskId) return task;
                let previewStart = task.taskStart;
                let previewEnd = task.taskEnd;
                if (resizeState.mode === 'resize-start') {
                    previewStart = addDays(resizeState.initialStart, resizeState.currentDaysDelta);
                    if (previewStart > resizeState.initialEnd) previewStart = resizeState.initialEnd;
                } else if (resizeState.mode === 'resize-end') {
                    previewEnd = addDays(resizeState.initialEnd, resizeState.currentDaysDelta);
                    if (previewEnd < resizeState.initialStart) previewEnd = resizeState.initialStart;
                }
                return { ...task, taskStart: previewStart, taskEnd: previewEnd };
            });
        }
        if (draggingTask && dragPreviewDate) {
            const draggingTaskWithDates = tasksWithDates.find(t => t.id === draggingTask.id);
            if (draggingTaskWithDates) {
                const duration = differenceInDays(draggingTaskWithDates.taskEnd, draggingTaskWithDates.taskStart);
                const newStart = dragPreviewDate;
                const newEnd = addDays(dragPreviewDate, duration);
                return tasksWithDates.map(task => {
                    if (task.id !== draggingTask.id) return task;
                    return { ...task, taskStart: newStart, taskEnd: newEnd };
                });
            }
        }
        return tasksWithDates;
    }, [tasksWithDates, resizeState, draggingTask, dragPreviewDate]);

    // Tasks without dates
    const undatedTasks = useMemo(() => {
        return tasks.filter(task => !task.startDate);
    }, [tasks]);

    // Calculate task segments for each week
    const getTaskSegmentsForWeek = useCallback((week: Date[]): TaskSegment[] => {
        const weekStart = week[0];
        const weekEnd = week[6];
        const segments: TaskSegment[] = [];

        tasksWithPreviewDates.forEach(task => {
            if (task.taskEnd < weekStart || task.taskStart > weekEnd) return;
            const visibleStart = max([task.taskStart, weekStart]);
            const visibleEnd = min([task.taskEnd, weekEnd]);
            const startCol = differenceInDays(visibleStart, weekStart);
            const endCol = differenceInDays(visibleEnd, weekStart);
            segments.push({
                task, startCol, endCol,
                isStart: isSameDay(task.taskStart, visibleStart),
                isEnd: isSameDay(task.taskEnd, visibleEnd),
                lane: 0,
            });
        });

        segments.sort((a, b) => {
            const aStarred = a.task.starred ? 1 : 0;
            const bStarred = b.task.starred ? 1 : 0;
            if (aStarred !== bStarred) return bStarred - aStarred;
            const startDiff = a.task.taskStart.getTime() - b.task.taskStart.getTime();
            if (startDiff !== 0) return startDiff;
            return a.task.taskEnd.getTime() - b.task.taskEnd.getTime();
        });

        const lanes: number[][] = [];
        segments.forEach(segment => {
            let assignedLane = 0;
            for (let lane = 0; lane < lanes.length; lane++) {
                const conflicts = lanes[lane].some(endCol => segment.startCol <= endCol);
                if (!conflicts) { assignedLane = lane; break; }
                assignedLane = lane + 1;
            }
            segment.lane = assignedLane;
            if (!lanes[assignedLane]) lanes[assignedLane] = [];
            lanes[assignedLane].push(segment.endCol);
        });

        return segments;
    }, [tasksWithPreviewDates]);

    // Pre-compute all segments for performance
    const allSegments = useMemo(() => {
        return allWeeks.map(week => getTaskSegmentsForWeek(week));
    }, [allWeeks, getTaskSegmentsForWeek]);

    // Color palette fallback for tasks
    const taskColorsFallback = [
        '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
        '#EF4444', '#EC4899', '#06B6D4', '#F97316',
    ];

    const getTaskColor = (taskId: string) => {
        if (taskColorMap && taskColorMap[taskId]) return taskColorMap[taskId];
        let hash = 0;
        for (let i = 0; i < taskId.length; i++) {
            hash = taskId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return taskColorsFallback[Math.abs(hash) % taskColorsFallback.length];
    };

    // === Scroll-based header label ===
    const updateHeaderLabel = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container || allWeeks.length === 0) return;
        // Use center of visible area to determine month
        const centerY = container.scrollTop + container.clientHeight / 2;
        const rows = container.querySelectorAll('[data-week-index]');
        let centerWeekIndex = 0;
        for (const row of rows) {
            const el = row as HTMLElement;
            if (el.offsetTop + el.offsetHeight > centerY) {
                centerWeekIndex = parseInt(el.dataset.weekIndex || '0', 10);
                break;
            }
        }
        if (allWeeks[centerWeekIndex]) {
            const thu = allWeeks[centerWeekIndex][4];
            setHeaderLabel(`${thu.getFullYear()}年${thu.getMonth() + 1}月`);
        }
    }, [allWeeks]);

    // Scroll event listener
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const handleScroll = () => updateHeaderLabel();
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [updateHeaderLabel]);

    // Initial scroll to today's month (once on mount)
    const hasScrolledRef = useRef(false);
    useEffect(() => {
        if (hasScrolledRef.current) return;
        if (allWeeks.length === 0) return;
        hasScrolledRef.current = true;
        requestAnimationFrame(() => {
            const container = scrollContainerRef.current;
            if (!container) return;
            const today = new Date();
            const targetYear = today.getFullYear();
            const targetMonth = today.getMonth() + 1;
            const targetWeekIndex = allWeeks.findIndex(week => {
                const thu = week[4];
                return thu.getFullYear() === targetYear && thu.getMonth() + 1 === targetMonth;
            });
            if (targetWeekIndex >= 0) {
                const row = container.querySelector(`[data-week-index="${targetWeekIndex}"]`);
                if (row) {
                    container.scrollTop = (row as HTMLElement).offsetTop + 2;
                }
            }
            updateHeaderLabel();
        });
    }, [allWeeks, updateHeaderLabel]);

    // Scroll to a specific month (find first week whose Thursday is in that month)
    const scrollToMonth = useCallback((year: number, month: number) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const targetWeekIndex = allWeeks.findIndex(week => {
            const thu = week[4];
            return thu.getFullYear() === year && thu.getMonth() + 1 === month;
        });
        if (targetWeekIndex >= 0) {
            const row = container.querySelector(`[data-week-index="${targetWeekIndex}"]`);
            if (row) {
                const el = row as HTMLElement;
                container.scrollTo({
                    top: el.offsetTop + 2,
                    behavior: 'smooth',
                });
            }
        }
    }, [allWeeks]);

    // ◀: Scroll to current month's first week, or previous month's first week if already there
    const scrollToPrevMonthBoundary = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const currentScrollTop = container.scrollTop;
        // Find the current top visible week index and its month
        const rows = container.querySelectorAll('[data-week-index]');
        let currentMonth = -1;
        let topWeekIndex = -1;
        for (const row of rows) {
            const el = row as HTMLElement;
            if (el.offsetTop + el.offsetHeight > currentScrollTop) {
                topWeekIndex = parseInt(el.dataset.weekIndex || '0', 10);
                const thu = allWeeks[topWeekIndex]?.[4];
                if (thu) currentMonth = thu.getFullYear() * 100 + thu.getMonth();
                break;
            }
        }
        // Find the first week of the current month
        const firstWeekOfCurrentMonth = allWeeks.findIndex(w => {
            const t = w[4];
            return t.getFullYear() * 100 + t.getMonth() === currentMonth;
        });
        // If not already at the first week of current month, go there
        if (firstWeekOfCurrentMonth >= 0 && firstWeekOfCurrentMonth < topWeekIndex) {
            const thu = allWeeks[firstWeekOfCurrentMonth][4];
            scrollToMonth(thu.getFullYear(), thu.getMonth() + 1);
            return;
        }
        // Already at first week — go to previous month's first week
        for (let i = allWeeks.length - 1; i >= 0; i--) {
            const thu = allWeeks[i][4];
            const monthKey = thu.getFullYear() * 100 + thu.getMonth();
            if (monthKey < currentMonth) {
                scrollToMonth(thu.getFullYear(), thu.getMonth() + 1);
                return;
            }
        }
    }, [allWeeks, scrollToMonth]);

    const scrollToNextMonthBoundary = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const currentScrollTop = container.scrollTop;
        // Find the current top visible week
        const rows = container.querySelectorAll('[data-week-index]');
        let currentMonth = -1;
        for (const row of rows) {
            const el = row as HTMLElement;
            if (el.offsetTop + el.offsetHeight > currentScrollTop) {
                const wi = parseInt(el.dataset.weekIndex || '0', 10);
                const thu = allWeeks[wi]?.[4];
                if (thu) currentMonth = thu.getFullYear() * 100 + thu.getMonth();
                break;
            }
        }
        // Find the first week of the next month
        for (let i = 0; i < allWeeks.length; i++) {
            const thu = allWeeks[i][4];
            const monthKey = thu.getFullYear() * 100 + thu.getMonth();
            if (monthKey > currentMonth) {
                scrollToMonth(thu.getFullYear(), thu.getMonth() + 1);
                return;
            }
        }
    }, [allWeeks, scrollToMonth]);

    // Horizontal swipe (trackpad) to navigate months
    const scrollToPrevMonthBoundaryRef = useRef(scrollToPrevMonthBoundary);
    scrollToPrevMonthBoundaryRef.current = scrollToPrevMonthBoundary;
    const scrollToNextMonthBoundaryRef = useRef(scrollToNextMonthBoundary);
    scrollToNextMonthBoundaryRef.current = scrollToNextMonthBoundary;

    // Command palette handler
    useEffect(() => {
        if (commandRef) {
            commandRef.current = (cmd: string) => {
                switch (cmd) {
                    case 'hide-done':
                        setHideDone(prev => { const newVal = !prev; onHideDoneChange?.(newVal); return newVal; });
                        break;
                    case 'go-today':
                        const now = new Date();
                        scrollToMonth(now.getFullYear(), now.getMonth() + 1);
                        break;
                    case 'prev':
                        scrollToPrevMonthBoundary();
                        break;
                    case 'next':
                        scrollToNextMonthBoundary();
                        break;
                }
            };
        }
        return () => {
            if (commandRef) {
                commandRef.current = null;
            }
        };
    }, [commandRef, scrollToMonth, scrollToPrevMonthBoundary, scrollToNextMonthBoundary, onHideDoneChange]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let accumulatedDeltaX = 0;
        const threshold = 1;
        let hasNavigated = false;  // Has already navigated in this swipe session
        let idleTimer: ReturnType<typeof setTimeout> | null = null;

        const resetSwipeSession = () => {
            // Reset when swipe gesture ends
            accumulatedDeltaX = 0;
            hasNavigated = false;
        };

        const handleWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 5) {
                e.preventDefault();

                // Reset idle timer (swipe still ongoing)
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(resetSwipeSession, 150); // 150ms idle = swipe ended

                // Ignore if already navigated in this swipe session
                if (hasNavigated) return;

                accumulatedDeltaX += e.deltaX;

                if (accumulatedDeltaX > threshold) {
                    hasNavigated = true;
                    scrollToNextMonthBoundaryRef.current();
                } else if (accumulatedDeltaX < -threshold) {
                    hasNavigated = true;
                    scrollToPrevMonthBoundaryRef.current();
                }
            } else {
                // Reset on vertical scroll
                if (idleTimer) clearTimeout(idleTimer);
                resetSwipeSession();
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', handleWheel);
            if (idleTimer) clearTimeout(idleTimer);
        };
    }, []);

    // Handle drag start for task bar
    const handleTaskBarDragStart = useCallback((e: React.DragEvent, task: TaskWithDates) => {
        setDraggingTask(task);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.setData('application/task-duration', String(differenceInDays(task.taskEnd, task.taskStart)));
        const dragImage = document.createElement('div');
        dragImage.style.cssText = 'position: absolute; top: -1000px; width: 1px; height: 1px; opacity: 0;';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 0, 0);
        setTimeout(() => document.body.removeChild(dragImage), 0);
    }, []);

    // Handle resize start
    const handleResizeStart = useCallback((e: React.MouseEvent, task: TaskWithDates, mode: 'resize-start' | 'resize-end') => {
        e.preventDefault();
        e.stopPropagation();
        setResizeState({
            taskId: task.id, mode,
            initialX: e.clientX,
            initialStart: task.taskStart,
            initialEnd: task.taskEnd,
            currentDaysDelta: 0,
        });
    }, []);

    // Calculate target date from mouse position (scroll-aware)
    const getDateFromMousePosition = useCallback((e: MouseEvent): Date | null => {
        if (!calendarGridRef.current || !scrollContainerRef.current) return null;

        const gridRect = calendarGridRef.current.getBoundingClientRect();
        const gridLeft = gridRect.left + 40; // Skip week number column
        const gridWidth = gridRect.width - 40;
        const dayWidth = gridWidth / 7;

        const container = scrollContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;
        const relativeY = e.clientY - containerRect.top + scrollTop;

        // Find which week row we're in
        const weekRows = container.querySelectorAll('[data-week-index]');
        let weekIndex = 0;

        for (const row of weekRows) {
            const el = row as HTMLElement;
            if (relativeY < el.offsetTop + el.offsetHeight) {
                weekIndex = parseInt(el.dataset.weekIndex || '0', 10);
                break;
            }
            weekIndex = parseInt(el.dataset.weekIndex || '0', 10);
        }

        const relativeX = e.clientX - gridLeft;
        const dayIndex = Math.floor(relativeX / dayWidth);
        const clampedDayIndex = Math.max(0, Math.min(6, dayIndex));
        const clampedWeekIndex = Math.max(0, Math.min(allWeeks.length - 1, weekIndex));

        if (allWeeks[clampedWeekIndex]) {
            return allWeeks[clampedWeekIndex][clampedDayIndex];
        }
        return null;
    }, [allWeeks]);

    // Wrap onTaskUpdate to preserve scroll position
    const stableTaskUpdate = useCallback((taskId: string, updates: Record<string, unknown>) => {
        if (!onTaskUpdate) return;
        if (scrollContainerRef.current) {
            savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
        }
        onTaskUpdate(taskId, updates);
    }, [onTaskUpdate]);

    // Handle mouse move for resizing
    useEffect(() => {
        if (!resizeState || !calendarGridRef.current) return;

        const handleMouseMove = (e: MouseEvent) => {
            // Auto-scroll when near edges during resize
            updateAutoScroll(e.clientY);

            const targetDate = getDateFromMousePosition(e);
            if (!targetDate) return;
            let daysDelta: number;
            if (resizeState.mode === 'resize-start') {
                daysDelta = differenceInDays(targetDate, resizeState.initialStart);
            } else {
                daysDelta = differenceInDays(targetDate, resizeState.initialEnd);
            }
            if (daysDelta !== resizeState.currentDaysDelta) {
                setResizeState(prev => prev ? { ...prev, currentDaysDelta: daysDelta } : null);
            }
        };

        const handleMouseUp = () => {
            stopAutoScroll();
            if (resizeState.currentDaysDelta !== 0) {
                let newStart = resizeState.initialStart;
                let newEnd = resizeState.initialEnd;
                if (resizeState.mode === 'resize-start') {
                    newStart = addDays(resizeState.initialStart, resizeState.currentDaysDelta);
                    if (newStart > resizeState.initialEnd) newStart = resizeState.initialEnd;
                } else if (resizeState.mode === 'resize-end') {
                    newEnd = addDays(resizeState.initialEnd, resizeState.currentDaysDelta);
                    if (newEnd < resizeState.initialStart) newEnd = resizeState.initialStart;
                }
                stableTaskUpdate(resizeState.taskId, {
                    startDate: format(newStart, 'yyyy-MM-dd'),
                    dueDate: format(newEnd, 'yyyy-MM-dd'),
                });
            }
            // Save scroll position again before clearing resize state,
            // since setResizeState(null) triggers another re-render
            if (scrollContainerRef.current) {
                savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
            }
            justFinishedResizingRef.current = true;
            setResizeState(null);
            setTimeout(() => { justFinishedResizingRef.current = false; }, 200);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizeState, stableTaskUpdate, getDateFromMousePosition, updateAutoScroll, stopAutoScroll]);

    // Handle drop on undated area (remove dates)
    const handleDropOnUndated = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!draggingTask) return;
        stableTaskUpdate(draggingTask.id, { startDate: undefined, dueDate: undefined });
        if (scrollContainerRef.current) {
            savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
        }
        setDraggingTask(null);
    }, [draggingTask, stableTaskUpdate]);

    // Render task bar segment
    const renderTaskSegment = (segment: TaskSegment, weekIndex: number) => {
        const { task, startCol, endCol, isStart, isEnd, lane } = segment;
        const taskColor = getTaskColor(task.id);
        const isResizing = resizeState?.taskId === task.id;
        const isDraggingThis = draggingTask?.id === task.id;
        const spanWidth = endCol - startCol + 1;
        const leftPercent = (startCol / 7) * 100;
        const widthPercent = (spanWidth / 7) * 100;
        const topOffset = 52;
        const laneHeight = 40;
        const barHeight = 36;

        return (
            <div
                key={`${task.id}-${weekIndex}`}
                draggable={!isResizing}
                onDragStart={(e) => handleTaskBarDragStart(e, task)}
                onDragEnd={() => {
                    stopAutoScroll();
                    if (scrollContainerRef.current) {
                        savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
                    }
                    setDraggingTask(null);
                    setDragPreviewDate(null);
                }}
                style={{
                    position: 'absolute',
                    left: `calc(${leftPercent}% + 4px)`,
                    width: `calc(${widthPercent}% - 8px)`,
                    top: `${topOffset + lane * laneHeight}px`,
                    height: `${barHeight}px`,
                    backgroundColor: taskColor,
                    borderRadius: isStart && isEnd ? '6px' : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : '0',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: isResizing ? 'ew-resize' : 'grab',
                    opacity: isDraggingThis ? 0.5 : 1,
                    zIndex: isResizing || isDraggingThis ? 100 : 10,
                    boxShadow: isResizing ? '0 4px 12px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.2)',
                    transition: isResizing ? 'none' : 'box-shadow 0.15s ease',
                    overflow: 'hidden',
                }}
                title={task.title}
                onClick={(e) => {
                    if (!isResizing && !isDraggingThis && !justFinishedResizingRef.current) {
                        e.stopPropagation();
                        onTaskClick?.(task);
                    }
                }}
            >
                {isStart && (
                    <div
                        onMouseDown={(e) => handleResizeStart(e, task, 'resize-start')}
                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '10px', cursor: 'ew-resize', zIndex: 2 }}
                    />
                )}
                <div
                    style={{
                        position: 'absolute',
                        left: isStart ? '10px' : '0',
                        right: isEnd ? '10px' : '0',
                        top: 0, bottom: 0,
                        display: 'flex', alignItems: 'center',
                        paddingLeft: isStart ? '4px' : '8px',
                        paddingRight: isEnd ? '4px' : '8px',
                        pointerEvents: 'none', overflow: 'hidden',
                    }}
                >
                    {isStart && (
                        <span style={{
                            fontSize: '20px', fontWeight: 600, color: theme.taskBarText,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {task.starred && <span style={{ marginRight: '2px' }}>{'\u2605'}</span>}
                            {task.title}
                        </span>
                    )}
                </div>
                {isEnd && (
                    <div
                        onMouseDown={(e) => handleResizeStart(e, task, 'resize-end')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px', cursor: 'ew-resize', zIndex: 2 }}
                    />
                )}
            </div>
        );
    };

    return (
        <div
            style={{
                display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%', minHeight: 0,
                backgroundColor: theme.bg, borderRadius: '16px', overflow: 'hidden',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 32px', backgroundColor: theme.headerBg, gap: '16px', minHeight: '80px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ margin: 0, fontSize: '32px', color: theme.text, flexShrink: 0, minWidth: '200px' }}>
                        {headerLabel}
                    </h2>

                    {/* Hide Done toggle */}
                    <button
                        onClick={() => { const newVal = !hideDone; setHideDone(newVal); onHideDoneChange?.(newVal); }}
                        title={hideDone ? 'Show Done tasks' : 'Hide Done tasks'}
                        style={{
                            padding: '8px 20px', borderRadius: '30px',
                            border: hideDone ? '1.5px solid transparent' : '1.5px solid rgba(255, 255, 255, 0.40)',
                            cursor: 'pointer', fontSize: '16px', fontWeight: 700,
                            backgroundColor: hideDone ? theme.primary : theme.surface,
                            color: hideDone ? 'rgba(255, 255, 255, 0.85)' : theme.textMuted,
                            transition: 'all 0.2s ease', flexShrink: 0,
                        }}
                    >
                        Done 非表示
                    </button>
                </div>

                {/* Undated Tasks Section */}
                <div
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.backgroundColor = '#4B5563';
                    }}
                    onDragLeave={(e) => { e.currentTarget.style.backgroundColor = theme.buttonBg; }}
                    onDrop={(e) => {
                        e.currentTarget.style.backgroundColor = theme.buttonBg;
                        handleDropOnUndated(e);
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', flex: 1, minWidth: 0,
                        overflow: 'hidden', backgroundColor: theme.buttonBg,
                        borderRadius: '8px', padding: '0 2px',
                        height: '48px',
                        transition: 'background-color 0.15s ease',
                    }}
                >
                    {undatedTasks.length > 0 ? (
                        <div style={{
                            display: 'flex', gap: '6px', overflowX: 'auto', padding: '0 4px',
                            scrollbarWidth: 'thin', scrollbarColor: `${theme.borderStrong} transparent`,
                            alignItems: 'center', height: '100%',
                        }}>
                            {undatedTasks.map(task => {
                                const taskColor = getTaskColor(task.id);
                                const isDraggingThis = draggingTask?.id === task.id;
                                return (
                                    <div
                                        key={task.id}
                                        draggable
                                        onDragStart={(e) => {
                                            setDraggingTask(task);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', task.id);
                                        }}
                                        onDragEnd={() => {
                                            stopAutoScroll();
                                            if (scrollContainerRef.current) {
                                                savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
                                            }
                                            setDraggingTask(null);
                                            setDragPreviewDate(null);
                                        }}
                                        onClick={() => onTaskClick?.(task)}
                                        style={{
                                            fontSize: '16px', padding: '4px 12px',
                                            backgroundColor: taskColor, color: theme.taskBarText,
                                            borderRadius: '14px', whiteSpace: 'nowrap',
                                            cursor: 'grab', fontWeight: 700, flexShrink: 0,
                                            opacity: isDraggingThis ? 0.5 : 1,
                                        }}
                                        title={`${task.title} - ドラッグしてカレンダーにドロップ`}
                                    >
                                        {task.title}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: '4px 12px', fontSize: '20px', color: theme.textMuted }}>
                            ここにドロップで日付解除
                        </div>
                    )}
                </div>

                {/* Navigation: ◀ Today ▶ */}
                <button
                    type="button"
                    onClick={() => scrollToPrevMonthBoundary()}
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
                    onClick={() => {
                        const today = new Date();
                        scrollToMonth(today.getFullYear(), today.getMonth() + 1);
                    }}
                    style={{
                        padding: '10px 26px', borderRadius: '30px', border: 'none',
                        cursor: 'pointer', fontSize: '20px', fontWeight: 700,
                        backgroundColor: theme.primary, color: 'rgba(255, 255, 255, 0.85)',
                        flexShrink: 0,
                    }}
                >
                    Today
                </button>
                <button
                    type="button"
                    onClick={() => scrollToNextMonthBoundary()}
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

            {/* Calendar Grid */}
            <div ref={calendarGridRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                {/* Weekday Headers (fixed, does not scroll) */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '40px repeat(7, 1fr)',
                        borderBottom: `1px solid ${theme.borderStrong}`,
                        backgroundColor: theme.headerBg,
                    }}
                >
                    <div style={{ padding: '12px 8px' }}></div>
                    {weekDays.map((day, i) => (
                        <div
                            key={i}
                            style={{
                                padding: '12px 8px', textAlign: 'center',
                                fontSize: '20px', fontWeight: '600',
                                color: i === 0 ? theme.sunday : i === 6 ? theme.saturday : theme.text,
                            }}
                        >
                            {day}
                        </div>
                    ))}
                </div>

                {/* Scrollable Week Rows */}
                <div
                    ref={scrollContainerRef}
                    className="calendar-scroll-hide"
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        minHeight: 0,
                        position: 'relative',
                        scrollbarWidth: 'none',
                        overscrollBehavior: 'contain',
                    } as React.CSSProperties}
                    onDragOver={(e) => {
                        // Auto-scroll when dragging near top/bottom edges
                        if (draggingTask) {
                            updateAutoScroll(e.clientY);
                        }
                    }}
                    onDragLeave={() => stopAutoScroll()}
                    onDrop={() => stopAutoScroll()}
                    onDragEnd={() => stopAutoScroll()}
                >
                    {allWeeks.map((week, weekIndex) => {
                        const weekNum = getWeek(week[0]);
                        const segments = allSegments[weekIndex] || [];
                        const maxLane = segments.length > 0 ? Math.max(...segments.map(s => s.lane)) : -1;
                        const rowHeight = Math.max(140, 58 + (maxLane + 1) * 40);

                        return (
                            <React.Fragment key={weekIndex}>
                                {/* Week Row */}
                                <div
                                    data-week-index={weekIndex}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '40px repeat(7, 1fr)',
                                        minHeight: `${rowHeight}px`,
                                        borderBottom: `1px solid ${theme.border}`,
                                        position: 'relative',
                                    }}
                                >
                                    {/* Week Number */}
                                    <div style={{
                                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                                        paddingTop: '12px', fontSize: '20px',
                                        color: theme.textFaded, fontWeight: '500',
                                    }}>
                                        {weekNum}
                                    </div>

                                    {/* Days Grid */}
                                    {week.map((day, dayIndex) => {
                                        const dayMonth = day.getMonth() + 1; // 1-12
                                        const isOddMonth = dayMonth % 2 === 1;
                                        const dayBg = isOddMonth ? theme.monthOdd : theme.monthEven;
                                        const isToday = isSameDay(day, new Date());
                                        const dayNum = format(day, 'd');
                                        const dayLabel = dayNum === '1' ? format(day, 'M月d日') : `${dayNum}日`;

                                        let textColor = theme.text;
                                        if (dayIndex === 0) textColor = theme.sunday;
                                        if (dayIndex === 6) textColor = theme.saturday;

                                        return (
                                            <div
                                                key={day.toISOString()}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.currentTarget.style.backgroundColor = '#374151';
                                                }}
                                                onDragLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = isToday ? `${theme.today}20` : dayBg;
                                                }}
                                                onDrop={(e) => {
                                                    e.currentTarget.style.backgroundColor = isToday ? `${theme.today}20` : dayBg;
                                                    if (draggingTask && onTaskUpdate) {
                                                        const durationStr = e.dataTransfer.getData('application/task-duration');
                                                        const duration = durationStr ? parseInt(durationStr, 10) : 0;
                                                        const newStartDate = format(day, 'yyyy-MM-dd');
                                                        const newEndDate = duration > 0 ? format(addDays(day, duration), 'yyyy-MM-dd') : newStartDate;
                                                        stableTaskUpdate(draggingTask.id, { startDate: newStartDate, dueDate: newEndDate });
                                                        if (scrollContainerRef.current) {
                                                            savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
                                                        }
                                                        setDraggingTask(null);
                                                        setDragPreviewDate(null);
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex', flexDirection: 'column',
                                                    justifyContent: 'flex-start', alignItems: 'stretch',
                                                    padding: '8px',
                                                    borderRight: dayIndex < 6 ? `1px solid ${theme.border}` : 'none',
                                                    backgroundColor: isToday ? `${theme.today}20` : dayBg,
                                                    transition: 'background-color 0.15s ease',
                                                    minHeight: '100%',
                                                }}
                                            >
                                                <div style={{
                                                    display: 'flex', justifyContent: 'flex-start',
                                                    alignItems: 'center', height: '36px', flexShrink: 0,
                                                }}>
                                                    {isToday ? (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            minWidth: '36px', height: '36px', padding: '0 8px',
                                                            backgroundColor: theme.today, borderRadius: '18px',
                                                            color: '#FFFFFF', fontSize: '20px', fontWeight: '600',
                                                        }}>
                                                            {dayLabel}
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', height: '36px',
                                                            color: textColor, fontSize: '20px', fontWeight: '600',
                                                        }}>
                                                            {dayLabel}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Task Bars */}
                                    <div
                                        style={{
                                            position: 'absolute', top: 0, left: '40px', right: 0, bottom: 0,
                                            pointerEvents: 'auto',
                                        }}
                                        onDragOver={(e) => {
                                            if (draggingTask) {
                                                e.preventDefault();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = e.clientX - rect.left;
                                                const dayWidth = rect.width / 7;
                                                const dayIndex = Math.floor(x / dayWidth);
                                                const targetDay = week[Math.max(0, Math.min(6, dayIndex))];
                                                if (!dragPreviewDate || !isSameDay(dragPreviewDate, targetDay)) {
                                                    if (scrollContainerRef.current) {
                                                        savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
                                                    }
                                                    setDragPreviewDate(targetDay);
                                                }
                                            }
                                        }}
                                        onDragLeave={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            if (e.clientX < rect.left || e.clientX > rect.right ||
                                                e.clientY < rect.top || e.clientY > rect.bottom) {
                                                // Don't clear - let other containers handle it
                                            }
                                        }}
                                        onDrop={(e) => {
                                            if (!draggingTask) return;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = e.clientX - rect.left;
                                            const dayWidth = rect.width / 7;
                                            const dayIndex = Math.floor(x / dayWidth);
                                            const targetDay = week[Math.max(0, Math.min(6, dayIndex))];
                                            const durationStr = e.dataTransfer.getData('application/task-duration');
                                            const duration = durationStr ? parseInt(durationStr, 10) : 0;
                                            const newStartDate = format(targetDay, 'yyyy-MM-dd');
                                            const newEndDate = duration > 0 ? format(addDays(targetDay, duration), 'yyyy-MM-dd') : newStartDate;
                                            stableTaskUpdate(draggingTask.id, { startDate: newStartDate, dueDate: newEndDate });
                                            if (scrollContainerRef.current) {
                                                savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
                                            }
                                            setDraggingTask(null);
                                            setDragPreviewDate(null);
                                        }}
                                    >
                                        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                                            {segments.map(segment => renderTaskSegment(segment, weekIndex))}
                                        </div>
                                    </div>
                                    {/* Month name watermark */}
                                    {(() => {
                                        const info = monthWeekInfo.get(weekIndex);
                                        if (!info) return null;
                                        const { name, indexInMonth, totalWeeks } = info;
                                        // Each row shows a clip of the full text, offset so it appears as one large text spanning all weeks
                                        const totalHeight = totalWeeks * rowHeight;
                                        const fontSize = Math.min(totalHeight * 0.45, 220);
                                        const topOffset = -(indexInMonth * rowHeight) + (totalHeight - fontSize) / 2;
                                        return (
                                            <div style={{
                                                position: 'absolute',
                                                left: '40px',
                                                right: 0,
                                                top: 0,
                                                height: `${rowHeight}px`,
                                                overflow: 'hidden',
                                                pointerEvents: 'none',
                                                userSelect: 'none',
                                                zIndex: 2,
                                            }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    top: `${topOffset}px`,
                                                    left: 0,
                                                    right: 0,
                                                    height: `${fontSize}px`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: `${fontSize}px`,
                                                    fontWeight: 900,
                                                    color: theme.watermark,
                                                    lineHeight: 1,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {name}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
