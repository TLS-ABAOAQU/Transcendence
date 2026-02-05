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

export const CalendarView: React.FC<CalendarViewProps> = ({ tasks, onTaskClick, onTaskUpdate, taskColorMap }) => {
    const [hideDone, setHideDone] = useState(true);
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

    // Save scroll position before task updates, restore after re-render
    useLayoutEffect(() => {
        if (savedScrollTopRef.current !== null && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = savedScrollTopRef.current;
            savedScrollTopRef.current = null;
        }
    });

    // Theme colors (dark mode only)
    const theme = {
        bg: '#1F2937',
        cardBg: '#111827',
        headerBg: '#1F2937',
        text: '#F9FAFB',
        textMuted: '#9CA3AF',
        textFaded: '#6B7280',
        border: '#374151',
        borderStrong: '#4B5563',
        buttonBg: '#374151',
        buttonActiveBg: '#4B5563',
        primary: '#8b5cf6',
        surface: '#1e293b',
        sunday: '#EF4444',
        saturday: '#3B82F6',
        today: '#EF4444',
        monthOdd: '#111827',   // Odd months (1,3,5,7,9,11) — darker
        monthEven: '#1a2332',  // Even months (2,4,6,8,10,12) — slightly lighter
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

    // Extended weeks array (replaces single-month `weeks`)
    const { allWeeks, todayWeekIndex } = useMemo(() => {
        const today = new Date();
        let earliest: Date = today;
        let latest: Date = today;
        tasksWithDates.forEach(t => {
            if (t.taskStart < earliest) earliest = t.taskStart;
            if (t.taskEnd > latest) latest = t.taskEnd;
        });
        const rangeStart = startOfWeek(startOfMonth(subMonths(earliest < today ? earliest : today, 3)));
        const rangeEnd = endOfWeek(endOfMonth(addMonths(latest > today ? latest : today, 3)));
        const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
        const weeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
        }
        const todayIdx = weeks.findIndex(w => w.some(d => isSameDay(d, today)));
        return { allWeeks: weeks, todayWeekIndex: Math.max(todayIdx, 0) };
    }, [tasksWithDates]);

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
        const scrollTop = container.scrollTop;
        const rows = container.querySelectorAll('[data-week-index]');
        let topWeekIndex = 0;
        for (const row of rows) {
            const el = row as HTMLElement;
            if (el.offsetTop + el.offsetHeight > scrollTop) {
                topWeekIndex = parseInt(el.dataset.weekIndex || '0', 10);
                break;
            }
        }
        if (allWeeks[topWeekIndex]) {
            const thu = allWeeks[topWeekIndex][4];
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

    // goToToday (scroll version)
    const goToToday = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const row = container.querySelector(`[data-week-index="${todayWeekIndex}"]`);
        if (row) {
            const el = row as HTMLElement;
            container.scrollTo({
                top: Math.max(0, el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2),
                behavior: 'smooth',
            });
        }
    }, [todayWeekIndex]);

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

    // Derive prev/next month from headerLabel
    const { prevMonth, nextMonth } = useMemo(() => {
        const match = headerLabel.match(/(\d+)年(\d+)月/);
        if (!match) return { prevMonth: { year: 0, month: 0 }, nextMonth: { year: 0, month: 0 } };
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const pMonth = month === 1 ? 12 : month - 1;
        const pYear = month === 1 ? year - 1 : year;
        const nMonth = month === 12 ? 1 : month + 1;
        const nYear = month === 12 ? year + 1 : year;
        return {
            prevMonth: { year: pYear, month: pMonth },
            nextMonth: { year: nYear, month: nMonth },
        };
    }, [headerLabel]);

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
            setResizeState(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizeState, stableTaskUpdate, getDateFromMousePosition]);

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
        const topOffset = 44;
        const laneHeight = 32;
        const barHeight = 28;

        return (
            <div
                key={`${task.id}-${weekIndex}`}
                draggable={!isResizing}
                onDragStart={(e) => handleTaskBarDragStart(e, task)}
                onDragEnd={() => { setDraggingTask(null); setDragPreviewDate(null); }}
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
                    if (!isResizing && !isDraggingThis) {
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
                            fontSize: '16px', fontWeight: 600, color: '#1e293b',
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
                    padding: '24px 32px', backgroundColor: theme.headerBg, gap: '16px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ margin: 0, fontSize: '26px', color: theme.text, flexShrink: 0, minWidth: '180px' }}>
                        {headerLabel}
                    </h2>

                    {/* Hide Done toggle */}
                    <button
                        onClick={() => setHideDone(!hideDone)}
                        title={hideDone ? 'Show Done tasks' : 'Hide Done tasks'}
                        style={{
                            padding: '10px 26px', borderRadius: '30px', border: 'none',
                            cursor: 'pointer', fontSize: '20px', fontWeight: 700,
                            backgroundColor: hideDone ? theme.primary : theme.surface,
                            color: hideDone ? '#fff' : theme.textMuted,
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
                        borderRadius: '30px', padding: '4px 6px',
                        transition: 'background-color 0.15s ease',
                    }}
                >
                    {undatedTasks.length > 0 ? (
                        <div style={{
                            display: 'flex', gap: '6px', overflowX: 'auto', padding: '4px 8px',
                            scrollbarWidth: 'thin', scrollbarColor: `${theme.borderStrong} transparent`,
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
                                        onDragEnd={() => { setDraggingTask(null); setDragPreviewDate(null); }}
                                        onClick={() => onTaskClick?.(task)}
                                        style={{
                                            fontSize: '20px', padding: '4px 16px',
                                            backgroundColor: taskColor, color: '#000000',
                                            borderRadius: '26px', whiteSpace: 'nowrap',
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
                        <div style={{ padding: '4px 12px', fontSize: '12px', color: theme.textMuted }}>
                            ここにドロップで日付解除
                        </div>
                    )}
                </div>

                {/* Navigation: ◀ Today ▶ */}
                <button
                    type="button"
                    onClick={() => scrollToMonth(prevMonth.year, prevMonth.month)}
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
                        backgroundColor: theme.primary, color: '#fff',
                        flexShrink: 0,
                    }}
                >
                    Today
                </button>
                <button
                    type="button"
                    onClick={() => scrollToMonth(nextMonth.year, nextMonth.month)}
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
                                fontSize: '16px', fontWeight: '600',
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
                    style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, position: 'relative', scrollbarWidth: 'none' } as React.CSSProperties}
                >
                    {allWeeks.map((week, weekIndex) => {
                        const weekNum = getWeek(week[0]);
                        const segments = allSegments[weekIndex] || [];
                        const maxLane = segments.length > 0 ? Math.max(...segments.map(s => s.lane)) : -1;
                        const rowHeight = Math.max(140, 50 + (maxLane + 1) * 32);

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
                                        paddingTop: '12px', fontSize: '12px',
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
                                                    e.currentTarget.style.backgroundColor = dayBg;
                                                }}
                                                onDrop={(e) => {
                                                    e.currentTarget.style.backgroundColor = dayBg;
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
                                                    backgroundColor: dayBg,
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
                                                            color: '#FFFFFF', fontSize: '18px', fontWeight: '600',
                                                        }}>
                                                            {dayLabel}
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', height: '36px',
                                                            color: textColor, fontSize: '18px', fontWeight: '600',
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
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
